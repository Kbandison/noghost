/**
 * Can a season be edited without anybody knowing who did it?
 *
 * §5 says every mechanic reads its configuration from the `seasons` row, and
 * §7.3 says every admin mutation lands in `admin_audit`. Until 0027 the only
 * way to change a drop time or the price of a seat was a table editor, which
 * satisfies the first and quietly ignores the second.
 *
 *   pnpm db:verify:season-console
 *
 * Needs nothing running. Builds and removes its own season.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ENV_PATH, loadRepoEnv } from "./env";
import { SEED_SEASON } from "../src/seed/data";

loadRepoEnv();

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

const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", X = "\x1b[0m";
let failures = 0, passed = 0, skipped = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`  ${ok ? G + "✓" : R + "✗"}${X} ${label}${detail ? `  ${D}${detail}${X}` : ""}`);
  if (ok) passed += 1;
  else failures += 1;
}
const section = (t: string) => console.log(`\n${t}`);
const skip = (why: string) => {
  skipped += 1;
  console.log(`  ${D}– skipped: ${why}${X}`);
};

const SEASON = "deadbeef-0000-4000-8000-00000000cf01";
const M = { id: "deadbeef-0000-4000-8000-00000000cf02", email: "season-admin@noghost.test" };
const A = { id: "deadbeef-0000-4000-8000-00000000cf03", email: "season-member@noghost.test" };
const PASSWORD = "probe-only-not-a-real-account-a4e2";

async function signIn(email: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: SupabaseClient<any> = createClient(URL_!, PUBLISHABLE!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw new Error(`sign in ${email}: ${error?.message}`);
  return c;
}

async function has0027(): Promise<boolean> {
  const { error } = await service.rpc("update_season", {
    p_season_id: "00000000-0000-0000-0000-000000000000",
  });
  return !(error && (error.code === "PGRST202" || /could not find the function/i.test(error.message)));
}

async function teardown() {
  const ids = [M.id, A.id];
  await service.from("admin_audit").delete().in("admin_id", ids);
  await service.from("admin_users").delete().in("id", ids);
  await service.from("profiles").delete().in("id", ids);
  await service.from("seasons").delete().eq("id", SEASON);
  const { data: page } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const u of page?.users ?? []) {
    if (u.email === M.email || u.email === A.email) await service.auth.admin.deleteUser(u.id);
  }
  for (const id of ids) await service.auth.admin.deleteUser(id).catch(() => {});
}

async function setup() {
  const { error } = await service.from("seasons").insert({
    ...SEED_SEASON, id: SEASON, name: "Console probe", phase: "draft",
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(`season: ${error.message}`);

  for (const who of [M, A]) {
    const { error: ue } = await service.auth.admin.createUser({
      id: who.id, email: who.email, password: PASSWORD,
      email_confirm: true, app_metadata: { seed: true },
    });
    if (ue) throw new Error(`user ${who.email}: ${ue.message}`);
    const { error: pe } = await service.from("profiles").insert({
      id: who.id, first_name: "Probe", birthdate: "1990-06-06",
      gender: "woman", seeking: ["man"], status: "active",
    });
    if (pe) throw new Error(`profile ${who.email}: ${pe.message}`);
  }

  const { error: ae } = await service
    .from("admin_users").upsert({ id: M.id, email: M.email, active: true }, { onConflict: "id" });
  if (ae) throw new Error(`admin: ${ae.message}`);
}

async function main() {
  console.log("\nSeason console — can a season change without anybody knowing who did it?");

  const applied = await has0027();
  console.log(`\n${D}0027: update_season ${applied ? "present" : "MISSING"}${X}`);

  await teardown();
  await setup();

  try {
    const admin = await signIn(M.email);
    const member = await signIn(A.email);

    section("Only an admin may edit");
    if (!applied) {
      skip("update_season is missing — apply 0027_the_season_console.sql");
    } else {
      {
        const { error } = await member.rpc("update_season", {
          p_season_id: SEASON, p_price_early_cents: 1,
        });
        check(Boolean(error), "a member cannot change the price", error ? "refused" : "ALLOWED");
        const { data } = await service
          .from("seasons").select("price_early_cents").eq("id", SEASON).single();
        check(data?.price_early_cents !== 1, "and the price is unchanged", `${data?.price_early_cents}`);
      }
      {
        const { error } = await member.rpc("set_season_phase", {
          p_season_id: SEASON, p_phase: "live",
        });
        check(Boolean(error), "nor publish a season", error ? "refused" : "ALLOWED");
      }

      section("An admin edit lands in the trail, with what changed");
      {
        const { error } = await admin.rpc("update_season", {
          p_season_id: SEASON, p_name: "Console probe renamed", p_price_early_cents: 4500,
        });
        check(!error, "the admin saves two fields", error?.message ?? "");

        const { data: after } = await service
          .from("seasons").select("name,price_early_cents,drop_max").eq("id", SEASON).single();
        check(after?.name === "Console probe renamed" && after?.price_early_cents === 4500,
          "both changed", `${after?.name} / ${after?.price_early_cents}`);
        check(after?.drop_max === SEED_SEASON.drop_max,
          "and a field that was not sent is left alone — null means leave it",
          `drop_max=${after?.drop_max}`);

        const { data: trail } = await service
          .from("admin_audit").select("action,detail")
          .eq("admin_id", M.id).eq("action", "update_season");
        check(trail?.length === 1, "one audit row", `${trail?.length ?? 0}`);

        const detail = (trail?.[0]?.detail ?? {}) as Record<string, { from?: unknown; to?: unknown }>;
        check(
          detail.price_early_cents?.from === 4000 && detail.price_early_cents?.to === 4500,
          "recording the old value and the new one — not just that something changed",
          JSON.stringify(detail.price_early_cents ?? {}),
        );
        check(
          !("drop_max" in detail),
          "and only the fields that moved, so the trail is readable",
          Object.keys(detail).join(", "),
        );
      }
      {
        const before = (await service.from("admin_audit").select("id").eq("admin_id", M.id)).data?.length ?? 0;
        await admin.rpc("update_season", { p_season_id: SEASON, p_name: "Console probe renamed" });
        const after = (await service.from("admin_audit").select("id").eq("admin_id", M.id)).data?.length ?? 0;
        check(after === before, "saving with nothing changed writes no audit row", `${before} → ${after}`);
      }

      section("Phase is its own act, with its own reason");
      {
        const { error } = await admin.rpc("set_season_phase", {
          p_season_id: SEASON, p_phase: "applications_open", p_reason: "Opening the probe season.",
        });
        check(!error, "an admin publishes the draft", error?.message ?? "");
        const { data } = await service.from("seasons").select("phase").eq("id", SEASON).single();
        check(data?.phase === "applications_open", "the phase moved", data?.phase ?? "");

        const { data: trail } = await service
          .from("admin_audit").select("detail").eq("admin_id", M.id).eq("action", "set_season_phase");
        const d = (trail?.[0]?.detail ?? {}) as Record<string, unknown>;
        check(d.from === "draft" && d.to === "applications_open",
          "audited as its own action, from and to", JSON.stringify(d).slice(0, 70));
        check(typeof d.reason === "string" && (d.reason as string).length > 0,
          "with the reason somebody typed");
      }

      section("The seats cap can hold inventory back, not invent scarcity");
      {
        const { error } = await admin.rpc("update_season", {
          p_season_id: SEASON, p_seats_display_cap: 5,
        });
        const { data } = await service
          .from("public_season_stats").select("seats_remaining,member_cap").eq("id", SEASON).maybeSingle();
        check(!error && data?.seats_remaining === 5,
          "a cap of 5 shows 5, not the 300 that are really free",
          `${data?.seats_remaining} of ${data?.member_cap}`);
      }
      {
        // The direction that would be a lie: claiming more than exist.
        const { error } = await admin.rpc("update_season", {
          p_season_id: SEASON, p_seats_display_cap: 99999,
        });
        const { data } = await service
          .from("public_season_stats").select("seats_remaining").eq("id", SEASON).maybeSingle();
        check(!error && (data?.seats_remaining ?? 0) <= SEED_SEASON.member_cap,
          "and a cap above the real number cannot inflate it",
          `${data?.seats_remaining}`);
      }
      {
        const { error } = await admin.rpc("update_season", {
          p_season_id: SEASON, p_seats_display_cap: -1,
        });
        check(Boolean(error), "a negative cap is refused by the database", error ? "refused" : "ALLOWED");
      }
      {
        const { error } = await admin.rpc("update_season", {
          p_season_id: SEASON, p_clear_seats_cap: true,
        });
        const { data } = await service
          .from("public_season_stats").select("seats_remaining").eq("id", SEASON).maybeSingle();
        check(!error && data?.seats_remaining === SEED_SEASON.member_cap,
          "clearing it shows the truth again", `${data?.seats_remaining}`);
      }
    }
  } finally {
    section("Teardown");
    await teardown();
    console.log(`  ${D}probe season removed${X}`);
  }

  const tail = skipped > 0 ? ` ${D}(${skipped} skipped)${X}` : "";
  if (failures > 0) console.log(`\n${R}${failures} check(s) failed${X}${tail}\n`);
  else if (passed === 0)
    console.log(`\n${R}Nothing was verified${X} — every section skipped. This is not a pass.\n`);
  else console.log(`\n${G}${passed} check(s) passed${X}${tail}\n`);

  process.exit(failures === 0 && passed > 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n${R}${error instanceof Error ? error.message : String(error)}${X}\n`);
  process.exit(1);
});
