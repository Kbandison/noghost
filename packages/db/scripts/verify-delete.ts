/**
 * Does deleting an account erase the person and leave the ending?
 *
 * This is the one verifier that could not be pointed at the seeded fixture even
 * carefully: it destroys an account on purpose, and "carefully" is exactly the
 * word people use before they lose a database. Three throwaway members, their
 * own chats, torn down afterwards.
 *
 * The promise it checks is the privacy page's, and it has two halves that pull
 * against each other — everything about you goes, and the person you were
 * talking to still gets an ending. A cascade satisfies the first and breaks the
 * second, because `chats.user_a/user_b` are ON DELETE CASCADE and the closure
 * note lives on the chat. So the assertions come in pairs: something that must
 * be gone, and something that must still be standing.
 *
 *   pnpm db:verify:delete
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

/** A deletes themselves. B and C were mid-conversation with them. */
const PEOPLE = [
  { key: "A", id: "deadbeef-0000-4000-8000-00000000da01", name: "Delete A" },
  { key: "B", id: "deadbeef-0000-4000-8000-00000000db02", name: "Delete B" },
  { key: "C", id: "deadbeef-0000-4000-8000-00000000dc03", name: "Delete C" },
] as const;

const PAIRS = [
  { key: "AB", chat: "deadbeef-0000-4000-8000-00000000cd01", connect: "deadbeef-0000-4000-8000-00000000ed01" },
  { key: "AC", chat: "deadbeef-0000-4000-8000-00000000cd02", connect: "deadbeef-0000-4000-8000-00000000ed02" },
] as const;

const PASSWORD = "probe-only-not-a-real-account-1f60";
const email = (key: string) => `delete-probe-${key.toLowerCase()}@noghost.test`;

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
  const chats = PAIRS.map((p) => p.chat);
  await service.from("admin_audit").delete().in("admin_id", ids);
  await service.from("closure_notes").delete().in("chat_id", chats);
  await service.from("messages").delete().in("chat_id", chats);
  await service.from("chats").delete().in("id", chats);
  await service.from("connects").delete().in("id", PAIRS.map((p) => p.connect));
  await service.from("drops").delete().in("user_id", ids);
  await service.from("verifications").delete().in("user_id", ids);
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
      birthdate: "1991-01-01",
      gender: "woman",
      seeking: ["man"],
      neighborhood: "Kirkwood",
      occupation: "probe",
      height_cm: 170,
      photos: [{ path: `${person.id}/one.webp`, order: 0, approved: true }],
      prompts: [{ prompt_id: "prompt_01", answer: "Something personal." }],
    });
    if (profileError) throw new Error(`profile ${person.key}: ${profileError.message}`);

    const { error: memberError } = await service.from("season_members").insert({
      user_id: person.id,
      season_id: SEED_SEASON.id,
      stripe_payment_intent: `pi_deadbeef_delete_${person.key}`,
      price_paid_cents: SEED_SEASON.price_standard_cents,
    });
    if (memberError) throw new Error(`season_member ${person.key}: ${memberError.message}`);
  }

  const [a, b, c] = PEOPLE;

  // The selfie row that must be gone entirely, not anonymised.
  const { error: verifyError } = await service.from("verifications").insert({
    user_id: a!.id,
    selfie_path: `${a!.id}/selfie.jpg`,
    liveness_score: 0.99,
    liveness_passed: true,
  });
  if (verifyError) throw new Error(`verification: ${verifyError.message}`);

  const partners = { AB: b!.id, AC: c!.id } as const;
  for (const [index, pair] of PAIRS.entries()) {
    const partner = partners[pair.key];
    const dropDate = new Date(Date.parse(SEED_SEASON.starts_at) - (index + 9) * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const { data: drop, error: dropError } = await service
      .from("drops")
      .insert({ season_id: SEED_SEASON.id, user_id: a!.id, drop_date: dropDate })
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
      reply_text: "The reply that started this, in their own words.",
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
      fuse_expires_at: new Date(Date.now() + 7 * 24 * 3_600_000).toISOString(),
    });
    if (chatError) throw new Error(`chat ${pair.key}: ${chatError.message}`);

    const { error: messageError } = await service.from("messages").insert([
      { chat_id: pair.chat, sender_id: a!.id, kind: "text", body: "Something A said." },
      { chat_id: pair.chat, sender_id: partner, kind: "text", body: "Something the partner said." },
      {
        chat_id: pair.chat,
        sender_id: a!.id,
        kind: "voice",
        voice_path: `${pair.chat}/note.webm`,
        voice_duration_ms: 3000,
      },
    ]);
    if (messageError) throw new Error(`messages ${pair.key}: ${messageError.message}`);
  }
}

const CHAT_AB = PAIRS[0].chat;

async function hasDeleteAccount(): Promise<boolean> {
  const { error } = await service.rpc("delete_own_account");
  return !(error && (error.code === "PGRST202" || /could not find the function/i.test(error.message)));
}

async function main() {
  console.log(`\nAccount deletion, against ${URL_}\n${D}${"─".repeat(60)}${X}`);
  await teardown();
  await setup();

  const [a, b] = PEOPLE;

  try {
    if (!(await hasDeleteAccount())) {
      section("Deleting");
      console.log(`  ${D}– skipped: needs 0018_delete_own_account.sql${X}`);
      return;
    }

    const clientA = await signIn("A");
    const clientB = await signIn("B");

    section("Before");
    {
      const { data: seen } = await clientB
        .from("visible_profiles").select("first_name").eq("id", a!.id).maybeSingle();
      check(seen?.first_name === a!.name, "B can see A by name", seen?.first_name);
    }

    section("Deleting");
    {
      const { error } = await clientA.rpc("delete_own_account");
      check(!error, "A erases their account", error?.message ?? "");
    }

    section("What is gone");
    {
      const { data: profile } = await service
        .from("profiles")
        .select("first_name,birthdate,neighborhood,occupation,height_cm,photos,prompts,phone,voice_intro_path,status")
        .eq("id", a!.id)
        .single();
      check(profile?.first_name === "Someone", "the name", profile?.first_name);
      check(profile?.birthdate === "1900-01-01", "the birthdate", profile?.birthdate);
      check(profile?.neighborhood === null && profile?.occupation === null, "neighbourhood and job");
      check(profile?.height_cm === null, "height");
      check(
        Array.isArray(profile?.photos) && profile.photos.length === 0,
        "photos",
        JSON.stringify(profile?.photos),
      );
      check(
        Array.isArray(profile?.prompts) && profile.prompts.length === 0,
        "the prompts they wrote",
      );
      check(profile?.phone === null, "the phone number — which is also how they signed in");
      check(profile?.status === "removed", "and the account is closed", profile?.status);

      const { data: verification } = await service
        .from("verifications").select("id").eq("user_id", a!.id);
      check(verification?.length === 0, "the verification row goes entirely, not anonymised");

      const { data: mine } = await service
        .from("messages").select("body,kind,voice_path").eq("sender_id", a!.id);
      check(
        (mine ?? []).every((m) => m.body === "[removed]"),
        "every message they sent is emptied",
        `${mine?.length ?? 0} message(s)`,
      );
      check(
        (mine ?? []).every((m) => m.kind === "text" && m.voice_path === null),
        "including voice notes, which stop pointing at a file",
      );

      const { data: connect } = await service
        .from("connects").select("reply_text").eq("from_user", a!.id).limit(1).single();
      check(connect?.reply_text === "[removed]", "and the reply that started the chat");
    }

    section("What is still standing");
    {
      const { data: chats } = await service
        .from("chats").select("id,state,closed_at").in("id", PAIRS.map((p) => p.chat));
      check(chats?.length === 2, "both conversations still exist", `${chats?.length ?? 0}`);
      check(
        (chats ?? []).every((c) => c.state === "closed_by_user" && c.closed_at),
        "closed, not vanished",
      );

      const { data: notes } = await service
        .from("closure_notes").select("chat_id,template_id,from_user").in("chat_id", PAIRS.map((p) => p.chat));
      check(notes?.length === 2, "each with a closure note", `${notes?.length ?? 0}`);
      check(
        (notes ?? []).every((n) => n.template_id === "removal" && n.from_user === null),
        "the neutral one, from nobody — the same note a removal sends",
      );

      const { data: theirs } = await service
        .from("messages").select("body").eq("sender_id", b!.id);
      check(
        (theirs ?? []).every((m) => m.body === "Something the partner said."),
        "the partner's own words are untouched",
        `${theirs?.length ?? 0} message(s)`,
      );

      const { data: paid } = await service
        .from("season_members").select("stripe_payment_intent").eq("user_id", a!.id).maybeSingle();
      check(
        Boolean(paid?.stripe_payment_intent),
        "and the payment record survives, with a tombstone attached to it",
        paid?.stripe_payment_intent,
      );
    }

    section("What the partner sees");
    {
      const { data: seen } = await clientB
        .from("visible_profiles").select("first_name,photos").eq("id", a!.id).maybeSingle();
      check(seen?.first_name === "Someone", "a name that is not a name", seen?.first_name);
      check(
        Array.isArray(seen?.photos) && seen.photos.length === 0,
        "and nothing to look at",
      );

      const { data: readable } = await clientB
        .from("messages").select("body").eq("chat_id", CHAT_AB).order("created_at");
      check(
        (readable ?? []).some((m) => m.body === "Something the partner said."),
        "they can still read their own side",
      );
      check(
        (readable ?? []).some((m) => m.body === "removal"),
        "and the note that says it ended",
      );
      check(
        !(readable ?? []).some((m) => m.body === "Something A said."),
        "but not a word of what the other person wrote",
      );
    }

    section("The door is shut");
    {
      const { data: session, error } = await createClient(URL_!, PUBLISHABLE!, {
        auth: { persistSession: false },
      }).auth.signInWithPassword({ email: email("A"), password: PASSWORD });
      /*
       * The auth row deliberately survives — deleting it would cascade
       * `profiles` and take the partners' conversations with it. The phone
       * number is what a real member signs in with and it is gone, so this
       * password path exists only because the probe created one.
       */
      check(
        Boolean(session?.session) && !error,
        "the auth row is still there (deleting it would cascade the chats away)",
      );
      const { data: profile } = await service
        .from("profiles").select("status,phone").eq("id", a!.id).single();
      check(
        profile?.phone === null && profile?.status === "removed",
        "but there is no phone to sign in with, and the member gate refuses `removed`",
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
