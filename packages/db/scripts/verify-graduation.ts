/**
 * Does Found Someone actually land — and does declining actually stay private?
 *
 * §6.5 is two mechanics stacked on one table, and neither is provable by asking
 * whether the RPCs exist. `db:verify` accepts any error that isn't `PGRST202`,
 * so a function whose body silently does nothing passes it perfectly — which is
 * exactly how 0012 hid. So this asserts *effects*: rows that changed, rows that
 * didn't, and one thing that must not be visible.
 *
 * It builds its own world rather than borrowing the fixture. Confirming a
 * graduation closes every other open chat for both members, and pointing that at
 * seeded profiles would quietly wreck whatever else was being tested. Three
 * throwaway members, two chats, all under the `deadbeef-` prefix, torn down in a
 * finally block.
 *
 *   pnpm db:verify:graduation
 *
 * Wants nothing running. Needs 0012 and 0013 applied; without them the failures
 * name the migration, which is the point of running it.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { SEED_SEASON } from "../src/seed/data";

const ENV_PATH = resolve(process.cwd(), "apps/web/.env.local");
if (existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL || !PUBLISHABLE || !SECRET) {
  console.error(`\nNeed all three Supabase keys in ${ENV_PATH}\n`);
  process.exit(1);
}

// Untyped, for the same reason verify-writes.ts is: several assertions here are
// reads the generated types are right to forbid in application code.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const service: SupabaseClient<any> = createClient(URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", X = "\x1b[0m";
let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`  ${ok ? G + "✓" : R + "✗"}${X} ${label}${detail ? `  ${D}${detail}${X}` : ""}`);
  if (!ok) failures += 1;
}
const section = (t: string) => console.log(`\n${t}`);

/**
 * A, B, C. A graduates with B; the A–C chat is the collateral that has to close.
 *
 * Fixed ids under the `deadbeef-` prefix, so `db:seed:remote --purge` sweeps
 * them up if a run is interrupted somewhere the finally block cannot reach.
 */
const PEOPLE = [
  { key: "A", id: "deadbeef-0000-4000-8000-0000000f0a01", name: "Grad A" },
  { key: "B", id: "deadbeef-0000-4000-8000-0000000f0b02", name: "Grad B" },
  { key: "C", id: "deadbeef-0000-4000-8000-0000000f0c03", name: "Grad C" },
] as const;
const PASSWORD = "probe-only-not-a-real-account-4c71";
const email = (key: string) => `grad-probe-${key.toLowerCase()}@noghost.test`;

/**
 * The two chats, and the whole chain each one needs.
 *
 * `chats.connect_id` → `connects.drop_card_id` → `drop_cards.drop_id` → `drops`
 * are all `not null` and none of them cascades, so a chat cannot be conjured
 * from nothing and teardown has to walk back out in the same order.
 */
const PAIRS = [
  { key: "AB", chat: "deadbeef-0000-4000-8000-0000000c0a0b", connect: "deadbeef-0000-4000-8000-0000000e0a0b" },
  { key: "AC", chat: "deadbeef-0000-4000-8000-0000000c0a0c", connect: "deadbeef-0000-4000-8000-0000000e0a0c" },
] as const;
const CHAT_AB = PAIRS[0].chat;
const CHAT_AC = PAIRS[1].chat;
const CHAT_IDS = PAIRS.map((pair) => pair.chat);
/** A note from C that is still waiting when A graduates — 0014's case. */
const PENDING_CONNECT = "deadbeef-0000-4000-8000-0000000e0c0a";
const CONNECT_IDS = [...PAIRS.map((pair) => pair.connect), PENDING_CONNECT];

/** A signed-in client per person — every RPC here reads `auth.uid()`. */
async function signIn(key: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: SupabaseClient<any> = createClient(URL!, PUBLISHABLE!, {
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
 * Innermost first. Every delete is checked, because a silent FK failure here
 * leaves rows that make the *next* run fail somewhere unrelated — the mistake
 * that cost an afternoon in the seed script's own teardown.
 */
async function teardown() {
  const ids = PEOPLE.map((person) => person.id);
  // `PromiseLike`, not `Promise`: a PostgrestFilterBuilder is thenable but is
  // not a Promise, and only awaiting it sends the request.
  const drop = async (table: string, run: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await run;
    if (error) console.log(`  ${R}✗${X} teardown ${table}: ${error.message}`);
  };

  await drop("graduations", service.from("graduations").delete().in("chat_id", CHAT_IDS));
  await drop("closure_notes", service.from("closure_notes").delete().in("chat_id", CHAT_IDS));
  await drop("messages", service.from("messages").delete().in("chat_id", CHAT_IDS));
  await drop("chats", service.from("chats").delete().in("id", CHAT_IDS));
  await drop("connects", service.from("connects").delete().in("id", CONNECT_IDS));
  // drop_cards cascade from drops; drops are found by their owner.
  await drop("drops", service.from("drops").delete().in("user_id", ids));
  await drop("exit_surveys", service.from("exit_surveys").delete().in("user_id", ids));
  await drop("notifications", service.from("notifications").delete().in("user_id", ids));
  await drop("season_members", service.from("season_members").delete().in("user_id", ids));
  // The profile cascades from auth.users.
  for (const person of PEOPLE) await service.auth.admin.deleteUser(person.id);
}

async function setup() {
  const { error: seasonError } = await service
    .from("seasons")
    // Never rewrite it — `--live` puts this row into `live` and a plain upsert
    // would revert that. Only its existence is needed.
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
      birthdate: "1994-05-05",
      gender: "woman",
      seeking: ["man"],
      neighborhood: "Grant Park",
    });
    if (profileError) throw new Error(`profile ${person.key}: ${profileError.message}`);

    const { error: memberError } = await service.from("season_members").insert({
      user_id: person.id,
      season_id: SEED_SEASON.id,
      // Unique, and prefixed like the seed script's so it reads as a fixture.
      stripe_payment_intent: `pi_deadbeef_grad_${person.key}`,
      price_paid_cents: SEED_SEASON.price_standard_cents,
    });
    if (memberError) throw new Error(`season_member ${person.key}: ${memberError.message}`);
  }

  const [a, b, c] = PEOPLE;
  const partners = { AB: b!.id, AC: c!.id } as const;
  const week = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString();

  /*
   * One drop per pair, dated *before* the season starts so it can never collide
   * with a real one. A distinct date per pair matters too: `drops` is unique on
   * (user_id, season_id, drop_date) and A owns both of these.
   */
  const dropDate = (index: number) =>
    new Date(Date.parse(SEED_SEASON.starts_at) - (index + 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);

  for (const [index, pair] of PAIRS.entries()) {
    const partner = partners[pair.key];

    const { data: drop, error: dropError } = await service
      .from("drops")
      .insert({
        season_id: SEED_SEASON.id,
        user_id: a!.id,
        drop_date: dropDate(index),
        released_at: new Date(Date.now() - 86_400_000).toISOString(),
      })
      .select("id")
      .single();
    if (dropError) throw new Error(`drop ${pair.key}: ${dropError.message}`);

    const { data: card, error: cardError } = await service
      .from("drop_cards")
      .insert({ drop_id: drop.id, shown_profile_id: partner, action: "connected" })
      .select("id")
      .single();
    if (cardError) throw new Error(`card ${pair.key}: ${cardError.message}`);

    const { error: connectError } = await service.from("connects").insert({
      id: pair.connect,
      season_id: SEED_SEASON.id,
      from_user: a!.id,
      to_user: partner,
      drop_card_id: card.id,
      prompt_ref: { type: "prompt", id: "prompt_01" },
      reply_text: `Graduation probe, pair ${pair.key}.`,
      status: "accepted",
      responded_at: new Date().toISOString(),
    });
    if (connectError) throw new Error(`connect ${pair.key}: ${connectError.message}`);

    const { error: chatError } = await service.from("chats").insert({
      id: pair.chat,
      season_id: SEED_SEASON.id,
      connect_id: pair.connect,
      user_a: a!.id,
      user_b: partner,
      state: "active",
      fuse_expires_at: week,
    });
    if (chatError) throw new Error(`chat ${pair.key}: ${chatError.message}`);
  }

  /*
   * One note from C to A, left pending. After A graduates it is the door 0014
   * closes: accepting it would open a fresh seven-day chat for somebody whose
   * season is over.
   */
  {
    const { data: drop, error: dropError } = await service
      .from("drops")
      .insert({
        season_id: SEED_SEASON.id,
        user_id: c!.id,
        drop_date: dropDate(PAIRS.length),
        released_at: new Date(Date.now() - 86_400_000).toISOString(),
      })
      .select("id")
      .single();
    if (dropError) throw new Error(`drop CA: ${dropError.message}`);

    const { data: card, error: cardError } = await service
      .from("drop_cards")
      .insert({ drop_id: drop.id, shown_profile_id: a!.id, action: "connected" })
      .select("id")
      .single();
    if (cardError) throw new Error(`card CA: ${cardError.message}`);

    const { error: connectError } = await service.from("connects").insert({
      id: PENDING_CONNECT,
      season_id: SEED_SEASON.id,
      from_user: c!.id,
      to_user: a!.id,
      drop_card_id: card.id,
      prompt_ref: { type: "prompt", id: "prompt_01" },
      reply_text: "A note that is still waiting when they graduate.",
      status: "pending",
    });
    if (connectError) throw new Error(`connect CA: ${connectError.message}`);
  }
}

/** How the app reads a chat's graduation state, for one viewer. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function asApp(client: SupabaseClient<any>, chatId: string, viewerId: string) {
  const { data, error } = await client
    .from("graduations")
    .select("id,proposed_by,status")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(`read graduations: ${error.message}`);
  const rows = data ?? [];
  return {
    rows,
    answer: rows.find((row) => row.status === "proposed" && row.proposed_by !== viewerId) ?? null,
    iAsked: rows.some((row) => row.proposed_by === viewerId),
  };
}

async function main() {
  console.log(`\nFound Someone, against ${URL}\n${D}${"─".repeat(60)}${X}`);

  await teardown(); // a previous interrupted run must not mask a result
  await setup();

  const [a, b, c] = PEOPLE;
  const clientA = await signIn("A");
  const clientB = await signIn("B");

  try {
    section("Asking");
    {
      const { data: id, error } = await clientA.rpc("propose_graduation", { p_chat_id: CHAT_AB });
      check(!error && typeof id === "string", "A proposes", error?.message ?? String(id).slice(0, 8));

      const { data: rows } = await service
        .from("graduations")
        .select("id,status,proposed_by,confirmed_by")
        .eq("chat_id", CHAT_AB);
      check(rows?.length === 1, "exactly one row", `${rows?.length ?? 0}`);
      check(rows?.[0]?.status === "proposed", "status = proposed", rows?.[0]?.status ?? "none");
      check(rows?.[0]?.proposed_by === a!.id, "proposed_by is A");
    }

    section("One ask each — 0013");
    {
      const { data: again, error } = await clientA.rpc("propose_graduation", {
        p_chat_id: CHAT_AB,
      });
      const { data: rows } = await service
        .from("graduations")
        .select("id")
        .eq("chat_id", CHAT_AB);
      check(
        !error && rows?.length === 1,
        "asking again returns the open ask, it does not add a second",
        error
          ? error.message
          : rows?.length === 1
            ? `id ${String(again).slice(0, 8)}`
            : `${rows?.length} rows — apply 0013_graduation_one_ask.sql`,
      );
    }
    {
      // Someone who is not in the chat, using a real graduation id.
      const clientC = await signIn("C");
      const { error } = await clientC.rpc("propose_graduation", { p_chat_id: CHAT_AB });
      check(
        Boolean(error) && /not your chat/i.test(error?.message ?? ""),
        "C cannot propose in a chat they're not in",
        error?.message ?? "no error",
      );
    }

    section("Who may answer");
    {
      /*
       * The id comes from B's own app-shaped read, not from a service-role
       * lookup. Two reasons. It is the path the UI actually takes — B can only
       * answer a question RLS lets them see — and it does not go wrong for the
       * wrong reason: before 0013 there are two proposals here, and any separate
       * "pick one" query can easily pick the other one and report a privacy
       * failure that is really a duplicate-row failure.
       */
      const view = await asApp(clientB, CHAT_AB, b!.id);
      check(view.answer !== null, "B sees a question waiting on them");
      check(view.iAsked === false, "and is not shown as having asked");

      const gradId = view.answer?.id;
      if (!gradId) {
        check(false, "there is a proposal to answer", "none visible — nothing below can run");
        throw new Error("no graduation visible to B");
      }

      const { error } = await clientA.rpc("respond_graduation", {
        p_graduation_id: gradId,
        p_confirm: true,
      });
      check(
        Boolean(error) && /other person confirms/i.test(error?.message ?? ""),
        "A cannot confirm their own proposal",
        error?.message ?? "no error — A graduated themselves",
      );

      section("Declining — private, and the chat carries on");
      const { error: declineError } = await clientB.rpc("respond_graduation", {
        p_graduation_id: gradId,
        p_confirm: false,
      });
      check(!declineError, "B declines", declineError?.message ?? "");

      const { data: after } = await service
        .from("graduations")
        .select("status,confirmed_by,responded_at")
        .eq("id", gradId)
        .single();
      check(after?.status === "declined", "status = declined", after?.status ?? "none");
      check(after?.confirmed_by === null, "confirmed_by stays null");
      check(Boolean(after?.responded_at), "responded_at stamped");

      const { data: chat } = await service
        .from("chats")
        .select("state,closed_at")
        .eq("id", CHAT_AB)
        .single();
      check(chat?.state === "active" && chat?.closed_at === null, "the chat is still active");

      const { count: notes } = await service
        .from("closure_notes")
        .select("id", { head: true, count: "exact" })
        .eq("chat_id", CHAT_AB);
      check(notes === 0, "no closure note was written", `${notes}`);

      const { count: notifs } = await service
        .from("notifications")
        .select("id", { head: true, count: "exact" })
        .eq("user_id", a!.id);
      check(notifs === 0, "A was not notified — §6.5 makes a no private", `${notifs}`);

      /*
       * The privacy rule proper. RLS *does* let A read their own declined row —
       * `participants read graduations` has no status clause — so the guarantee
       * lives in what the app derives from it. What A must never get is a state
       * that differs from "asked, no answer yet": no open question, and an ask
       * that stays spent.
       */
      const aView = await asApp(clientA, CHAT_AB, a!.id);
      check(aView.answer === null, "A has no question to answer");
      check(
        aView.iAsked === true,
        "A's ask is still spent — the button does not come back, which is how a " +
          "decline would otherwise announce itself",
      );

      const { error: reask } = await clientA.rpc("propose_graduation", { p_chat_id: CHAT_AB });
      check(
        Boolean(reask) && /already asked/i.test(reask?.message ?? ""),
        "and re-asking is refused at the database, not just hidden in the UI",
        reask?.message ?? "no error — apply 0013_graduation_one_ask.sql",
      );
    }

    section("Confirming — the whole season ends");
    {
      // A fresh ask, from the other direction: B asks, A confirms. B has not
      // used their own ask yet, so 0013 permits it.
      const { data: gradId, error: proposeError } = await clientB.rpc("propose_graduation", {
        p_chat_id: CHAT_AB,
      });
      check(!proposeError && typeof gradId === "string", "B asks", proposeError?.message ?? "");

      const { error } = await clientA.rpc("respond_graduation", {
        p_graduation_id: gradId,
        p_confirm: true,
      });
      check(!error, "A confirms", error?.message ?? "");

      const { data: grad } = await service
        .from("graduations")
        .select("status,confirmed_by")
        .eq("id", gradId)
        .single();
      check(grad?.status === "confirmed", "status = confirmed", grad?.status ?? "none");
      check(grad?.confirmed_by === a!.id, "confirmed_by is A, the one who said yes");

      const { data: theirs } = await service
        .from("chats")
        .select("state,closed_at")
        .eq("id", CHAT_AB)
        .single();
      check(theirs?.state === "closed_graduated", "their chat → closed_graduated", theirs?.state);
      check(Boolean(theirs?.closed_at), "closed_at stamped");

      const { data: other } = await service
        .from("chats")
        .select("state,closed_at")
        .eq("id", CHAT_AC)
        .single();
      check(
        other?.state === "closed_by_user" && Boolean(other?.closed_at),
        "A's other open chat closed too — nobody is left wondering",
        other?.state,
      );

      const { data: notes } = await service
        .from("closure_notes")
        .select("chat_id,template_id,from_user")
        .in("chat_id", [CHAT_AB, CHAT_AC]);
      check(notes?.length === 2, "one closure note per closed chat", `${notes?.length ?? 0}`);
      check(
        (notes ?? []).every((note) => note.template_id === "closure_03"),
        "both are §9.2's closure_03 — the “met someone” template",
        [...new Set((notes ?? []).map((n) => n.template_id))].join(","),
      );
      check(
        (notes ?? []).find((note) => note.chat_id === CHAT_AC)?.from_user === null,
        "the collateral close is from_user null — the system did it, not A",
      );

      /*
       * The 0012 assertion, and the reason this script exists. Before 0012 the
       * profiles trigger reverted this write inside the same statement and
       * `respond_graduation` still returned success.
       */
      const { data: profiles } = await service
        .from("profiles")
        .select("id,status")
        .in("id", [a!.id, b!.id]);
      const graduated = (profiles ?? []).filter((row) => row.status === "found_someone");
      check(
        graduated.length === 2,
        "both accounts → found_someone",
        graduated.length === 2
          ? ""
          : `${graduated.length}/2 — apply 0012_status_writes_by_rpc.sql; the trigger is ` +
            `reverting the write and returning success`,
      );

      const { data: cProfile } = await service
        .from("profiles")
        .select("status")
        .eq("id", c!.id)
        .single();
      check(cProfile?.status === "active", "C, who was only collateral, is untouched", cProfile?.status);

      const { data: surveys } = await service
        .from("exit_surveys")
        .select("user_id,submitted_at")
        .in("user_id", [a!.id, b!.id]);
      check(surveys?.length === 2, "an exit survey opened for each of them", `${surveys?.length ?? 0}`);
      check(
        (surveys ?? []).every((row) => row.submitted_at === null),
        "unsubmitted — the row is the invitation, submitted_at is the answer",
      );
    }

    section("A waiting note, after the season ended — 0014");
    {
      const { data: aProfile } = await service
        .from("profiles")
        .select("status")
        .eq("id", a!.id)
        .single();

      if (aProfile?.status !== "found_someone") {
        /*
         * Skipped, not failed. There is no other way to put an account into
         * `found_someone` — that is exactly what 0012 unblocks — so asserting
         * here would report a second failure for the first migration's reason
         * and point at the wrong file.
         */
        console.log(
          `  ${D}– skipped: needs 0012 first, so that a graduated account can exist${X}`,
        );
      } else {
        const { error: acceptError } = await clientA.rpc("respond_connect", {
          p_connect_id: PENDING_CONNECT,
          p_accept: true,
        });
        check(
          Boolean(acceptError) && /season ended/i.test(acceptError?.message ?? ""),
          "accepting is refused — it would reopen the season",
          acceptError?.message ?? "no error — apply 0014_no_new_chats_after_graduating.sql",
        );

        const { data: untouched } = await service
          .from("connects")
          .select("status")
          .eq("id", PENDING_CONNECT)
          .single();
        check(untouched?.status === "pending", "and the note is left as it was", untouched?.status);

        const { data: newChat } = await service
          .from("chats")
          .select("id")
          .eq("connect_id", PENDING_CONNECT);
        check(newChat?.length === 0, "no chat was opened", `${newChat?.length ?? 0}`);

        // The half that must survive: they can still answer.
        const { error: declineError } = await clientA.rpc("respond_connect", {
          p_connect_id: PENDING_CONNECT,
          p_accept: false,
        });
        check(!declineError, "but declining still works", declineError?.message ?? "");

        const { data: declined } = await service
          .from("connects")
          .select("status")
          .eq("id", PENDING_CONNECT)
          .single();
        check(declined?.status === "declined", "the sender gets an answer, not silence");
      }
    }

    section("Answering the survey");
    {
      const { error } = await clientA
        .from("exit_surveys")
        .update({
          dates_count: 3,
          would_recommend: true,
          quote: "It worked, which I did not expect.",
          submitted_at: new Date().toISOString(),
        })
        .eq("user_id", a!.id)
        .eq("season_id", SEED_SEASON.id);
      check(!error, "A submits their own survey", error?.message ?? "");

      const { data: mine } = await service
        .from("exit_surveys")
        .select("dates_count,would_recommend,quote,submitted_at")
        .eq("user_id", a!.id)
        .single();
      check(mine?.dates_count === 3 && mine?.would_recommend === true, "the answers stored");
      check(Boolean(mine?.submitted_at), "submitted_at stamped — the page stops asking");

      const { data: readOther } = await clientA
        .from("exit_surveys")
        .select("user_id")
        .eq("user_id", b!.id);
      check(readOther?.length === 0, "A cannot read B's survey", `${readOther?.length ?? 0} row(s)`);

      const { error: writeOther } = await clientA
        .from("exit_surveys")
        .update({ dates_count: 99 })
        .eq("user_id", b!.id);
      const { data: bSurvey } = await service
        .from("exit_surveys")
        .select("dates_count")
        .eq("user_id", b!.id)
        .single();
      check(
        bSurvey?.dates_count === null,
        "and cannot write it either",
        writeOther ? writeOther.message : `dates_count = ${bSurvey?.dates_count}`,
      );
    }
  } finally {
    section("Teardown");
    await teardown();
    console.log(`  ${D}probe world removed${X}`);
  }

  console.log(
    failures === 0 ? `\n${G}Every check passed${X}\n` : `\n${R}${failures} check(s) failed${X}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

await main();
