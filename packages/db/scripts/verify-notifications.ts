/**
 * Does a notification actually reach anybody, and can a member forge one?
 *
 * `notifications` has been filling since 0005 with nothing to drain it. 0022
 * adds the two terminal states a queue row needs, a place for a push
 * subscription to live, and the guard that stops a member re-sending their own
 * notifications. `notification-sweep` is the drain. This proves all of it, and
 * the parts it cannot prove it skips rather than passes.
 *
 *   pnpm db:verify:notifications
 *
 * The DB half needs nothing running. The sweep half drives the real endpoint
 * and needs a dev server on port 3000:
 *
 *   pnpm --filter @noghost/web dev
 *
 * Builds and removes its own world.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createECDH, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { SEED_SEASON } from "../src/seed/data";
import { ENV_PATH, loadRepoEnv } from "./env";

loadRepoEnv();

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const CRON = process.env.CRON_SECRET;
if (!URL_ || !PUBLISHABLE || !SECRET) {
  console.error(`\nNeed all three Supabase keys in ${ENV_PATH}\n`);
  process.exit(1);
}

const BASE = "http://localhost:3000";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const service: SupabaseClient<any> = createClient(URL_, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", X = "\x1b[0m";
let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`  ${ok ? G + "✓" : R + "✗"}${X} ${label}${detail ? `  ${D}${detail}${X}` : ""}`);
  if (ok) passed += 1;
  else failures += 1;
}
const section = (t: string) => console.log(`\n${t}`);

/*
 * Skips are counted, not just printed. A run where every section skipped used
 * to end "Every check passed", which is the exact failure this file is about:
 * a green that means nothing was tested rather than nothing was wrong.
 */
let passed = 0;
let skipped = 0;
const skip = (why: string) => {
  skipped += 1;
  console.log(`  ${D}– skipped: ${why}${X}`);
};

/** A gets the notifications. B is a second member. M is an admin. */
const PEOPLE = [
  { key: "A", id: "deadbeef-0000-4000-8000-00000011a001", name: "Notify A" },
  { key: "B", id: "deadbeef-0000-4000-8000-00000011b002", name: "Notify B" },
  { key: "M", id: "deadbeef-0000-4000-8000-00000011c003", name: "Notify M" },
] as const;

const CHAT = "deadbeef-0000-4000-8000-00000011d001";
const CONNECT = "deadbeef-0000-4000-8000-00000011e001";
const PASSWORD = "probe-only-not-a-real-account-a4e2";
const email = (key: string) => `notify-probe-${key.toLowerCase()}@noghost.test`;

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

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

/**
 * Probed by reading the column, because a verifier that assumes 0022 landed
 * would report every "a member cannot do X" check as passing on a table where
 * the guard does not exist — green for exactly the wrong reason.
 */
async function has0022(): Promise<{ columns: boolean; table: boolean }> {
  const { error: columnError } = await service
    .from("notifications")
    .select("id,skipped_at,skip_reason")
    .limit(1);
  const { error: tableError } = await service.from("push_subscriptions").select("id").limit(1);
  return { columns: !columnError, table: !tableError };
}

async function teardown() {
  const ids = PEOPLE.map((p) => p.id);
  await service.from("push_subscriptions").delete().in("user_id", ids).then(
    () => {},
    () => {},
  );
  await service.from("notifications").delete().in("user_id", ids);
  await service.from("notification_prefs").delete().in("user_id", ids);
  await service.from("admin_users").delete().in("id", ids);
  await service.from("admin_audit").delete().in("admin_id", ids);
  await service.from("messages").delete().eq("chat_id", CHAT);
  await service.from("closure_notes").delete().eq("chat_id", CHAT);
  await service.from("chats").delete().eq("id", CHAT);
  await service.from("connects").delete().eq("id", CONNECT);
  await service.from("drops").delete().in("user_id", ids);
  await service.from("season_members").delete().in("user_id", ids);
  await service.from("profiles").delete().in("id", ids);
  /*
   * Deleted by email, not only by id. A probe run that died mid-setup leaves an
   * auth user behind, and if the fixture ids ever change the next run cannot
   * find it by id and fails on "already registered" with no way to recover.
   */
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
  const { error: seasonError } = await service
    .from("seasons")
    .upsert(SEED_SEASON, { onConflict: "id", ignoreDuplicates: true });
  if (seasonError) throw new Error(`season: ${seasonError.message}`);

  for (const person of PEOPLE) {
    const { error } = await service.auth.admin.createUser({
      id: person.id,
      email: email(person.key),
      password: PASSWORD,
      email_confirm: true,
      app_metadata: { seed: true },
    });
    if (error) throw new Error(`create ${person.key}: ${error.message}`);

    const { error: profileError } = await service.from("profiles").insert({
      id: person.id,
      first_name: person.name,
      birthdate: "1990-06-06",
      gender: "woman",
      seeking: ["man"],
      status: "active",
      /*
       * An address, so the email checks reach the thing they are checking.
       *
       * The sweep skips `no-address` before it ever looks at copy (0026 added
       * this column, and anybody who applied before it has none). Without one
       * here, the row asserting "a template §9.5 never wrote is skipped as
       * no-copy" was being skipped as no-address instead — passing, or
       * skipping, for a reason that had nothing to do with what it claims to
       * test.
       *
       * `.test` is not a deliverable domain, which is the point: the fixture
       * can exercise every branch up to the send without any of it being able
       * to reach a real inbox.
       */
      email: email(person.key),
    });
    if (profileError) throw new Error(`profile ${person.key}: ${profileError.message}`);
  }

  const [a, b, m] = PEOPLE;

  /*
   * A chat is what gives the copy renderer a counterpart to name — "{{FIRST_NAME}}
   * said yes" is unrenderable without one. `chats.connect_id` is not null, so
   * the whole chain has to exist: drop → card → connect → chat.
   */
  const dropDate = new Date(Date.parse(SEED_SEASON.starts_at) - 12 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const { data: drop, error: dropError } = await service
    .from("drops")
    .insert({ season_id: SEED_SEASON.id, user_id: a!.id, drop_date: dropDate })
    .select("id")
    .single();
  if (dropError) throw new Error(`drop: ${dropError.message}`);

  const { data: card, error: cardError } = await service
    .from("drop_cards")
    .insert({ drop_id: drop.id, shown_profile_id: b!.id, action: "connected" })
    .select("id")
    .single();
  if (cardError) throw new Error(`card: ${cardError.message}`);

  const { error: connectError } = await service.from("connects").insert({
    id: CONNECT,
    season_id: SEED_SEASON.id,
    from_user: a!.id,
    to_user: b!.id,
    drop_card_id: card.id,
    prompt_ref: { type: "prompt", id: "prompt_01" },
    reply_text: "Notify probe.",
    status: "accepted",
    responded_at: new Date().toISOString(),
  });
  if (connectError) throw new Error(`connect: ${connectError.message}`);

  const { error: chatError } = await service.from("chats").insert({
    id: CHAT,
    season_id: SEED_SEASON.id,
    connect_id: CONNECT,
    user_a: a!.id,
    user_b: b!.id,
    state: "active",
    fuse_expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  });
  if (chatError) throw new Error(`chat: ${chatError.message}`);

  const { error: adminError } = await service
    .from("admin_users")
    .upsert({ id: m!.id, email: email("M"), active: true }, { onConflict: "id" });
  if (adminError) throw new Error(`admin: ${adminError.message}`);
}

async function main() {
  console.log("\nNotifications — does one reach anybody, and can a member forge one?");

  const applied = await has0022();
  console.log(
    `\n${D}0022: skipped_at ${applied.columns ? "present" : "MISSING"}, ` +
      `push_subscriptions ${applied.table ? "present" : "MISSING"}${X}`,
  );

  await teardown();
  await setup();

  try {
    const clientA = await signIn("A");
    const clientB = await signIn("B");
    const [a, b] = PEOPLE;

    // ---------------------------------------------------------------------
    section("A member may mark it read. That is all — 0022");
    if (!applied.columns) {
      skip("notifications has no skipped_at — apply 0022_notifications_that_arrive.sql");
    } else {
      const { data: rows, error } = await service
        .from("notifications")
        .insert([
          { user_id: a!.id, channel: "inapp", template: "member_warned", payload: { reason: "hate" } },
          { user_id: a!.id, channel: "push", template: "fuse_24h", payload: { chat_id: CHAT } },
          { user_id: b!.id, channel: "inapp", template: "member_warned", payload: {} },
        ])
        .select("id,channel,user_id,template");
      if (error) throw new Error(`seed notifications: ${error.message}`);

      const mine = rows!.find((r) => r.user_id === a!.id && r.channel === "inapp")!;
      const minePush = rows!.find((r) => r.user_id === a!.id && r.channel === "push")!;
      const theirs = rows!.find((r) => r.user_id === b!.id)!;

      {
        const { error: readError } = await clientA
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("id", mine.id);
        check(!readError, "A marks their own warning read — the one write they own", readError?.message ?? "");
      }

      {
        // The reason this guard exists. Re-arming `sent_at` makes the sweep
        // send it again, on demand, as often as asked.
        await service.from("notifications").update({ sent_at: new Date().toISOString() }).eq("id", mine.id);
        const { error: resetError } = await clientA
          .from("notifications")
          .update({ sent_at: null })
          .eq("id", mine.id);
        const { data: after } = await service
          .from("notifications")
          .select("sent_at")
          .eq("id", mine.id)
          .single();
        check(
          Boolean(resetError) && Boolean(after?.sent_at),
          "but cannot un-send it — that would be a re-send on demand",
          resetError ? `refused: ${resetError.message.slice(0, 60)}` : "NO ERROR — sent_at was cleared",
        );
      }

      {
        const { error: rewriteError } = await clientA
          .from("notifications")
          .update({ template: "harmless", payload: { reason: "nothing" } })
          .eq("id", mine.id);
        const { data: after } = await service
          .from("notifications")
          .select("template,payload")
          .eq("id", mine.id)
          .single();
        check(
          Boolean(rewriteError) && after?.template === "member_warned",
          "nor rewrite a moderator's warning out of existence",
          after?.template ?? "gone",
        );
      }

      {
        const { error: skipError } = await clientA
          .from("notifications")
          .update({ skipped_at: null, skip_reason: "nope" })
          .eq("id", minePush.id);
        const { data: after } = await service
          .from("notifications")
          .select("template")
          .eq("id", minePush.id)
          .single();
        check(
          after?.template === "fuse_24h",
          "a push row they cannot even read is untouched",
          skipError ? "refused" : "no error, but unchanged — RLS could not locate it",
        );
      }

      {
        const { error: otherError } = await clientA
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("id", theirs.id);
        const { data: after } = await service
          .from("notifications")
          .select("read_at")
          .eq("id", theirs.id)
          .single();
        check(
          after?.read_at === null,
          "and B's notification is not A's to read",
          otherError ? "refused" : "no error, but unchanged",
        );
      }

      await service.from("notifications").delete().in("user_id", [a!.id, b!.id]);
    }

    // ---------------------------------------------------------------------
    section("A push subscription belongs to one member");
    if (!applied.table) {
      skip("push_subscriptions is missing — apply 0022_notifications_that_arrive.sql");
    } else {
      const endpoint = `https://fcm.googleapis.com/fcm/send/notify-probe-${a!.id.slice(-6)}`;

      {
        const { error } = await clientA.from("push_subscriptions").insert({
          user_id: a!.id,
          endpoint,
          p256dh: "probe-p256dh",
          auth: "probe-auth",
          user_agent: "verifier",
        });
        check(!error, "A registers this browser", error?.message ?? "");
      }

      {
        const { data } = await clientA.from("push_subscriptions").select("endpoint");
        check(data?.length === 1, "and can see it", `${data?.length ?? 0} row(s)`);
      }

      {
        const { data } = await clientB.from("push_subscriptions").select("endpoint");
        check(data?.length === 0, "B cannot see A's devices", `${data?.length ?? 0} row(s)`);
      }

      {
        await clientB.from("push_subscriptions").delete().eq("endpoint", endpoint);
        const { data } = await service.from("push_subscriptions").select("id").eq("endpoint", endpoint);
        check(data?.length === 1, "nor unsubscribe A's phone for them");
      }

      {
        /*
         * A plain upsert cannot do this, which is the whole reason 0024 adds an
         * RPC. `owner manages own push subscriptions` is
         * `using (auth.uid() = user_id)`, so an upsert that resolves to an
         * UPDATE of A's row fails the USING clause — with no error and no
         * change, leaving A subscribed to a browser B is now using.
         */
        const { error: upsertError } = await clientB.from("push_subscriptions").upsert(
          { user_id: b!.id, endpoint, p256dh: "b-p256dh", auth: "b-auth" },
          { onConflict: "endpoint" },
        );
        const { data: stuck } = await service
          .from("push_subscriptions")
          .select("user_id")
          .eq("endpoint", endpoint);
        check(
          stuck?.[0]?.user_id === a!.id,
          "a raw upsert cannot take the endpoint over — RLS holds the row",
          `owned by ${stuck?.[0]?.user_id === b!.id ? "B" : "A"}` +
            (upsertError ? ` · refused: ${upsertError.message.slice(0, 70)}` : " · no error raised"),
        );
      }

      {
        // The handover, through the function that can actually do it.
        const { error } = await clientB.rpc("register_push_subscription", {
          p_endpoint: endpoint,
          p_p256dh: "b-p256dh",
          p_auth: "b-auth",
          p_user_agent: "verifier B",
        });

        if (error && /could not find the function|PGRST202/i.test(error.message)) {
          skip("register_push_subscription is missing — apply 0024");
        } else {
          const { data } = await service
            .from("push_subscriptions")
            .select("user_id,user_agent")
            .eq("endpoint", endpoint);
          check(
            !error && data?.length === 1 && data[0]!.user_id === b!.id,
            "one browser, one person — registering moves the endpoint to B",
            `${data?.length ?? 0} row(s), owned by ${data?.[0]?.user_id === b!.id ? "B" : "A"}`,
          );
          check(
            data?.[0]?.user_agent === "verifier B",
            "and nothing of A's row survives into B's",
            data?.[0]?.user_agent ?? "none",
          );
        }
      }

      await service.from("push_subscriptions").delete().eq("endpoint", endpoint);
    }

    // ---------------------------------------------------------------------
    section("The sweep decides, and writes down what it decided");
    const reachable = CRON ? await fetch(`${BASE}/api/cron/notification-sweep`, {
      headers: { authorization: `Bearer ${CRON}` },
    }).then((r) => r.ok, () => false) : false;

    if (!applied.columns || !applied.table) {
      skip("0022 is not applied, so there is nothing for the sweep to write to");
    } else if (!CRON) {
      skip("CRON_SECRET is not set");
    } else if (!reachable) {
      skip(`no dev server on ${BASE} — run: pnpm --filter @noghost/web dev`);
    } else {
      // One row per outcome the planner can produce, each carrying its
      // expectation, so the assertions read from the fixture.
      const FIXTURES = [
        {
          label: "in-app, fresh",
          row: { channel: "inapp", template: "closure_received", payload: { chat_id: CHAT }, created_at: hoursAgo(1) },
          expect: { sent: true },
        },
        {
          label: "in-app at 3am — quiet hours do not apply",
          row: { channel: "inapp", template: "chat_closed_fuse", payload: { chat_id: CHAT }, created_at: hoursAgo(2) },
          expect: { sent: true },
        },
        {
          /*
           * Both true at once: 30 hours old against a 6-hour TTL, on a channel
           * with no transport when VAPID is unset. The planner names the cause
           * that was sufficient on its own — with no push configured the row
           * was never going anywhere, and its age is a consequence of that
           * rather than of a slow sweep. Which reason appears therefore depends
           * on the deployment, and asserting one unconditionally is what made
           * this fail on a machine with no keys.
           */
          label: "a fuse warning from yesterday",
          row: { channel: "push", template: "fuse_48h", payload: { chat_id: CHAT }, created_at: hoursAgo(30) },
          expect: { skipOneOf: ["stale", "no-transport"] },
        },
        {
          label: "a template no rule knows",
          row: { channel: "push", template: "invented_by_nobody", payload: {}, created_at: hoursAgo(1) },
          expect: { skip: "unknown-template" },
        },
        {
          label: "push with no device yet",
          row: { channel: "push", template: "connect_accepted", payload: { chat_id: CHAT }, created_at: hoursAgo(1) },
          expect: { pending: true },
        },
        {
          // §9.5 has no email body for a push-only template, so it can never be
          // sent however well the transport is configured.
          label: "an email for a template §9.5 never wrote",
          row: { channel: "email", template: "connect_received", payload: {}, created_at: hoursAgo(1) },
          expect: { emailOnly: true, skip: "no-copy" },
        },
        {
          /*
           * Skipped `declined`, not left pending, and that ordering is the
           * point: consent is checked before transport. Somebody with no
           * recorded `sms_opt_in_at` must never be texted (TCPA, §9.8), and
           * that is true whether or not Twilio exists — so the row is closed
           * now rather than held against the day a provider appears.
           */
          label: "an SMS to somebody who never opted in",
          row: { channel: "sms", template: "admitted_claim", payload: {}, created_at: hoursAgo(1) },
          expect: { skip: "declined" },
        },
      ] as const;

      const { data: seeded, error: seedError } = await service
        .from("notifications")
        .insert(FIXTURES.map((f) => ({ user_id: a!.id, ...f.row })))
        .select("id,template,channel");
      if (seedError) throw new Error(`seed sweep fixtures: ${seedError.message}`);

      const response = await fetch(`${BASE}/api/cron/notification-sweep`, {
        headers: { authorization: `Bearer ${CRON}` },
      });
      const summary = (await response.json()) as Record<string, unknown>;
      console.log(`  ${D}${JSON.stringify(summary)}${X}`);
      const emailUp = summary.emailConfigured === true;

      const { data: after } = await service
        .from("notifications")
        .select("id,template,sent_at,skipped_at,skip_reason")
        .in("id", seeded!.map((r) => r.id));
      const byId = new Map((after ?? []).map((r) => [r.id, r]));

      FIXTURES.forEach((fixture, i) => {
        const row = byId.get(seeded![i]!.id);
        if (!row) {
          check(false, `${fixture.label}: row vanished`);
          return;
        }
        /*
         * An email fixture says nothing about the sweep when there is no
         * transport — the planner defers it before the email path is reached.
         * Skipped rather than asserted, so this does not go green for the
         * wrong reason on a machine with no RESEND_API_KEY.
         */
        if ("emailOnly" in fixture.expect && !emailUp) {
          skip(`${fixture.label} — no RESEND_API_KEY, so email rows defer first`);
          return;
        }
        if ("sent" in fixture.expect) {
          check(
            Boolean(row.sent_at) && !row.skipped_at,
            `${fixture.label} → sent`,
            row.skipped_at ? `skipped: ${row.skip_reason}` : "",
          );
        } else if ("skipOneOf" in fixture.expect) {
          const allowed = fixture.expect.skipOneOf as readonly string[];
          check(
            Boolean(row.skipped_at) && allowed.includes(row.skip_reason ?? ""),
            `${fixture.label} → skipped "${allowed.join('" or "')}"`,
            row.skip_reason ?? (row.sent_at ? "SENT" : "still pending"),
          );
        } else if ("skip" in fixture.expect) {
          check(
            row.skip_reason === fixture.expect.skip && Boolean(row.skipped_at),
            `${fixture.label} → skipped "${fixture.expect.skip}"`,
            row.skip_reason ?? (row.sent_at ? "SENT" : "still pending"),
          );
        } else {
          check(
            !row.sent_at && !row.skipped_at,
            `${fixture.label} → left pending for a transport`,
            row.skip_reason ?? (row.sent_at ? "SENT" : ""),
          );
        }
      });

      {
        // The promise that makes a cron safe to run every five minutes.
        const before = await service
          .from("notifications")
          .select("id,sent_at,skipped_at")
          .in("id", seeded!.map((r) => r.id));
        await fetch(`${BASE}/api/cron/notification-sweep`, {
          headers: { authorization: `Bearer ${CRON}` },
        });
        const twice = await service
          .from("notifications")
          .select("id,sent_at,skipped_at")
          .in("id", seeded!.map((r) => r.id));
        check(
          JSON.stringify(before.data) === JSON.stringify(twice.data),
          "a second sweep changes nothing — idempotent",
        );
      }

      {
        // A dead endpoint must retire the subscription rather than the row, and
        // must not mark anything sent.
        const endpoint = "https://fcm.googleapis.com/fcm/send/definitely-not-a-real-endpoint";

        /*
         * Validly *shaped* keys for an endpoint that does not exist, which is
         * the case being tested. `web-push` checks the key lengths before it
         * encrypts anything, so placeholder strings never reach the network and
         * the push service never gets to say the subscription is gone — the
         * first version of this used "probe" for both and was asserting that a
         * local length check does not retire a row, which is a different and
         * much less interesting fact.
         */
        const ecdh = createECDH("prime256v1");
        ecdh.generateKeys();
        await service.from("push_subscriptions").insert({
          user_id: a!.id,
          endpoint,
          p256dh: ecdh.getPublicKey().toString("base64url"),
          auth: randomBytes(16).toString("base64url"),
        });
        const { data: row } = await service
          .from("notifications")
          .insert({
            user_id: a!.id, channel: "push", template: "connect_accepted",
            payload: { chat_id: CHAT }, created_at: hoursAgo(1),
          })
          .select("id")
          .single();

        const res = await fetch(`${BASE}/api/cron/notification-sweep`, {
          headers: { authorization: `Bearer ${CRON}` },
        });
        const body = (await res.json()) as { pushConfigured?: boolean };

        if (!body.pushConfigured) {
          skip("no VAPID keys set, so nothing was attempted — run pnpm vapid:keys");
        } else {
          const { data: sub } = await service
            .from("push_subscriptions")
            .select("expired_at")
            .eq("endpoint", endpoint)
            .single();
          const { data: notif } = await service
            .from("notifications")
            .select("sent_at,skipped_at")
            .eq("id", row!.id)
            .single();
          check(Boolean(sub?.expired_at), "a dead endpoint is retired, not deleted");
          check(
            !notif?.sent_at,
            "and the notification is NOT marked sent — nothing accepted it",
            notif?.sent_at ? "marked sent anyway" : "",
          );
        }

        await service.from("push_subscriptions").delete().eq("endpoint", endpoint);
      }
    }

    // ---------------------------------------------------------------------
    section("Housekeeping");
    if (!applied.columns) {
      skip("0022 is not applied");
    } else {
      const { error: memberError } = await clientA.rpc("prune_notifications", { p_days: 1 });
      check(Boolean(memberError), "a member cannot prune the queue", memberError ? "refused" : "ALLOWED");

      const { data: pending } = await service
        .from("notifications")
        .insert({ user_id: a!.id, channel: "push", template: "connect_accepted", payload: {}, created_at: hoursAgo(24 * 200) })
        .select("id")
        .single();
      const { data: decided } = await service
        .from("notifications")
        .insert({
          user_id: a!.id, channel: "push", template: "connect_accepted", payload: {},
          created_at: hoursAgo(24 * 200), skipped_at: hoursAgo(24 * 199), skip_reason: "stale",
        })
        .select("id")
        .single();

      const { data: removed, error: pruneError } = await service.rpc("prune_notifications", { p_days: 90 });
      check(!pruneError && (removed ?? 0) >= 1, "an admin prunes decided rows", `${removed ?? 0} removed`);

      const { data: stillThere } = await service
        .from("notifications")
        .select("id")
        .eq("id", pending!.id);
      check(
        stillThere?.length === 1,
        "but an ancient PENDING row survives — a backlog is evidence the sweep stopped",
      );
      const { data: gone } = await service.from("notifications").select("id").eq("id", decided!.id);
      check(gone?.length === 0, "and the decided one is gone");
    }
  } finally {
    section("Teardown");
    await teardown();
    console.log(`  ${D}probe world removed${X}`);
  }

  const tail = skipped > 0 ? ` ${D}(${skipped} section(s) skipped)${X}` : "";
  if (failures > 0) {
    console.log(`\n${R}${failures} check(s) failed${X}${tail}\n`);
  } else if (passed === 0) {
    console.log(
      `\n${R}Nothing was verified${X} — every section skipped. This is not a pass.\n` +
        `${D}Apply 0022_notifications_that_arrive.sql and run this again.${X}\n`,
    );
  } else {
    console.log(`\n${G}${passed} check(s) passed${X}${tail}\n`);
  }

  // A run that asserted nothing exits non-zero. Anything else would let CI go
  // green on a database where none of this exists.
  process.exit(failures === 0 && passed > 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n${R}${error instanceof Error ? error.message : String(error)}${X}\n`);
  process.exit(1);
});
