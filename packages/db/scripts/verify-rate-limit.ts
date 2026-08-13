/**
 * Does the rate limiter actually stop anything?
 *
 * A limiter is the easiest thing in a codebase to have and not have. It sits in
 * front of a write, it never fires in normal use, and if it were broken nothing
 * would look wrong until the day it mattered — which is the same shape as every
 * other silent no-op this project has turned up. So it gets counted rather than
 * trusted: call it past the limit and watch the refusals land exactly where the
 * arithmetic says they should.
 *
 * The other half is the boundary. `hit_rate_limit` has EXECUTE revoked from
 * `authenticated`, because a caller who can invoke it directly can exhaust
 * somebody else's allowance by guessing their key — and a member's session is
 * `authenticated`.
 *
 *   pnpm db:verify:rate-limit
 *
 * Needs nothing running. Uses its own bucket and clears it afterwards.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ENV_PATH = resolve(process.cwd(), "apps/web/.env.local");
if (existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !PUBLISHABLE || !SECRET) {
  console.error(`\nNeed all three Supabase keys in ${ENV_PATH}\n`);
  process.exit(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const service: SupabaseClient<any> = createClient(URL_, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anon: SupabaseClient<any> = createClient(URL_, PUBLISHABLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", X = "\x1b[0m";
let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`  ${ok ? G + "✓" : R + "✗"}${X} ${label}${detail ? `  ${D}${detail}${X}` : ""}`);
  if (!ok) failures += 1;
}
const section = (t: string) => console.log(`\n${t}`);

const BUCKET = "verify-probe";
const hit = async (key: string, limit = 3, windowSeconds = 3600) => {
  const { data, error } = await service.rpc("hit_rate_limit", {
    p_bucket: BUCKET,
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error(error.message);
  return data as boolean;
};

async function teardown() {
  await service.from("rate_limits").delete().eq("bucket", BUCKET);
}

async function main() {
  console.log(`\nRate limiting, against ${URL_}\n${D}${"─".repeat(60)}${X}`);

  const { error: probe } = await service.rpc("hit_rate_limit", {
    p_bucket: BUCKET,
    p_key: "existence",
    p_limit: 1,
    p_window_seconds: 60,
  });
  if (probe && (probe.code === "PGRST202" || /could not find the function/i.test(probe.message))) {
    console.log(`\n  ${D}– skipped: needs 0019_rate_limits.sql${X}\n`);
    process.exit(0);
  }
  await teardown();

  try {
    section("Counting");
    {
      const results = [await hit("a"), await hit("a"), await hit("a"), await hit("a")];
      check(
        results.slice(0, 3).every(Boolean),
        "the first three are allowed",
        results.join(","),
      );
      check(results[3] === false, "and the fourth is not");

      const fifth = await hit("a");
      check(fifth === false, "nor the fifth — being over does not wear off inside the window");

      const { data: row } = await service
        .from("rate_limits").select("count").eq("bucket", BUCKET).eq("key", "a").single();
      check(
        row?.count === 5,
        "and refused attempts still count, so retrying earns nothing",
        `count = ${row?.count}`,
      );
    }

    section("Keys are separate");
    {
      check(await hit("b"), "a different key has its own allowance");
      const { data: rows } = await service
        .from("rate_limits").select("key").eq("bucket", BUCKET);
      check(
        new Set((rows ?? []).map((r) => r.key)).size >= 2,
        "counted in its own row",
        `${rows?.length ?? 0} row(s)`,
      );
    }

    section("Windows");
    {
      // A one-second window, so the boundary is reachable without waiting.
      check(await hit("c", 1, 1), "first hit in a one-second window");
      check((await hit("c", 1, 1)) === false, "second is refused");
      await new Promise((r) => setTimeout(r, 1200));
      check(await hit("c", 1, 1), "and the next window starts fresh");
    }

    section("Bad arguments are refused, not silently accepted");
    {
      for (const [limit, windowSeconds, what] of [
        [0, 60, "a limit of zero"],
        [5, 0, "a window of zero"],
        [-1, 60, "a negative limit"],
      ] as const) {
        const { error } = await service.rpc("hit_rate_limit", {
          p_bucket: BUCKET,
          p_key: "bad",
          p_limit: limit,
          p_window_seconds: windowSeconds,
        });
        check(Boolean(error), what, error?.message ?? "NO ERROR — the limit would never fire");
      }
    }

    section("The boundary");
    {
      const { error } = await anon.rpc("hit_rate_limit", {
        p_bucket: BUCKET,
        p_key: "a",
        p_limit: 3,
        p_window_seconds: 3600,
      });
      check(
        Boolean(error),
        "anon cannot call it — otherwise anyone could burn a stranger's allowance",
        error?.message ?? "NO ERROR",
      );

      const { data: read, error: readError } = await anon
        .from("rate_limits").select("key,count").eq("bucket", BUCKET);
      check(
        (read ?? []).length === 0,
        "and cannot read the counters either — that would be a live attempts-remaining display",
        readError?.message ?? `${read?.length ?? 0} row(s)`,
      );
    }

    section("Housekeeping");
    {
      await service.from("rate_limits").insert({
        bucket: BUCKET,
        key: "ancient",
        window_start: new Date(Date.now() - 3 * 86_400_000).toISOString(),
        count: 1,
      });
      const { data: pruned, error } = await service.rpc("prune_rate_limits");
      check(!error && (pruned as number) >= 1, "old windows are prunable", `${pruned} removed`);

      const { data: left } = await service
        .from("rate_limits").select("key").eq("bucket", BUCKET).eq("key", "ancient");
      check(left?.length === 0, "and the old row is gone");
      const { data: recent } = await service
        .from("rate_limits").select("key").eq("bucket", BUCKET).eq("key", "a");
      check(recent?.length === 1, "while this window's is left alone");
    }
  } finally {
    section("Teardown");
    await teardown();
    console.log(`  ${D}probe bucket cleared${X}`);
  }

  console.log(
    failures === 0 ? `\n${G}Every check passed${X}\n` : `\n${R}${failures} check(s) failed${X}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

await main();
