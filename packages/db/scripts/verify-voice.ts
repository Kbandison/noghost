/**
 * Can a voice note reach anyone it shouldn't?
 *
 * The `voice-notes` bucket is the only place in the product where one member's
 * recorded voice sits behind a policy rather than behind a column, and its
 * policies do something unusual: they authorise by *path*. The first segment of
 * the object name is read as a chat id and fed to `is_chat_participant`. That
 * makes the folder name a permission, which is exactly the kind of rule that
 * looks fine and fails quietly — a bucket that accidentally allowed a write
 * would pass any structural check, because the policy exists either way.
 *
 * So this asserts the boundary from both sides, with a third member who is in
 * neither chat, and it does it against real objects rather than against the
 * policy text.
 *
 *   pnpm db:verify:voice
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
let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`  ${ok ? G + "✓" : R + "✗"}${X} ${label}${detail ? `  ${D}${detail}${X}` : ""}`);
  if (!ok) failures += 1;
}
const section = (t: string) => console.log(`\n${t}`);

/** A and B share a chat. C is in neither, and is the whole point. */
const PEOPLE = [
  { key: "A", id: "deadbeef-0000-4000-8000-00000000fa01", name: "Voice A" },
  { key: "B", id: "deadbeef-0000-4000-8000-00000000fb02", name: "Voice B" },
  { key: "C", id: "deadbeef-0000-4000-8000-00000000fc03", name: "Voice C" },
] as const;

const CHAT = "deadbeef-0000-4000-8000-00000000cfab";
const CONNECT = "deadbeef-0000-4000-8000-00000000efab";
const PASSWORD = "probe-only-not-a-real-account-b2d9";
const email = (key: string) => `voice-probe-${key.toLowerCase()}@noghost.test`;

/** Four bytes that are not audio. The policies do not care, and neither does this. */
const PAYLOAD = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: "audio/webm" });

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
  const ids = PEOPLE.map((person) => person.id);
  const { data: objects } = await service.storage.from("voice-notes").list(CHAT);
  if (objects?.length) {
    await service.storage.from("voice-notes").remove(objects.map((o) => `${CHAT}/${o.name}`));
  }
  await service.from("messages").delete().eq("chat_id", CHAT);
  await service.from("chats").delete().eq("id", CHAT);
  await service.from("connects").delete().eq("id", CONNECT);
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
      birthdate: "1993-03-03",
      gender: "woman",
      seeking: ["man"],
    });
    if (profileError) throw new Error(`profile ${person.key}: ${profileError.message}`);

    const { error: memberError } = await service.from("season_members").insert({
      user_id: person.id,
      season_id: SEED_SEASON.id,
      stripe_payment_intent: `pi_deadbeef_voice_${person.key}`,
      price_paid_cents: SEED_SEASON.price_standard_cents,
    });
    if (memberError) throw new Error(`season_member ${person.key}: ${memberError.message}`);
  }

  const [a, b] = PEOPLE;
  const dropDate = new Date(Date.parse(SEED_SEASON.starts_at) - 3 * 86_400_000)
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
    reply_text: "Voice probe.",
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
    fuse_expires_at: new Date(Date.now() + 7 * 24 * 3_600_000).toISOString(),
  });
  if (chatError) throw new Error(`chat: ${chatError.message}`);
}

async function main() {
  console.log(`\nVoice notes, against ${URL_}\n${D}${"─".repeat(60)}${X}`);
  await teardown();
  await setup();

  const [a, b, c] = PEOPLE;
  const clientA = await signIn("A");
  const clientB = await signIn("B");
  const clientC = await signIn("C");
  const path = `${CHAT}/probe.webm`;

  try {
    section("Recording into a chat");
    {
      const { error } = await clientA.storage.from("voice-notes").upload(path, PAYLOAD, {
        contentType: "audio/webm",
        upsert: false,
      });
      check(!error, "A can record into their own chat", error?.message ?? "");
    }
    {
      // The forgery the app's action is built to make impossible: a path whose
      // first segment names a chat the writer is not in.
      const { error } = await clientC.storage
        .from("voice-notes")
        .upload(`${CHAT}/intruder.webm`, PAYLOAD, { contentType: "audio/webm" });
      check(
        Boolean(error),
        "C cannot record into a chat they're not in",
        error?.message ?? "NO ERROR — an outsider wrote into their folder",
      );
    }
    {
      // A user id where a chat id belongs. `is_chat_participant` on a uuid that
      // is not a chat must be false, not an error that fails open.
      const { error } = await clientA.storage
        .from("voice-notes")
        .upload(`${a!.id}/mine.webm`, PAYLOAD, { contentType: "audio/webm" });
      check(
        Boolean(error),
        "and nobody can record into a folder that isn't a chat at all",
        error?.message ?? "NO ERROR — a non-chat folder was writable",
      );
    }

    section("Who can hear it");
    for (const [key, client, expected] of [
      ["A", clientA, true],
      ["B", clientB, true],
      ["C", clientC, false],
    ] as const) {
      const { data, error } = await client.storage
        .from("voice-notes")
        .createSignedUrl(path, 60);
      const got = Boolean(data?.signedUrl) && !error;
      check(
        got === expected,
        expected
          ? `${key} can sign a URL for it — they are in the chat`
          : `${key} cannot sign a URL for it — they are not`,
        error?.message ?? (got ? "signed" : "refused"),
      );
    }
    {
      // The one that matters most: a signed URL is the *only* way in.
      const publicUrl = service.storage.from("voice-notes").getPublicUrl(path).data.publicUrl;
      const response = await fetch(publicUrl);
      check(!response.ok, "the unsigned object URL is not readable by anyone", `HTTP ${response.status}`);

      const { data } = await clientB.storage.from("voice-notes").createSignedUrl(path, 60);
      const signed = await fetch(data!.signedUrl);
      check(signed.ok, "the signed one is", `HTTP ${signed.status}`);
    }

    section("Immutable, per §5");
    {
      const { error } = await clientA.storage
        .from("voice-notes")
        .update(path, PAYLOAD, { contentType: "audio/webm" });
      check(
        Boolean(error),
        "even the sender cannot swap the audio after sending it",
        error?.message ?? "NO ERROR — a note could be replaced after being heard",
      );
      const { error: deleteError } = await clientA.storage.from("voice-notes").remove([path]);
      const { data: still } = await service.storage.from("voice-notes").list(CHAT);
      check(
        still?.some((object) => object.name === "probe.webm") === true,
        "or delete it",
        deleteError?.message ?? "the object is still there",
      );
    }

    section("The message row");
    {
      const { data, error } = await clientA
        .from("messages")
        .insert({
          chat_id: CHAT,
          sender_id: a!.id,
          kind: "voice",
          voice_path: path,
          voice_duration_ms: 2_500,
        })
        .select("id");
      check(!error && data?.length === 1, "A can write the voice message", error?.message ?? "");
    }
    {
      const { error } = await clientA.from("messages").insert({
        chat_id: CHAT,
        sender_id: a!.id,
        kind: "voice",
        voice_duration_ms: 2_500,
      });
      check(
        Boolean(error),
        "a voice message with no audio is refused by the table itself",
        error?.message ?? "NO ERROR — a player with nothing to play",
      );
    }
    {
      const { error } = await clientA.from("messages").insert({
        chat_id: CHAT,
        sender_id: a!.id,
        kind: "voice",
        voice_path: path,
        voice_duration_ms: 400_000,
      });
      check(
        Boolean(error),
        "and one claiming to be longer than the column allows",
        error?.message ?? "NO ERROR — 400s stored in a 300s column",
      );
    }
    {
      const { data } = await clientC.from("messages").select("id").eq("chat_id", CHAT);
      check(data?.length === 0, "C cannot read the message either", `${data?.length ?? 0} row(s)`);
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
