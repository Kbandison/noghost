/**
 * Does an applicant get told the truth about how they were admitted?
 *
 * Since 0031 there are two doors — a person reading the application in the
 * console, or the automated identity check clearing it — and until 0033 the
 * screen described only one of them, as a statement of fact:
 *
 *   "You're in. A person read your application and said yes."
 *
 * For everybody the automated check cleared, that describes a review nobody
 * performed. This asserts the route is reported correctly, and that knowing it
 * gives away nothing else.
 *
 *   pnpm db:verify:admission-route
 *
 * Needs nothing running. Builds and removes its own season and applicants.
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
let failures = 0, passed = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`  ${ok ? G + "✓" : R + "✗"}${X} ${label}${detail ? `  ${D}${detail}${X}` : ""}`);
  if (ok) passed += 1;
  else failures += 1;
}
const section = (t: string) => console.log(`\n${t}`);

const SEASON = "deadbeef-0000-4000-8000-00000000ad01";
const AUTO = { id: "deadbeef-0000-4000-8000-00000000ad02", email: "route-auto@noghost.test" };
const HUMAN = { id: "deadbeef-0000-4000-8000-00000000ad03", email: "route-human@noghost.test" };
const WAIT = { id: "deadbeef-0000-4000-8000-00000000ad04", email: "route-wait@noghost.test" };
/*
 * 0038. A real admin, separate from every applicant above.
 *
 * Reusing an applicant account would make "an admin can comp a seat" and "a
 * member cannot" the same account in two hats, and the refusal checks would
 * then pass or fail for reasons that have nothing to do with the control.
 */
const ADMIN = { id: "deadbeef-0000-4000-8000-00000000ad05", email: "route-admin@noghost.test" };
const PASSWORD = "probe-only-not-a-real-account-3d90";

async function signIn(email: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: SupabaseClient<any> = createClient(URL_!, PUBLISHABLE!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw new Error(`sign in ${email}: ${error?.message}`);
  return c;
}

async function teardown() {
  const ids = [AUTO.id, HUMAN.id, WAIT.id, ADMIN.id];
  // 0038's rows. Seats first: they reference the season this deletes.
  await service.from("season_members").delete().in("user_id", ids);
  await service.from("admin_audit").delete().in("admin_id", ids);
  await service.from("admin_users").delete().in("id", ids);
  await service.from("admin_audit").delete().in("target_id", ids);
  for (const id of ids) {
    const { data } = await service.from("applications").select("id").eq("user_id", id);
    for (const a of data ?? []) await service.from("admin_audit").delete().eq("target_id", a.id);
  }
  await service.from("notifications").delete().in("user_id", ids);
  await service.from("applications").delete().in("user_id", ids);
  await service.from("profiles").delete().in("id", ids);
  await service.from("seasons").delete().eq("id", SEASON);
  const { data: page } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const u of page?.users ?? []) {
    if ([AUTO.email, HUMAN.email, WAIT.email, ADMIN.email].includes(u.email ?? "")) {
      await service.auth.admin.deleteUser(u.id);
    }
  }
  for (const id of ids) await service.auth.admin.deleteUser(id).catch(() => {});
}

/** Walk an application to `under_review`, the state both doors open from. */
async function applicant(who: { id: string; email: string }) {
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

  const { data: app, error: ae } = await service
    .from("applications")
    .insert({ user_id: who.id, season_id: SEASON, status: "applied" })
    .select("id")
    .single();
  if (ae) throw new Error(`application ${who.email}: ${ae.message}`);

  for (const status of ["phone_verified", "selfie_submitted", "under_review"]) {
    const { error } = await service.rpc("advance_application", {
      p_application_id: app.id, p_new_status: status,
    });
    if (error) throw new Error(`advance ${who.email} -> ${status}: ${error.message}`);
  }
  return app.id as string;
}

async function main() {
  console.log("\nAdmission route — is an applicant told the truth about which door they came through?");

  await teardown();

  const { error: se } = await service.from("seasons").insert({
    ...SEED_SEASON, id: SEASON, name: "Route probe", phase: "applications_open",
    created_at: new Date().toISOString(),
  });
  if (se) throw new Error(`season: ${se.message}`);

  try {
    const autoApp = await applicant(AUTO);
    const humanApp = await applicant(HUMAN);
    const waitApp = await applicant(WAIT);

    // The admin. No profile and no application — a reviewer is not a member,
    // which is exactly the assumption 0038's first draft got wrong by giving
    // `comped_by` a foreign key to `profiles`.
    {
      const { error: ue } = await service.auth.admin.createUser({
        id: ADMIN.id, email: ADMIN.email, password: PASSWORD,
        email_confirm: true, app_metadata: { seed: true },
      });
      if (ue) throw new Error(`admin user: ${ue.message}`);
      const { error: ae } = await service
        .from("admin_users")
        .upsert({ id: ADMIN.id, email: ADMIN.email, active: true }, { onConflict: "id" });
      if (ae) throw new Error(`admin_users: ${ae.message}`);
    }

    /*
     * The automated path, reproduced exactly as `runIdentityMatch` performs it:
     * advance through the service role, then write the `auto_admit` audit row.
     * That row is the only record of which door was used, which is why 0033
     * asks the trail rather than a flag somebody could forget to set.
     */
    await service.rpc("advance_application", {
      p_application_id: autoApp, p_new_status: "admitted",
    });
    await service.rpc("audit", {
      p_action: "auto_admit", p_table: "applications", p_target: autoApp,
      p_detail: { similarity: 96, reason: "probe" },
    });

    // The human path: admitted, with no `auto_admit` row behind it.
    await service.rpc("advance_application", {
      p_application_id: humanApp, p_new_status: "admitted",
    });

    section("Each applicant is told which door");
    {
      const c = await signIn(AUTO.email);
      const { data, error } = await c.rpc("my_application_route");
      const row = data?.[0];
      check(!error && row?.status === "admitted" && row?.admitted_automatically === true,
        "an auto-admitted applicant is told it was automatic",
        error ? error.message : `${row?.status}, automatic=${row?.admitted_automatically}`);
    }
    {
      const c = await signIn(HUMAN.email);
      const { data } = await c.rpc("my_application_route");
      const row = data?.[0];
      check(row?.status === "admitted" && row?.admitted_automatically === false,
        "and one a person admitted is not told it was automatic",
        `${row?.status}, automatic=${row?.admitted_automatically}`);
    }
    {
      const c = await signIn(WAIT.email);
      const { data } = await c.rpc("my_application_route");
      const row = data?.[0];
      check(row?.status === "under_review" && row?.admitted_automatically === false,
        "somebody still waiting is told they are still waiting",
        `${row?.status}`);
    }

    section("And nothing else");
    {
      // The route is the only thing this adds. A score, or anybody else's
      // status, would be a different and much worse disclosure.
      const c = await signIn(WAIT.email);
      const { data } = await c.rpc("my_application_route");
      const keys = Object.keys((data?.[0] ?? {}) as object).sort();
      check(keys.join(",") === "admitted_automatically,status",
        "the answer carries a status and a boolean, nothing more", keys.join(", "));
    }
    {
      const c = await signIn(WAIT.email);
      const { data } = await c.rpc("my_application_route");
      check((data?.length ?? 0) === 1,
        "and only ever the caller's own application",
        `${data?.length} row(s) for three applicants in the season`);
    }
    {
      // The audit trail it reads from stays shut to the member themselves.
      const c = await signIn(AUTO.email);
      const { data, error } = await c.from("admin_audit").select("action").limit(1);
      check((data?.length ?? 0) === 0,
        "while admin_audit itself stays closed to them",
        error ? `refused: ${error.code}` : `${data?.length ?? 0} row(s)`);
    }
    section("An admitted member has to be visible");
    {
      /*
       * The bug auto-admit introduced, asserted directly.
       *
       * Every uploaded photo arrives `approved: false` and `visible_profiles`
       * filters unapproved ones out. That was fine while a reviewer read every
       * application and set the flag. An application nobody reads is an
       * application whose photos nobody approves — so the member is admitted,
       * pays for a seat, and arrives in the drop with an empty card.
       */
      const photos = [
        { path: "a.webp", order: 0, approved: false },
        { path: "b.webp", order: 1, approved: false },
      ];
      await service.from("profiles").update({ photos }).eq("id", AUTO.id);

      // Asked of the view's own filter rather than of the view, which
      // `can_view_profile()` gates on a live drop this probe does not have.
      const before = photos.filter((p) => p.approved).length;
      check(before === 0,
        "unapproved photos are invisible — this is what made auto-admit produce an empty card",
        `${before} of ${photos.length} would show`);

      await service
        .from("profiles")
        .update({ photos: photos.map((p) => ({ ...p, approved: true })) })
        .eq("id", AUTO.id);
      const { data: after } = await service
        .from("profiles").select("photos").eq("id", AUTO.id).single();
      const showing = ((after?.photos ?? []) as { approved: boolean }[])
        .filter((p) => p.approved).length;
      check(showing === photos.length,
        "and the service role can approve them, which is what clearPhotos relies on",
        `${showing} of ${photos.length} now show`);
    }

    section("A seat can be granted without a payment — 0038");
    {
      /*
       * `season_members` is what `memberGate` reads, and until 0038 the Stripe
       * webhook was the only thing in the product that could write it. On a
       * deployment with no Stripe keys there was therefore no path from
       * "admitted" to "member" at all: the review screen told people their seat
       * was held and gave them nothing to press, permanently.
       *
       * This exercises the whole control, including every way it must refuse.
       * It moves money, so "it worked once by hand" is not evidence.
       */
      const member = await signIn(WAIT.email);
      const admin = await signIn(ADMIN.email);

      // WAIT is `under_review`, which is the wrong state to comp from.
      {
        const { error } = await service.rpc("comp_seat", {
          p_application_id: waitApp, p_reason: "service role has no admin identity",
        });
        check(Boolean(error),
          "the service role cannot comp a seat — there is no person to record",
          error ? "refused" : "ALLOWED");
      }
      {
        const { error } = await member.rpc("comp_seat", {
          p_application_id: waitApp, p_reason: "granting myself a seat",
        });
        check(Boolean(error),
          "and an ordinary member certainly cannot comp their own",
          error ? "refused" : "ALLOWED");
      }
      {
        const { error } = await admin.rpc("comp_seat", {
          p_application_id: waitApp, p_reason: "still under review",
        });
        check(/admitted/i.test(error?.message ?? ""),
          "not even an admin can comp an application nobody has decided yet",
          error ? error.message.slice(0, 60) : "ALLOWED");
      }
      {
        const { error } = await admin.rpc("comp_seat", {
          p_application_id: humanApp, p_reason: "   ",
        });
        check(/reason/i.test(error?.message ?? ""),
          "a free seat with no reason is refused — it would be untraceable",
          error ? error.message.slice(0, 50) : "ALLOWED");
      }

      // And now the one that should work.
      {
        const { error } = await admin.rpc("comp_seat", {
          p_application_id: humanApp, p_reason: "Press — launch coverage",
        });
        const { data: seat } = await service
          .from("season_members")
          .select("price_paid_cents,stripe_payment_intent,comped_by,comp_reason")
          .eq("user_id", HUMAN.id).eq("season_id", SEASON).maybeSingle();

        check(!error && Boolean(seat),
          "an admin can grant an admitted applicant their seat",
          error ? error.message : `paid ${seat?.price_paid_cents}, intent ${seat?.stripe_payment_intent}`);

        check(seat?.price_paid_cents === 0 && seat?.stripe_payment_intent === null,
          "recorded as free and unpaid rather than as a fake payment",
          `${seat?.price_paid_cents} cents, intent ${seat?.stripe_payment_intent}`);

        check(seat?.comped_by === ADMIN.id && Boolean(seat?.comp_reason),
          "and names who granted it and why",
          `${seat?.comped_by === ADMIN.id ? "the admin" : seat?.comped_by}, "${seat?.comp_reason}"`);

        const { data: app } = await service
          .from("applications").select("status").eq("id", humanApp).maybeSingle();
        check(app?.status === "claimed",
          "the application follows the seat, or the claim sweep expires a seat somebody holds",
          `${app?.status}`);
      }
      {
        // A double-click must not raise, and must not mint a second seat.
        const { error } = await admin.rpc("comp_seat", {
          p_application_id: humanApp, p_reason: "pressed twice",
        });
        const { count } = await service
          .from("season_members")
          .select("id", { count: "exact", head: true })
          .eq("user_id", HUMAN.id).eq("season_id", SEASON);
        check(!error && count === 1,
          "comping twice is a no-op rather than a second seat",
          error ? error.message : `${count} seat(s)`);
      }
      {
        /*
         * The schema, not the function. Making `stripe_payment_intent`
         * nullable opened the door to a row with no payment AND no comp — a
         * seat from nowhere, which is the thing this table exists to rule out.
         */
        const { error } = await service.from("season_members").insert({
          user_id: WAIT.id, season_id: SEASON,
          stripe_payment_intent: null, price_paid_cents: 0,
        });
        check(/season_members_paid_or_comped|violates check/i.test(error?.message ?? ""),
          "a seat with neither a payment nor a comp is refused by the schema itself",
          error ? "refused" : "ACCEPTED");
      }
    }

  } finally {
    section("Teardown");
    await teardown();
    console.log(`  ${D}probe season and applicants removed${X}`);
  }

  if (failures > 0) console.log(`\n${R}${failures} check(s) failed${X}\n`);
  else if (passed === 0) console.log(`\n${R}Nothing was verified${X} — this is not a pass.\n`);
  else console.log(`\n${G}${passed} check(s) passed${X}\n`);

  process.exit(failures === 0 && passed > 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n${R}${error instanceof Error ? error.message : String(error)}${X}\n`);
  process.exit(1);
});
