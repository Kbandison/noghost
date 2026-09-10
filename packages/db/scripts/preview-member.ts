/**
 * Sign in as a seeded member, so the app can be looked at before Twilio exists.
 *
 *   pnpm preview:member            # whoever has the most to look at
 *   pnpm preview:member Maya       # by first name
 *   pnpm preview:member --list     # who is available, and what each of them has
 *   pnpm preview:member --release  # also make tonight's drop visible now
 *
 * Prints a one-time URL. Open it and you are that member, in their real
 * account, reading real rows through RLS — not a mock. Everything you see is
 * what they would see.
 *
 * Two things have to be true, and both are refused loudly rather than
 * producing a link that does nothing:
 *
 *   PREVIEW_SIGN_IN=on    in `.env.local` — `/auth/confirm` is 404 without it
 *   a seeded member       `pnpm db:seed:remote --chats` builds the world
 *
 * The link is minted with the service key through the admin API, so nothing in
 * the deployed product can issue one. It is single-use and expires the way any
 * Supabase auth token does.
 *
 * Deliberately refuses a member who is not a seed fixture. The mechanism would
 * work on a real account — that is the nature of an admin-issued link — and a
 * script that will sign you in as one of your own members is not a thing to
 * leave lying around a repository.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ENV_PATH, loadRepoEnv } from "./env";

loadRepoEnv();

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !SECRET) {
  console.error(`\nNeed NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in ${ENV_PATH}\n`);
  process.exit(1);
}

const APP = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
const BASE = APP.includes("localhost") ? APP : "http://localhost:3000";

const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", B = "\x1b[1m", X = "\x1b[0m";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: SupabaseClient<any> = createClient(URL_, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const wanted = process.argv.slice(2).filter((arg) => !arg.startsWith("--"))[0];
const listing = process.argv.includes("--list");
const releasing = process.argv.includes("--release");

/**
 * How much each member has to look at.
 *
 * The default used to be whoever sorted first alphabetically, which was Maya —
 * no chats, no notes waiting, and a drop that had not been released yet, so the
 * preview opened on an empty screen and said nothing about the product. Picking
 * the member with the most going on is the difference between "it renders" and
 * "here is what it does".
 */
interface Richness {
  chats: number;
  inbox: number;
  drop: "released" | "waiting" | "none";
  score: number;
}

async function richnessFor(ids: string[]): Promise<Map<string, Richness>> {
  const today = new Date().toISOString().slice(0, 10);

  const [chats, connects, drops] = await Promise.all([
    db.from("chats").select("user_a,user_b,state").in("user_a", ids),
    db.from("connects").select("to_user,status").in("to_user", ids).eq("status", "pending"),
    db.from("drops").select("user_id,released_at").in("user_id", ids).eq("drop_date", today),
  ]);

  // `chats` matches either side, so the second half has to be asked for too.
  const { data: chatsB } = await db.from("chats").select("user_a,user_b,state").in("user_b", ids);

  const out = new Map<string, Richness>();
  for (const id of ids) out.set(id, { chats: 0, inbox: 0, drop: "none", score: 0 });

  for (const row of [...(chats.data ?? []), ...(chatsB ?? [])]) {
    for (const side of [row.user_a, row.user_b]) {
      const entry = out.get(side);
      if (entry && row.state !== "closed_by_user" && row.state !== "closed_fuse") entry.chats += 1;
    }
  }
  for (const row of connects.data ?? []) {
    const entry = out.get(row.to_user);
    if (entry) entry.inbox += 1;
  }
  for (const row of drops.data ?? []) {
    const entry = out.get(row.user_id);
    if (entry) entry.drop = row.released_at ? "released" : "waiting";
  }

  for (const entry of out.values()) {
    // A conversation is the most interesting thing in the product, so it counts
    // for most; a released drop is the screen the season is built around.
    entry.score = entry.chats * 5 + entry.inbox * 3 + (entry.drop === "released" ? 4 : 0);
  }
  return out;
}

async function main() {
  if (process.env.PREVIEW_SIGN_IN !== "on") {
    console.error(
      `\n${R}PREVIEW_SIGN_IN is not on.${X}\n\n` +
        `  /auth/confirm returns 404 without it, so a link would go nowhere.\n` +
        `  Add this to ${ENV_PATH} and restart the dev server:\n\n` +
        `      ${B}PREVIEW_SIGN_IN=on${X}\n\n` +
        `  ${D}Leave it out of production — §7.4 gives this product one credential.${X}\n`,
    );
    process.exit(1);
  }

  const { data: memberships, error } = await db
    .from("season_members")
    .select("user_id,season_id,joined_at")
    .order("joined_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error(`\n${R}Could not read season_members: ${error.message}${X}\n`);
    process.exit(1);
  }
  if (!memberships?.length) {
    console.error(
      `\n${R}Nobody is in a season.${X}\n\n` +
        `  Membership is normally written by the Stripe webhook, so until that\n` +
        `  account exists the fixture is the only way in:\n\n` +
        `      ${B}pnpm db:seed:remote --chats${X}\n\n` +
        `  ${D}That also backdates the season so drops run and seeds chats across the fuse.${X}\n`,
    );
    process.exit(1);
  }

  const ids = memberships.map((row) => row.user_id);
  const { data: profiles } = await db
    .from("profiles")
    .select("id,first_name,status")
    .in("id", ids)
    .order("first_name");

  const bySeason = new Map(memberships.map((row) => [row.user_id, row.season_id]));
  const { data: seasons } = await db.from("seasons").select("id,name,phase");
  const seasonById = new Map((seasons ?? []).map((s) => [s.id, s]));

  const people = (profiles ?? []).filter((p) => p.status !== "removed");

  /*
   * Releasing is a fixture action, and it says so. `release-drops` refuses
   * before 8pm — correctly, that is the product — so previewing the drop screen
   * during the day means stamping `released_at` the way the cron would.
   */
  if (releasing) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: released } = await db
      .from("drops")
      .update({ released_at: new Date().toISOString() })
      .eq("drop_date", today)
      .is("released_at", null)
      .select("id");
    console.log(
      `\n  ${D}released ${released?.length ?? 0} drop(s) for ${today} — ` +
        `the 8pm cron would have done this at 8pm${X}`,
    );
  }

  const richness = await richnessFor(people.map((p) => p.id));

  if (listing || !people.length) {
    console.log(`\n${B}Members you can preview${X}\n`);
    const sorted = [...people].sort(
      (a, b) => (richness.get(b.id)?.score ?? 0) - (richness.get(a.id)?.score ?? 0),
    );
    for (const person of sorted) {
      const r = richness.get(person.id);
      const has = [
        r?.chats ? `${r.chats} chat${r.chats === 1 ? "" : "s"}` : "",
        r?.inbox ? `${r.inbox} waiting` : "",
        r?.drop === "released" ? "drop up" : r?.drop === "waiting" ? "drop at 8" : "",
      ]
        .filter(Boolean)
        .join(" · ");
      console.log(
        `  ${person.first_name.padEnd(14)} ${D}${(has || "nothing yet").padEnd(28)}${X}`,
      );
    }
    console.log(
      `\n  ${D}pnpm preview:member ${sorted[0]?.first_name ?? "Name"}${X}` +
        `\n  ${D}pnpm preview:member --release   ${D}· to see tonight's drop before 8pm${X}\n`,
    );
    return;
  }

  const person = wanted
    ? people.find((p) => p.first_name.toLowerCase() === wanted.toLowerCase())
    : // Whoever has the most going on. Opening the preview on an empty screen
      // says nothing about the product.
      [...people].sort(
        (a, b) => (richness.get(b.id)?.score ?? 0) - (richness.get(a.id)?.score ?? 0),
      )[0];

  if (!person) {
    console.error(`\n${R}No member called "${wanted}".${X}  ${D}pnpm preview:member --list${X}\n`);
    process.exit(1);
  }

  const { data: account } = await db.auth.admin.getUserById(person.id);
  const user = account?.user;

  if (!user?.email) {
    console.error(
      `\n${R}${person.first_name} has no email on their auth account,${X} so no link can be\n` +
        `  minted for them. Seeded members get a throwaway one; a member who came\n` +
        `  through the funnel has only a phone number, which is the point.\n`,
    );
    process.exit(1);
  }

  /*
   * The guard that matters. An admin-issued link works on any account, so this
   * refuses anybody who is not a fixture — a convenience script that will sign
   * you in as one of your own members is not a thing to leave in a repository.
   */
  const isSeed =
    user.app_metadata?.seed === true || /@noghost\.test$/.test(user.email);

  if (!isSeed) {
    console.error(
      `\n${R}${person.first_name} is not a seeded fixture.${X}\n\n` +
        `  This only ever signs in as a seed account — real members are not\n` +
        `  something to be impersonated from a script, however convenient.\n`,
    );
    process.exit(1);
  }

  const { data: link, error: linkError } = await db.auth.admin.generateLink({
    type: "magiclink",
    email: user.email,
  });

  if (linkError || !link.properties?.hashed_token) {
    console.error(`\n${R}Could not mint a link: ${linkError?.message ?? "no token"}${X}\n`);
    process.exit(1);
  }

  const season = seasonById.get(bySeason.get(person.id)!);
  const url =
    `${BASE}/auth/confirm?token_hash=${link.properties.hashed_token}` +
    `&type=${link.properties.verification_type ?? "magiclink"}`;

  console.log(`\n${G}Open this and you are ${person.first_name}.${X}\n`);
  console.log(`  ${url}\n`);
  const r = richness.get(person.id);
  console.log(
    `  ${D}${person.first_name} · ${person.status} · ${season?.name ?? "?"} (${season?.phase ?? "?"})${X}`,
  );
  console.log(
    `  ${D}${r?.chats ?? 0} open chat(s) · ${r?.inbox ?? 0} note(s) waiting · ` +
      `drop ${r?.drop === "released" ? "is up" : r?.drop === "waiting" ? "lands at 8" : "not built"}${X}`,
  );
  console.log(`  ${D}Single use. Run this again for another.${X}\n`);

  /*
   * The drop is the screen this product is built around, and it renders "No
   * photos on this profile" for everybody when nothing is approved — which
   * looks like a broken app rather than a working filter. Named here because
   * this is where somebody is standing when they notice.
   */
  const { data: sample } = await db.from("profiles").select("photos").limit(100);
  const withPhotos = (sample ?? []).filter(
    (row) => Array.isArray(row.photos) && row.photos.length > 0,
  );
  const approved = withPhotos.filter((row) =>
    (row.photos as { approved?: boolean }[]).some((photo) => photo.approved),
  );

  if (withPhotos.length > 0 && approved.length === 0) {
    console.log(
      `  ${R}Nobody's photos are approved${X}, so every card will say "No photos on\n` +
        `  this profile". That is 0020's filter working — but 0021's trigger was\n` +
        `  also stripping approval from the seed's own writes. Fix:\n\n` +
        `      ${B}apply 0025_the_seed_cannot_approve_a_photo.sql${X}\n` +
        `      ${B}pnpm db:seed:remote --applications${X}\n`,
    );
  }
  console.log(`  ${D}Start here:${X}`);
  console.log(`  ${D}  ${BASE}/tonight    tonight's drop${X}`);
  console.log(`  ${D}  ${BASE}/inbox      notes waiting on you${X}`);
  console.log(`  ${D}  ${BASE}/chats      conversations, each on its fuse${X}`);
  console.log(`  ${D}  ${BASE}/profile    photos, prompts, settings${X}\n`);
}

main().catch((error) => {
  console.error(`\n${R}${error instanceof Error ? error.message : String(error)}${X}\n`);
  process.exit(1);
});
