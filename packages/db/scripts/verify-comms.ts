/**
 * Can an admin say something to a cohort, and can anyone else?
 *
 * §7.3's Comms module: "Broadcast announcement to cohort (in-app + optional
 * email), template preview/test-send for every notification in §8". A broadcast
 * is the only message in the product whose words are not in §9, which makes it
 * the only one where the authorisation question is interesting — a console loop
 * holding a service key would put "only an admin may do this" in the one place
 * where forgetting it is invisible.
 *
 *   pnpm db:verify:comms
 *
 * Needs nothing running. Builds and removes its own world.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { SEED_SEASON } from "../src/seed/data";

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

/** M is the admin. A and B are in the season; C paid for a different one. */
const PEOPLE = [
  { key: "M", id: "deadbeef-0000-4000-8000-00000000bc01", name: "Comms M" },
  { key: "A", id: "deadbeef-0000-4000-8000-00000000bc02", name: "Comms A" },
  { key: "B", id: "deadbeef-0000-4000-8000-00000000bc03", name: "Comms B" },
  { key: "C", id: "deadbeef-0000-4000-8000-00000000bc04", name: "Comms C" },
] as const;

const SEASON = "deadbeef-0000-4000-8000-00000000bd01";
const OTHER_SEASON = "deadbeef-0000-4000-8000-00000000bd02";
const PASSWORD = "probe-only-not-a-real-account-a4e2";
const email = (key: string) => `comms-probe-${key.toLowerCase()}@noghost.test`;

async function signIn(key: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: SupabaseClient<any> = createClient(URL_!, PUBLISHABLE!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: email(key),
    password: PASSWORD,
  });
  if (error || !data.session) throw new Error(`sign in ${key}: ${error?.message ?? "no session"}`);
  return client;
}

/** Probed by calling it — PostgREST resolves by name *and* parameter names. */
async function has0023(): Promise<boolean> {
  const { error } = await service.rpc("broadcast_to_season", {
    p_season_id: "00000000-0000-0000-0000-000000000000",
    p_body: "probe",
    p_email: false,
  });
  return !(error && (error.code === "PGRST202" || /could not find the function/i.test(error.message)));
}

async function teardown() {
  const ids = PEOPLE.map((p) => p.id);
  await service.from("notifications").delete().in("user_id", ids);
  await service.from("admin_audit").delete().in("admin_id", ids);
  await service.from("admin_users").delete().in("id", ids);
  await service.from("season_members").delete().in("user_id", ids);
  await service.from("profiles").delete().in("id", ids);
  await service.from("seasons").delete().in("id", [SEASON, OTHER_SEASON]);

  const wanted = new Set(PEOPLE.map((p) => email(p.key)));
  const { data: page } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const user of page?.users ?? []) {
    if (user.email && wanted.has(user.email)) {
      await service.from("profiles").delete().eq("id", user.id);
      await service.auth.admin.deleteUser(user.id).catch(() => {});
    }
  }
  for (const person of PEOPLE) await service.auth.admin.deleteUser(person.id).catch(() => {});
}

async function setup() {
  for (const id of [SEASON, OTHER_SEASON]) {
    const { error } = await service.from("seasons").insert({
      ...SEED_SEASON,
      id,
      name: `Comms probe ${id.slice(-4)}`,
      phase: "live",
      created_at: new Date().toISOString(),
    });
    if (error) throw new Error(`season: ${error.message}`);
  }

  for (const person of PEOPLE) {
    const { error } = await service.auth.admin.createUser({
      id: person.id,
      email: email(person.key),
      password: PASSWORD,
      email_confirm: true,
      app_metadata: { seed: true },
    });
    if (error) throw new Error(`create ${person.key}: ${error.message}`);

    // M deliberately gets no profile until the last section — that is the
    // "an admin who was never a member" case the test-send has to handle.
    if (person.key === "M") continue;

    const { error: profileError } = await service.from("profiles").insert({
      id: person.id,
      first_name: person.name,
      birthdate: "1990-06-06",
      gender: "woman",
      seeking: ["man"],
      status: "active",
    });
    if (profileError) throw new Error(`profile ${person.key}: ${profileError.message}`);
  }

  const [m, a, b, c] = PEOPLE;

  for (const [person, season] of [
    [a, SEASON],
    [b, SEASON],
    [c, OTHER_SEASON],
  ] as const) {
    const { error } = await service.from("season_members").insert({
      user_id: person!.id,
      season_id: season,
      stripe_payment_intent: `pi_deadbeef_comms_${person!.key}`,
      price_paid_cents: SEED_SEASON.price_standard_cents,
    });
    if (error) throw new Error(`member ${person!.key}: ${error.message}`);
  }

  const { error: adminError } = await service
    .from("admin_users")
    .upsert({ id: m!.id, email: email("M"), active: true }, { onConflict: "id" });
  if (adminError) throw new Error(`admin: ${adminError.message}`);
}

const broadcasts = async (userId: string) =>
  (
    await service
      .from("notifications")
      .select("id,channel,payload")
      .eq("user_id", userId)
      .eq("template", "broadcast")
  ).data ?? [];

async function main() {
  console.log("\nComms — can an admin say something to a cohort, and can anyone else?");

  const applied = await has0023();
  console.log(`\n${D}0023: broadcast_to_season ${applied ? "present" : "MISSING"}${X}`);

  await teardown();
  await setup();

  try {
    const clientM = await signIn("M");
    const clientA = await signIn("A");
    const [m, a, b, c] = PEOPLE;

    section("A broadcast reaches the season, and only the season");
    if (!applied) {
      skip("broadcast_to_season is missing — apply 0023_broadcasts.sql");
    } else {
      const BODY = "The finale venue is booked — details on Friday.";

      {
        const { data, error } = await clientM.rpc("broadcast_to_season", {
          p_season_id: SEASON,
          p_body: BODY,
          p_email: false,
        });
        check(!error && data === 2, "M announces to both members", error?.message ?? `${data} row(s)`);
      }

      {
        const rows = await broadcasts(a!.id);
        check(rows.length === 1, "A has it", `${rows.length} row(s)`);
        check(rows[0]?.channel === "inapp", "in-app, which is where the banner reads it", rows[0]?.channel ?? "");
        check(
          (rows[0]?.payload as { body?: string })?.body === BODY,
          "carrying the words themselves — §9 has none for this one",
        );
        check((await broadcasts(b!.id)).length === 1, "and so does B");
      }

      {
        const rows = await broadcasts(c!.id);
        check(rows.length === 0, "C, who paid for a different season, does not", `${rows.length} row(s)`);
      }

      {
        const { data } = await clientM.rpc("broadcast_to_season", {
          p_season_id: SEASON,
          p_body: "Second announcement.",
          p_email: true,
        });
        const rows = await broadcasts(a!.id);
        check(data === 4, "asking for email doubles the rows, one per channel", `${data} row(s)`);
        check(
          rows.filter((row) => row.channel === "email").length === 1,
          "A gets exactly one email row",
        );
      }

      {
        // Not idempotent on purpose: two identical announcements are two
        // decisions somebody made, and swallowing the second would decide for
        // them. Pinned so nobody "fixes" it later.
        const before = (await broadcasts(a!.id)).length;
        await clientM.rpc("broadcast_to_season", {
          p_season_id: SEASON,
          p_body: "Second announcement.",
          p_email: false,
        });
        const after = (await broadcasts(a!.id)).length;
        check(after === before + 1, "sending the same words twice announces twice", `${before} → ${after}`);
      }
    }

    section("Only an admin");
    if (!applied) {
      skip("0023 is not applied");
    } else {
      {
        const { error } = await clientA.rpc("broadcast_to_season", {
          p_season_id: SEASON,
          p_body: "I am not an admin.",
          p_email: false,
        });
        check(Boolean(error), "a member cannot broadcast", error ? "refused" : "ALLOWED");
      }
      {
        const { error } = await clientM.rpc("broadcast_to_season", {
          p_season_id: SEASON,
          p_body: "   ",
          p_email: false,
        });
        check(Boolean(error), "and an empty announcement is refused", error ? "refused" : "ALLOWED");
      }
      {
        const { error } = await clientM.rpc("broadcast_to_season", {
          p_season_id: SEASON,
          p_body: "x".repeat(1001),
          p_email: false,
        });
        check(Boolean(error), "as is one too long to land on a phone", error ? "refused" : "ALLOWED");
      }
    }

    section("The words are in the audit trail, not just the count");
    if (!applied) {
      skip("0023 is not applied");
    } else {
      const { data } = await service
        .from("admin_audit")
        .select("action,detail")
        .eq("admin_id", m!.id)
        .eq("action", "broadcast");
      check((data ?? []).length >= 1, "every broadcast is audited", `${data?.length ?? 0} row(s)`);
      const bodies = (data ?? []).map((row) => (row.detail as { body?: string })?.body ?? "");
      check(
        bodies.some((body) => body.includes("finale venue")),
        "with what was actually said — a count would record that something was said, not what",
      );
    }

    section("A test send goes to the sender and nowhere else");
    if (!applied) {
      skip("0023 is not applied");
    } else {
      {
        // M has no profile row yet: `notifications.user_id` references
        // `profiles`, so this must name the reason rather than surface an FK.
        const { error } = await clientM.rpc("send_test_notification", {
          p_template: "connect_accepted",
          p_channel: "push",
          p_payload: {},
        });
        check(
          Boolean(error) && /member profile/i.test(error?.message ?? ""),
          "an admin with no member profile is told why, not shown a constraint",
          error?.message?.slice(0, 60) ?? "ALLOWED",
        );
      }

      await service.from("profiles").insert({
        id: m!.id,
        first_name: "Comms M",
        birthdate: "1990-06-06",
        gender: "woman",
        seeking: ["man"],
        status: "active",
      });

      {
        const { error } = await clientM.rpc("send_test_notification", {
          p_template: "connect_accepted",
          p_channel: "push",
          p_payload: { chat_id: SEASON },
        });
        const { data } = await service
          .from("notifications")
          .select("user_id,template,payload")
          .eq("user_id", m!.id)
          .eq("template", "connect_accepted");
        check(!error && data?.length === 1, "M can rehearse a template on themselves", error?.message ?? "");
        check(
          (data?.[0]?.payload as { test?: boolean })?.test === true,
          "and it is marked a test, so a rehearsal is not mistaken for a delivery",
        );
      }

      {
        const { error } = await clientA.rpc("send_test_notification", {
          p_template: "connect_accepted",
          p_channel: "push",
          p_payload: {},
        });
        check(Boolean(error), "a member cannot test-send at all", error ? "refused" : "ALLOWED");
      }

      {
        // The reason `enqueue_notification` stays ungranted: there must be no
        // path from a signed-in session to "send anything to anyone".
        const { error } = await clientM.rpc("enqueue_notification", {
          p_user: a!.id,
          p_channel: "push",
          p_template: "connect_accepted",
          p_payload: {},
        });
        check(
          Boolean(error),
          "not even an admin can enqueue against another member directly",
          error ? "refused" : "ALLOWED",
        );
      }
    }
  } finally {
    section("Teardown");
    await teardown();
    console.log(`  ${D}probe world removed${X}`);
  }

  const tail = skipped > 0 ? ` ${D}(${skipped} section(s) skipped)${X}` : "";
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
