/**
 * Can a member see a photo nobody approved?
 *
 * `profiles.photos` has carried an `approved` flag since 0002, above a comment
 * saying it "stays false until a reviewer says otherwise". Nothing ever set it
 * and nothing ever read it — every photo in the product was unapproved and
 * shown to everyone. 0020 makes both ends real, and this is what proves it,
 * because the failure mode is exactly the one that looks like success: a flag
 * that is present, plausible and ignored.
 *
 * Asserted through `visible_profiles`, which is where the filter lives, using a
 * real second member's session rather than the service role — the service role
 * bypasses the view entirely and would pass whatever happened.
 *
 *   pnpm db:verify:photos
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
const skip = (why: string) => console.log(`  ${D}– skipped: ${why}${X}`);

/*
 * Probed by calling it, because PostgREST resolves by name *and* parameter
 * names. Without this the "a member cannot approve their own photo" assertion
 * passed on a missing function rather than on the admin guard — green for
 * exactly the wrong reason, which is this file's whole subject.
 */
async function hasApprovalRpc(): Promise<boolean> {
  const { error } = await service.rpc("set_photo_approval", {
    p_user_id: "00000000-0000-0000-0000-000000000000",
    p_path: "nope",
    p_approved: false,
  });
  return !(error && (error.code === "PGRST202" || /could not find the function/i.test(error.message)));
}

/** A owns the photos. B is a member who can see A. M is the reviewer. */
const PEOPLE = [
  { key: "A", id: "deadbeef-0000-4000-8000-00000000fa71", name: "Photo A" },
  { key: "B", id: "deadbeef-0000-4000-8000-00000000fb72", name: "Photo B" },
  { key: "M", id: "deadbeef-0000-4000-8000-00000000fc73", name: "Photo M" },
] as const;

const CHAT = "deadbeef-0000-4000-8000-00000000cf71";
const CONNECT = "deadbeef-0000-4000-8000-00000000ef71";
const PASSWORD = "probe-only-not-a-real-account-a4e2";
const email = (key: string) => `photo-probe-${key.toLowerCase()}@noghost.test`;

const PHOTOS = [
  { path: "photo-probe/one.webp", order: 0, approved: false },
  { path: "photo-probe/two.webp", order: 1, approved: false },
  // No `approved` key at all — a hand-edited row, which must read as false.
  { path: "photo-probe/three.webp", order: 2 },
];

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
      birthdate: "1990-06-06",
      gender: "woman",
      seeking: ["man"],
      photos: person.key === "A" ? PHOTOS : [],
    });
    if (profileError) throw new Error(`profile ${person.key}: ${profileError.message}`);

    const { error: memberError } = await service.from("season_members").insert({
      user_id: person.id,
      season_id: SEED_SEASON.id,
      stripe_payment_intent: `pi_deadbeef_photo_${person.key}`,
      price_paid_cents: SEED_SEASON.price_standard_cents,
    });
    if (memberError) throw new Error(`season_member ${person.key}: ${memberError.message}`);
  }

  const [a, b] = PEOPLE;

  // A chat is what makes A visible to B at all — `can_view_profile`.
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
    reply_text: "Photo probe.",
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

const paths = (photos: unknown) =>
  (Array.isArray(photos) ? photos : []).map((p) => (p as { path: string }).path);

async function main() {
  console.log(`\nPhoto approval, against ${URL_}\n${D}${"─".repeat(60)}${X}`);
  await teardown();
  await setup();

  const [a, b, m] = PEOPLE;
  const clientA = await signIn("A");
  const clientB = await signIn("B");

  try {
    section("Unapproved photos are not shown");
    {
      const { data: seen } = await clientB
        .from("visible_profiles").select("photos").eq("id", a!.id).maybeSingle();
      check(
        Boolean(seen),
        "B can read A's profile at all — otherwise this proves nothing",
      );
      check(
        paths(seen?.photos).length === 0,
        "and sees none of the three unapproved photos",
        `${paths(seen?.photos).length} shown — apply 0020_photo_approval.sql`,
      );
    }

    section("But the owner still sees their own");
    {
      const { data: own } = await clientA
        .from("profiles").select("photos").eq("id", a!.id).maybeSingle();
      check(
        paths(own?.photos).length === 3,
        "A sees all three, so the settings screen can say what is waiting",
        `${paths(own?.photos).length}`,
      );
    }

    section("Approving one");
    if (!(await hasApprovalRpc())) {
      skip("needs 0020_photo_approval.sql — the function does not exist yet");
    } else {
      const { error: notAdmin } = await clientA.rpc("set_photo_approval", {
        p_user_id: a!.id,
        p_path: PHOTOS[0]!.path,
        p_approved: true,
      });
      check(
        Boolean(notAdmin),
        "a member cannot approve their own photo",
        notAdmin?.message ?? "NO ERROR — approval would be self-service",
      );

      await service.from("admin_users").upsert(
        { id: m!.id, email: email("M"), active: true },
        { onConflict: "id" },
      );
      const clientM = await signIn("M");

      const { error } = await clientM.rpc("set_photo_approval", {
        p_user_id: a!.id,
        p_path: PHOTOS[0]!.path,
        p_approved: true,
      });
      check(!error, "a reviewer can", error?.message ?? "");

      const { data: seen } = await clientB
        .from("visible_profiles").select("photos").eq("id", a!.id).maybeSingle();
      check(
        paths(seen?.photos).length === 1 && paths(seen?.photos)[0] === PHOTOS[0]!.path,
        "and B now sees exactly that one",
        paths(seen?.photos).join(","),
      );

      const { data: audit } = await service
        .from("admin_audit").select("action,detail").eq("admin_id", m!.id);
      check(
        (audit ?? []).some((row) => row.action === "set_photo_approval"),
        "the decision is in the audit trail",
        `${audit?.length ?? 0} row(s)`,
      );

      const { error: missing } = await clientM.rpc("set_photo_approval", {
        p_user_id: a!.id,
        p_path: "photo-probe/not-there.webp",
        p_approved: true,
      });
      check(
        Boolean(missing) && /not on this profile/i.test(missing?.message ?? ""),
        "and a path that is not on the profile raises rather than silently succeeding",
        missing?.message ?? "no error",
      );

      section("Hiding it again");
      const { error: hide } = await clientM.rpc("set_photo_approval", {
        p_user_id: a!.id,
        p_path: PHOTOS[0]!.path,
        p_approved: false,
      });
      check(!hide, "a reviewer can take it back down", hide?.message ?? "");

      const { data: after } = await clientB
        .from("visible_profiles").select("photos").eq("id", a!.id).maybeSingle();
      check(paths(after?.photos).length === 0, "and B stops seeing it");

      const { data: intact } = await service
        .from("profiles").select("photos").eq("id", a!.id).maybeSingle();
      check(
        paths(intact?.photos).length === 3,
        "while the photo itself is still on the profile — hidden, not deleted",
        `${paths(intact?.photos).length}`,
      );
      check(
        JSON.stringify(paths(intact?.photos)) === JSON.stringify(PHOTOS.map((p) => p.path)),
        "in its original order",
        paths(intact?.photos).join(","),
      );
    }
    section("A member cannot approve their own — 0021");
    {
      /*
       * The hole 0020 opens. `owner edits own profile` permits any UPDATE on
       * your own row and `photos` is one jsonb column, so without 0021 a member
       * can simply write `approved: true` and put an unreviewed image on their
       * card — with the review queue sitting empty and looking correct.
       */
      const { error } = await clientA
        .from("profiles")
        .update({
          photos: PHOTOS.map((photo, order) => ({ path: photo.path, order, approved: true })),
        })
        .eq("id", a!.id);
      check(!error, "A can rewrite their own photo array (they must be able to)", error?.message ?? "");

      const { data: stored } = await service
        .from("profiles").select("photos").eq("id", a!.id).single();
      const approved = (stored?.photos as { approved?: boolean }[]).filter((p) => p.approved);
      check(
        approved.length === 0,
        "but the approval flag does not stick",
        approved.length === 0
          ? ""
          : `${approved.length} self-approved — apply 0021_members_cannot_approve_their_own_photos.sql`,
      );

      const { data: seen } = await clientB
        .from("visible_profiles").select("photos").eq("id", a!.id).maybeSingle();
      check(
        paths(seen?.photos).length === 0,
        "and B still sees nothing",
        `${paths(seen?.photos).length} visible`,
      );
    }

    section("Adding and reordering keeps approval with the photo");
    if (!(await hasApprovalRpc())) {
      skip("needs 0020 to approve one first");
    } else {
      const clientM = await signIn("M");
      await service.from("admin_users").upsert(
        { id: m!.id, email: email("M"), active: true },
        { onConflict: "id" },
      );
      await clientM.rpc("set_photo_approval", {
        p_user_id: a!.id,
        p_path: PHOTOS[1]!.path,
        p_approved: true,
      });

      // Reversed, plus a new one — the shape of a real edit.
      const reordered = [
        { path: "photo-probe/new.webp", order: 0, approved: true },
        { path: PHOTOS[1]!.path, order: 1, approved: false },
        { path: PHOTOS[0]!.path, order: 2, approved: false },
      ];
      const { error } = await clientA.from("profiles").update({ photos: reordered }).eq("id", a!.id);
      check(!error, "A reorders and adds a photo", error?.message ?? "");

      const { data: stored } = await service
        .from("profiles").select("photos").eq("id", a!.id).single();
      const byPath = new Map(
        (stored?.photos as { path: string; approved?: boolean }[]).map((p) => [p.path, p.approved]),
      );
      check(
        byPath.get(PHOTOS[1]!.path) === true,
        "the approved one stays approved after moving position",
        `${byPath.get(PHOTOS[1]!.path)}`,
      );
      check(
        byPath.get("photo-probe/new.webp") === false,
        "the new one is unapproved however it was submitted",
        `${byPath.get("photo-probe/new.webp")}`,
      );

      const { data: seen } = await clientB
        .from("visible_profiles").select("photos").eq("id", a!.id).maybeSingle();
      check(
        paths(seen?.photos).length === 1 && paths(seen?.photos)[0] === PHOTOS[1]!.path,
        "so B sees exactly the one a reviewer approved",
        paths(seen?.photos).join(","),
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
