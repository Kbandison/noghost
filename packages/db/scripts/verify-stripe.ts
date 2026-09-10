/**
 * Can somebody grant themselves a paid seat?
 *
 * `season_members` is the row every mechanic keys off — the drop, the fuse, the
 * member gate — and 0006 says its insert is "service-role only (the Stripe
 * webhook)". That webhook did not exist until now, so this is the first time
 * the claim has been testable.
 *
 * The failure modes here cost money in both directions: an unverified endpoint
 * hands out free seats, and a non-idempotent one double-charges somebody who
 * then has to be refunded by hand. Both are asserted below against the real
 * route.
 *
 *   pnpm --filter @noghost/web dev
 *   pnpm db:verify:stripe
 *
 * Builds and removes its own world. Signs its own payloads, so it needs
 * `STRIPE_WEBHOOK_SECRET` but never talks to Stripe.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { resolve } from "node:path";
import { ENV_PATH, loadRepoEnv } from "./env";
import { SEED_SEASON } from "../src/seed/data";

loadRepoEnv();

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
if (!URL_ || !SECRET) {
  console.error(`\nNeed Supabase keys in ${ENV_PATH}\n`);
  process.exit(1);
}

const BASE = "http://localhost:3000";
const HOOK = `${BASE}/api/stripe/webhook`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: SupabaseClient<any> = createClient(URL_, SECRET, {
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

const MEMBER = "deadbeef-0000-4000-8000-0000000053a1";
const SEASON = "deadbeef-0000-4000-8000-0000000053b1";
const EMAIL = "stripe-probe@noghost.test";

/** A Stripe-signed payload, built the way Stripe builds one. */
function signed(body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

const event = (id: string, intent: string, over: Record<string, unknown> = {}) =>
  JSON.stringify({
    id,
    object: "event",
    type: "checkout.session.completed",
    api_version: "2026-08-26.dahlia",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `cs_${id}`,
        object: "checkout.session",
        payment_status: "paid",
        amount_total: 4000,
        payment_intent: intent,
        client_reference_id: MEMBER,
        metadata: { user_id: MEMBER, season_id: SEASON, tier: "early_bird" },
        ...over,
      },
    },
  });

const post = (body: string, signature: string | null) =>
  fetch(HOOK, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(signature ? { "stripe-signature": signature } : {}),
    },
    body,
  });

async function teardown() {
  await db.from("season_members").delete().eq("user_id", MEMBER);
  await db.from("applications").delete().eq("user_id", MEMBER);
  await db.from("profiles").delete().eq("id", MEMBER);
  await db.from("seasons").delete().eq("id", SEASON);
  await db.from("processed_webhook_events").delete().like("id", "evt_probe%");
  await db.auth.admin.deleteUser(MEMBER).catch(() => {});
  const { data: page } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const u of page?.users ?? []) if (u.email === EMAIL) await db.auth.admin.deleteUser(u.id);
}

async function setup() {
  const { error: seasonError } = await db.from("seasons").insert({
    ...SEED_SEASON,
    id: SEASON,
    name: "Stripe probe season",
    phase: "applications_open",
    created_at: new Date().toISOString(),
  });
  if (seasonError) throw new Error(`season: ${seasonError.message}`);

  const { error: userError } = await db.auth.admin.createUser({
    id: MEMBER, email: EMAIL, password: "probe-only-not-a-real-account-a4e2",
    email_confirm: true, app_metadata: { seed: true },
  });
  if (userError) throw new Error(`user: ${userError.message}`);

  const { error: profileError } = await db.from("profiles").insert({
    id: MEMBER, first_name: "Stripe probe", birthdate: "1990-06-06",
    gender: "woman", seeking: ["man"], status: "active", email: EMAIL,
  });
  if (profileError) throw new Error(`profile: ${profileError.message}`);

  const { error: appError } = await db.from("applications").insert({
    user_id: MEMBER, season_id: SEASON, status: "admitted",
    claim_deadline: new Date(Date.now() + 72 * 3600_000).toISOString(),
  });
  if (appError) throw new Error(`application: ${appError.message}`);
}

async function main() {
  console.log("\nStripe — can somebody grant themselves a paid seat?");

  const up = await fetch(BASE).then((r) => r.ok, () => false);
  const configured = Boolean(process.env.STRIPE_SECRET_KEY && WEBHOOK_SECRET);

  await teardown();
  await setup();

  try {
    section("The endpoint refuses what it cannot verify");
    if (!up) {
      skip(`no dev server on ${BASE} — run: pnpm --filter @noghost/web dev`);
    } else if (!configured) {
      // The route 404s without keys, which is correct and also means none of
      // the assertions below say anything. Skipped rather than passed.
      const res = await post(event("evt_probe_nokeys", "pi_probe_nokeys"), "t=1,v1=nope");
      check(res.status === 404, "with no Stripe keys the route does not exist", `HTTP ${res.status}`);
      skip("STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET are unset — nothing else can be exercised");
    } else {
      {
        const body = event("evt_probe_unsigned", "pi_probe_unsigned");
        const res = await post(body, null);
        check(res.status === 400, "no signature is refused", `HTTP ${res.status}`);
      }
      {
        const body = event("evt_probe_forged", "pi_probe_forged");
        // A correctly-shaped signature over the right body with the wrong key:
        // the exact thing an attacker can produce.
        const res = await post(body, signed(body, "whsec_not_the_real_secret"));
        check(res.status === 400, "a signature from the wrong secret is refused", `HTTP ${res.status}`);

        const { data } = await db.from("season_members").select("id").eq("user_id", MEMBER);
        check(data?.length === 0, "and no seat was granted by it", `${data?.length ?? 0} row(s)`);
      }
      {
        // Stripe's own tolerance is five minutes; an old signature is a replay.
        const body = event("evt_probe_stale", "pi_probe_stale");
        const old = Math.floor(Date.now() / 1000) - 3600;
        const res = await post(body, signed(body, WEBHOOK_SECRET!, old));
        check(res.status === 400, "an hour-old signature is refused", `HTTP ${res.status}`);
      }

      section("A real payment becomes a seat, once");
      {
        const body = event("evt_probe_paid", "pi_probe_paid");
        const res = await post(body, signed(body, WEBHOOK_SECRET!));
        check(res.ok, "a signed event is accepted", `HTTP ${res.status}`);

        const { data } = await db
          .from("season_members")
          .select("stripe_payment_intent,price_paid_cents,season_id")
          .eq("user_id", MEMBER);
        check(data?.length === 1, "exactly one membership exists", `${data?.length ?? 0}`);
        check(data?.[0]?.stripe_payment_intent === "pi_probe_paid", "recording the payment intent");
        check(data?.[0]?.price_paid_cents === 4000, "and what was actually charged",
          `${data?.[0]?.price_paid_cents}`);

        const { data: app } = await db
          .from("applications").select("status").eq("user_id", MEMBER).maybeSingle();
        check(app?.status === "claimed", "the application follows the money", app?.status ?? "gone");
      }
      {
        // Stripe retries on any non-2xx and redelivers on its own schedule.
        const body = event("evt_probe_paid", "pi_probe_paid");
        const res = await post(body, signed(body, WEBHOOK_SECRET!));
        check(res.ok, "a redelivery is accepted rather than erroring", `HTTP ${res.status}`);
        const { data } = await db.from("season_members").select("id").eq("user_id", MEMBER);
        check(data?.length === 1, "and does not create a second membership — a double charge",
          `${data?.length ?? 0} row(s)`);
      }
      {
        // A different event id carrying the same intent: the ledger does not
        // catch this one, the unique column underneath it does.
        const body = event("evt_probe_paid_again", "pi_probe_paid");
        const res = await post(body, signed(body, WEBHOOK_SECRET!));
        const { data } = await db.from("season_members").select("id").eq("user_id", MEMBER);
        check(res.ok && data?.length === 1,
          "a new event for the same payment is also only one seat",
          `HTTP ${res.status}, ${data?.length ?? 0} row(s)`);
      }

      section("What it will not turn into a seat");
      {
        const body = event("evt_probe_unpaid", "pi_probe_unpaid", { payment_status: "unpaid" });
        const res = await post(body, signed(body, WEBHOOK_SECRET!));
        const { data } = await db.from("season_members").select("id").eq("stripe_payment_intent", "pi_probe_unpaid");
        check(res.ok && data?.length === 0, "an unpaid session is not a seat", `${data?.length ?? 0} row(s)`);
      }
      {
        const body = event("evt_probe_nometa", "pi_probe_nometa", {
          metadata: {}, client_reference_id: null,
        });
        const res = await post(body, signed(body, WEBHOOK_SECRET!));
        const { data } = await db.from("season_members").select("id").eq("stripe_payment_intent", "pi_probe_nometa");
        check(
          res.ok && data?.length === 0,
          "a session with no attribution is closed, not retried forever",
          `HTTP ${res.status}, ${data?.length ?? 0} row(s)`,
        );
      }
      {
        const body = JSON.stringify({
          id: "evt_probe_other", object: "event", type: "customer.created",
          created: Math.floor(Date.now() / 1000), data: { object: { id: "cus_x" } },
        });
        const res = await post(body, signed(body, WEBHOOK_SECRET!));
        check(res.ok, "an event it does not handle gets a 200, not a retry storm", `HTTP ${res.status}`);
      }
    }
  } finally {
    section("Teardown");
    await teardown();
    console.log(`  ${D}probe world removed${X}`);
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
