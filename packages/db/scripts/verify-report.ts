/**
 * Does reporting actually protect anyone — and does it end the conversation
 * with words?
 *
 * The Community Standards page makes four promises in public, and this checks
 * all four against the database rather than against the copy:
 *
 *   "Report from any profile or chat."
 *   "Reporting immediately removes you and that person from each other's
 *    drops, before anyone reviews it."
 *   "The person you report is never told who reported them."
 *   "If we remove someone, their open chats close with a neutral system note to
 *    their partners. Even removal doesn't ghost anyone."
 *
 * The third is the one worth being careful about. It is not enough that no
 * notification is sent: the reported member must not be able to *derive* it
 * either, from a row they can read or from something that changed only for
 * them. So the assertions are written from their side — what can this person
 * see now that they could not see before — rather than from ours.
 *
 *   pnpm db:verify:report
 *
 * Needs nothing running. Builds and removes its own world.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { SEED_SEASON } from "../src/seed/data";
import { ENV_PATH, loadRepoEnv } from "./env";

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
let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`  ${ok ? G + "✓" : R + "✗"}${X} ${label}${detail ? `  ${D}${detail}${X}` : ""}`);
  if (!ok) failures += 1;
}
const section = (t: string) => console.log(`\n${t}`);

/*
 * Probed by calling it, because PostgREST resolves a function by name *and*
 * parameter names — so "does it exist" is only answerable by asking for the
 * signature this script actually uses. A `PGRST202` means 0017 has not been
 * applied; anything else means it is there and refused this particular call.
 */
async function hasResolveReport(): Promise<boolean> {
  const { error } = await service.rpc("resolve_report", {
    p_report_id: "00000000-0000-0000-0000-000000000000",
    p_resolution: "dismissed",
    p_note: null,
  });
  return !(error && (error.code === "PGRST202" || /could not find the function/i.test(error.message)));
}

/**
 * A reports B. C is the bystander who must notice nothing — and whose chat with
 * B is what proves a removal reaches every partner, not just the reporter's.
 * M is a moderator.
 */
const PEOPLE = [
  { key: "A", id: "deadbeef-0000-4000-8000-00000000fa11", name: "Report A" },
  { key: "B", id: "deadbeef-0000-4000-8000-00000000fb22", name: "Report B" },
  { key: "C", id: "deadbeef-0000-4000-8000-00000000fc33", name: "Report C" },
  { key: "M", id: "deadbeef-0000-4000-8000-00000000fd44", name: "Report M" },
] as const;

/** A–B is the reported conversation. B–C must survive it untouched. */
const PAIRS = [
  { key: "AB", chat: "deadbeef-0000-4000-8000-00000000cab1", connect: "deadbeef-0000-4000-8000-00000000eab1" },
  { key: "BC", chat: "deadbeef-0000-4000-8000-00000000cbc2", connect: "deadbeef-0000-4000-8000-00000000ebc2" },
] as const;

const PASSWORD = "probe-only-not-a-real-account-7e31";
const email = (key: string) => `report-probe-${key.toLowerCase()}@noghost.test`;

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

async function teardown() {
  const ids = PEOPLE.map((p) => p.id);
  await service.from("admin_users").delete().in("id", ids);
  await service.from("admin_audit").delete().in("admin_id", ids);
  const chats = PAIRS.map((p) => p.chat);
  await service.from("reports").delete().in("reporter_id", ids);
  await service.from("closure_notes").delete().in("chat_id", chats);
  await service.from("messages").delete().in("chat_id", chats);
  await service.from("chats").delete().in("id", chats);
  await service.from("connects").delete().in("id", PAIRS.map((p) => p.connect));
  await service.from("drops").delete().in("user_id", ids);
  await service.from("season_members").delete().in("user_id", ids);
  for (const person of PEOPLE) await service.auth.admin.deleteUser(person.id);
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
      birthdate: "1992-02-02",
      gender: "woman",
      seeking: ["man"],
    });
    if (profileError) throw new Error(`profile ${person.key}: ${profileError.message}`);

    const { error: memberError } = await service.from("season_members").insert({
      user_id: person.id,
      season_id: SEED_SEASON.id,
      stripe_payment_intent: `pi_deadbeef_report_${person.key}`,
      price_paid_cents: SEED_SEASON.price_standard_cents,
    });
    if (memberError) throw new Error(`season_member ${person.key}: ${memberError.message}`);
  }

  const [a, b, c] = PEOPLE;
  const ends = { AB: [a!.id, b!.id], BC: [b!.id, c!.id] } as const;

  for (const [index, pair] of PAIRS.entries()) {
    const [from, to] = ends[pair.key];
    const dropDate = new Date(Date.parse(SEED_SEASON.starts_at) - (index + 5) * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const { data: drop, error: dropError } = await service
      .from("drops")
      .insert({
        season_id: SEED_SEASON.id,
        user_id: from,
        drop_date: dropDate,
        released_at: new Date(Date.now() - 86_400_000).toISOString(),
      })
      .select("id")
      .single();
    if (dropError) throw new Error(`drop ${pair.key}: ${dropError.message}`);

    const { data: card, error: cardError } = await service
      .from("drop_cards")
      .insert({ drop_id: drop.id, shown_profile_id: to, action: "connected" })
      .select("id")
      .single();
    if (cardError) throw new Error(`card ${pair.key}: ${cardError.message}`);

    const { error: connectError } = await service.from("connects").insert({
      id: pair.connect,
      season_id: SEED_SEASON.id,
      from_user: from,
      to_user: to,
      drop_card_id: card.id,
      prompt_ref: { type: "prompt", id: "prompt_01" },
      reply_text: `Report probe, pair ${pair.key}.`,
      status: "accepted",
      responded_at: new Date().toISOString(),
    });
    if (connectError) throw new Error(`connect ${pair.key}: ${connectError.message}`);

    const { error: chatError } = await service.from("chats").insert({
      id: pair.chat,
      season_id: SEED_SEASON.id,
      connect_id: pair.connect,
      user_a: from,
      user_b: to,
      state: "active",
      fuse_expires_at: new Date(Date.now() + 7 * 24 * 3_600_000).toISOString(),
    });
    if (chatError) throw new Error(`chat ${pair.key}: ${chatError.message}`);
  }
}

const CHAT_AB = PAIRS[0].chat;
const CHAT_BC = PAIRS[1].chat;

async function main() {
  console.log(`\nReporting, against ${URL_}\n${D}${"─".repeat(60)}${X}`);
  await teardown();
  await setup();

  const [a, b, c] = PEOPLE;
  const clientA = await signIn("A");
  const clientB = await signIn("B");

  try {
    section("Before");
    {
      const { data: seesB } = await clientA
        .from("visible_profiles").select("id").eq("id", b!.id).maybeSingle();
      check(Boolean(seesB), "A can see B — they share a chat");
      const { data: seesA } = await clientB
        .from("visible_profiles").select("id").eq("id", a!.id).maybeSingle();
      check(Boolean(seesA), "and B can see A");
    }

    section("Reporting yourself, and reporting a chat that isn't yours");
    {
      const { error } = await clientA.rpc("report_member", {
        p_reported_id: a!.id,
        p_reason: "harassment",
        p_chat_id: null,
        p_detail: null,
      });
      check(
        Boolean(error) && /cannot report yourself/i.test(error?.message ?? ""),
        "refused",
        error?.message ?? "no error",
      );
    }
    {
      // A names B–C, a conversation A is not in. Filing the row is harmless;
      // closing somebody else's chat is not.
      const { error } = await clientA.rpc("report_member", {
        p_reported_id: b!.id,
        p_reason: "harassment",
        p_chat_id: CHAT_BC,
        p_detail: null,
      });
      check(
        Boolean(error) && /not your chat/i.test(error?.message ?? ""),
        "A cannot report against a chat between two other people",
        error?.message ?? "NO ERROR — apply 0016_report_closes_with_words.sql",
      );
      const { data: untouched } = await service
        .from("chats").select("state").eq("id", CHAT_BC).single();
      check(untouched?.state === "active", "and that chat is still open", untouched?.state);
      const { count } = await service
        .from("reports").select("id", { head: true, count: "exact" }).eq("reporter_id", a!.id);
      check(count === 0, "with no report row written either", `${count}`);
    }

    section("A reports B");
    let reportId: string | null = null;
    {
      const { data, error } = await clientA.rpc("report_member", {
        p_reported_id: b!.id,
        p_reason: "harassment",
        p_chat_id: CHAT_AB,
        p_detail: "Kept pushing after I said no.",
      });
      check(!error && typeof data === "string", "it files", error?.message ?? String(data).slice(0, 8));
      reportId = typeof data === "string" ? data : null;

      const { data: row } = await service
        .from("reports").select("reporter_id,reported_id,chat_id,reason,detail,resolution")
        .eq("id", reportId!).single();
      check(row?.reporter_id === a!.id && row?.reported_id === b!.id, "with both people on it");
      check(row?.reason === "harassment", "and the reason", row?.reason);
      check(row?.resolution === null, "unresolved — a human has not seen it yet");
    }

    section("A message is not editable by the person who received it — 0040");
    {
      /*
       * `messages` has a policy called "recipient marks a message read", whose
       * only conditions are "you are in this chat" and "you did not send this".
       * For the life of the project `authenticated` also held UPDATE on every
       * column of the table, so that policy let a member rewrite the body of
       * anything said to them — in a product whose promise is that an ending is
       * honest and an answer is real, close to the worst write to leave open.
       * §5's closing notes are messages.
       *
       * Nothing had ever exercised it: `read_at` was null on every row because
       * no code wrote it either, which is why the grant behind it went unseen.
       */
      const { data: theirs } = await service
        .from("messages")
        .insert({ chat_id: CHAT_AB, sender_id: a!.id, kind: "text", body: "What A actually said." })
        .select("id")
        .single();

      const tampered = await clientB
        .from("messages")
        .update({ body: "What B would rather A had said." })
        .eq("id", theirs!.id)
        .select();
      const { data: after } = await service
        .from("messages").select("body,read_at").eq("id", theirs!.id).single();

      check(after?.body === "What A actually said.",
        "the recipient cannot rewrite what the sender said",
        tampered.error ? `refused: ${tampered.error.code}` : `body is now "${after?.body}"`);

      // The other half: the thing the policy is actually named for still works.
      const marked = await clientB
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("id", theirs!.id);
      const { data: readNow } = await service
        .from("messages").select("read_at").eq("id", theirs!.id).single();
      check(!marked.error && readNow?.read_at !== null,
        "but can still mark it read, which is what the policy is for",
        marked.error ? marked.error.message : `read_at ${readNow?.read_at ? "set" : "still null"}`);

      // And the sender cannot mark their own message read to fake a receipt.
      const self = await clientA
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("id", theirs!.id)
        .select();
      check((self.data?.length ?? 0) === 0,
        "and the sender cannot mark their own message read",
        self.error ? `refused: ${self.error.code}` : `${self.data?.length ?? 0} row(s) updated`);

      await service.from("messages").delete().eq("id", theirs!.id);
    }

    section("The protection, before anyone reviews it");
    {
      const { data: seesB } = await clientA
        .from("visible_profiles").select("id").eq("id", b!.id).maybeSingle();
      check(!seesB, "A can no longer see B");
      const { data: seesA } = await clientB
        .from("visible_profiles").select("id").eq("id", a!.id).maybeSingle();
      check(!seesA, "and B can no longer see A — it is mutual, not a mute");

      const { data: stillC } = await clientB
        .from("visible_profiles").select("id").eq("id", c!.id).maybeSingle();
      check(Boolean(stillC), "B's other conversation is unaffected");
    }

    section("It ends with words — 0016");
    {
      const { data: chat } = await service
        .from("chats").select("state,closed_at").eq("id", CHAT_AB).single();
      check(
        chat?.state === "closed_by_user" && Boolean(chat?.closed_at),
        "the reported chat is closed",
        chat?.state === "active"
          ? "still active — apply 0016_report_closes_with_words.sql; the chat vanishes " +
            "from both sides with no ending, which is the one thing this product refuses"
          : (chat?.state ?? "missing"),
      );

      const { data: notes } = await service
        .from("closure_notes").select("template_id,from_user").eq("chat_id", CHAT_AB);
      check(notes?.length === 1, "with exactly one closure note", `${notes?.length ?? 0}`);
      check(
        notes?.[0]?.template_id === "removal",
        "which is §9.2's neutral `removal` note",
        notes?.[0]?.template_id ?? "none",
      );
      check(
        notes?.[0]?.from_user === null,
        "from nobody — attributing it to A would be a signed accusation",
      );

      const { data: system } = await service
        .from("messages").select("body").eq("chat_id", CHAT_AB).eq("kind", "system");
      check(
        (system ?? []).some((m) => m.body === "removal"),
        "and it is delivered into the conversation, not only into a table",
      );

      const { data: bc } = await service
        .from("chats").select("state").eq("id", CHAT_BC).single();
      check(bc?.state === "active", "B's chat with C is untouched — C is told nothing", bc?.state);
    }

    section("B is never told who reported them");
    {
      const { data: rows, error } = await clientB.from("reports").select("id,reporter_id,reason");
      check(
        (rows ?? []).length === 0,
        "B cannot read the report",
        error?.message ?? `${rows?.length ?? 0} row(s) visible`,
      );

      /*
       * By id, not by count. Counting made this check depend on whether the
       * earlier "not your chat" attempt had written a row — so before 0016 it
       * failed for a reason that had nothing to do with what it was testing.
       */
      const { data: mine } = await clientA.from("reports").select("id").eq("id", reportId!);
      check(mine?.length === 1, "A can read their own", `${mine?.length ?? 0}`);

      /*
       * The note B actually receives, checked as text. The `removal` template is
       * shared with admin removals precisely so this cannot become a tell —
       * anything naming A, or naming a report, would defeat the whole promise.
       */
      const { data: note } = await service
        .from("closure_notes").select("template_id").eq("chat_id", CHAT_AB).single();
      check(
        note?.template_id === "removal",
        "and the note they get is the same one an admin removal sends",
        note?.template_id ?? "none",
      );
    }

    section("Reporting again");
    {
      // A second report from the same person is allowed — a new incident is new
      // information — and must not close anything twice.
      const { error } = await clientA.rpc("report_member", {
        p_reported_id: b!.id,
        p_reason: "hate",
        p_chat_id: null,
        p_detail: null,
      });
      check(!error, "a second report is accepted", error?.message ?? "");

      const { data: notes } = await service
        .from("closure_notes").select("id").eq("chat_id", CHAT_AB);
      check(notes?.length === 1, "and the closed chat gains no second note", `${notes?.length ?? 0}`);
    }
    section("Resolving — 0017");
    if (!(await hasResolveReport())) {
      console.log(
        `  ${D}– skipped: needs 0017_resolve_report.sql — the function does not exist yet${X}`,
      );
    } else {
      const moderator = PEOPLE[3]!;
      const { error: grantError } = await service
        .from("admin_users")
        .upsert({ id: moderator.id, email: email("M"), active: true }, { onConflict: "id" });
      if (grantError) throw new Error(`grant admin: ${grantError.message}`);
      const clientM = await signIn("M");

      const { data: open } = await service
        .from("reports").select("id").eq("reporter_id", a!.id)
        .is("resolution", null).order("created_at").limit(1).single();

      {
        // The boundary first: an ordinary member with a session must not be
        // able to resolve their own report.
        const { error } = await clientA.rpc("resolve_report", {
          p_report_id: open!.id,
          p_resolution: "dismissed",
          p_note: null,
        });
        check(
          Boolean(error) && /only an admin/i.test(error?.message ?? ""),
          "a member cannot resolve a report",
          error?.message ?? "NO ERROR — anyone could dismiss reports about themselves",
        );
      }
      {
        const { error } = await clientM.rpc("resolve_report", {
          p_report_id: open!.id,
          p_resolution: "banished",
          p_note: null,
        });
        check(
          Boolean(error) && /unknown resolution/i.test(error?.message ?? ""),
          "and an invented resolution is refused",
          error?.message ?? "no error",
        );
      }

      {
        const { error } = await clientM.rpc("resolve_report", {
          p_report_id: open!.id,
          p_resolution: "dismissed",
          p_note: "Read the thread; nothing actionable.",
        });
        check(!error, "M dismisses it", error?.message ?? "");

        const { data: row } = await service
          .from("reports").select("resolution,resolved_by,resolved_at").eq("id", open!.id).single();
        check(row?.resolution === "dismissed", "recorded", row?.resolution ?? "none");
        check(row?.resolved_by === moderator.id, "and attributed to the moderator who did it");
        check(Boolean(row?.resolved_at), "with a timestamp");

        const { data: still } = await clientA
          .from("visible_profiles").select("id").eq("id", b!.id).maybeSingle();
        check(
          !still,
          "dismissing does NOT un-hide them from each other — no action against the " +
            "account is not the same as the reporter having been wrong",
        );

        const { error: again } = await clientM.rpc("resolve_report", {
          p_report_id: open!.id,
          p_resolution: "removed",
          p_note: "second opinion",
        });
        check(
          Boolean(again) && /already resolved/i.test(again?.message ?? ""),
          "and a second moderator cannot quietly overturn it",
          again?.message ?? "NO ERROR — a resolved report was re-resolved",
        );
      }

      section("A warning is delivered, not just recorded");
      {
        const { data: third, error: fileError } = await clientA.rpc("report_member", {
          p_reported_id: b!.id,
          p_reason: "explicit",
          p_chat_id: null,
          p_detail: null,
        });
        check(!fileError, "a third report is filed", fileError?.message ?? "");

        const { error } = await clientM.rpc("resolve_report", {
          p_report_id: third as string,
          p_resolution: "warned",
          p_note: null,
        });
        check(!error, "M warns B", error?.message ?? "");

        const { data: queued } = await service
          .from("notifications")
          .select("channel,template,payload,read_at")
          .eq("user_id", b!.id)
          .eq("template", "member_warned");
        check(queued?.length === 1, "a warning is queued for B", `${queued?.length ?? 0}`);
        check(queued?.[0]?.channel === "inapp", "on the one channel with a surface", queued?.[0]?.channel);
        check(
          queued?.[0]?.payload?.reason === "explicit",
          "carrying the category they crossed",
          JSON.stringify(queued?.[0]?.payload ?? {}),
        );
        /*
         * The assertion that matters most on this table. The payload is read by
         * the member's own app, so anything identifying in it is identifying to
         * them — and the standards page promises it never will be.
         */
        const blob = JSON.stringify(queued?.[0]?.payload ?? {});
        check(
          !blob.includes(a!.id) && !blob.toLowerCase().includes("report a"),
          "and nothing at all about who reported them",
          blob,
        );
        check(queued?.[0]?.read_at === null, "unread — it has not been acknowledged yet");

        // B can read their own warning, and A cannot read B's.
        const { data: mine } = await clientB
          .from("notifications").select("id,template").eq("template", "member_warned");
        check(mine?.length === 1, "B can read it");
        const { data: theirs } = await clientA
          .from("notifications").select("id").eq("user_id", b!.id);
        check(theirs?.length === 0, "and A cannot", `${theirs?.length ?? 0} row(s)`);

        const { data: acked } = await clientB
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("id", mine![0]!.id)
          .select("id");
        check(acked?.length === 1, "and acknowledge it themselves");
      }

      section("Removal reaches every partner, not just the reporter");
      {
        const { data: second } = await service
          .from("reports").select("id").eq("reporter_id", a!.id)
          .is("resolution", null).order("created_at", { ascending: true }).limit(1).single();

        const { error } = await clientM.rpc("resolve_report", {
          p_report_id: second!.id,
          p_resolution: "removed",
          p_note: "Repeat behaviour across two reports.",
        });
        check(!error, "M removes B", error?.message ?? "");

        const { data: profile } = await service
          .from("profiles").select("status").eq("id", b!.id).single();
        check(profile?.status === "removed", "B's account is removed", profile?.status);

        const { data: bc } = await service
          .from("chats").select("state,closed_at").eq("id", CHAT_BC).single();
        check(
          bc?.state === "closed_by_user" && Boolean(bc?.closed_at),
          "B's chat with C — who reported nobody — is closed too",
          bc?.state,
        );
        const { data: notes } = await service
          .from("closure_notes").select("template_id,from_user").eq("chat_id", CHAT_BC);
        check(notes?.length === 1, "with a note", `${notes?.length ?? 0}`);
        check(
          notes?.[0]?.template_id === "removal" && notes?.[0]?.from_user === null,
          "the same neutral one, from nobody — §7.3's “even removal doesn't ghost anyone”",
          notes?.[0]?.template_id ?? "none",
        );
        const { data: system } = await service
          .from("messages").select("body").eq("chat_id", CHAT_BC).eq("kind", "system");
        check(
          (system ?? []).some((m) => m.body === "removal"),
          "delivered into C's conversation, not only into a table",
        );

        const { data: audit } = await service
          .from("admin_audit").select("action,detail,admin_id")
          .eq("admin_id", moderator.id).eq("action", "resolve_report");
        /*
         * Asserted as a set rather than a count. This read `=== 2` until the
         * warning section was added above it and nobody moved the number — and
         * a count would not have caught the failure that matters anyway, which
         * is two rows recording the same decision twice.
         */
        const decisions = (audit ?? [])
          .map((row) => (row.detail as { resolution?: string } | null)?.resolution ?? "?")
          .sort()
          .join(", ");
        check(
          decisions === "dismissed, removed, warned",
          "every decision is in the audit trail, and each says which one it was",
          decisions || "none",
        );
        const removal = (audit ?? []).find((r) => r.detail?.resolution === "removed");
        check(
          removal?.detail?.note?.startsWith("Repeat behaviour"),
          "the reviewer's reasoning is on the removal",
          JSON.stringify(removal?.detail ?? {}).slice(0, 90),
        );
        check(
          removal?.detail?.chats_closed >= 1,
          "and it records how many conversations it ended",
          `${removal?.detail?.chats_closed}`,
        );
      }
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
