/**
 * Does `fuse-sweep` do what the fixture says it should?
 *
 * The fuse is the product's one promise — §10 lists it and its closure notes as
 * the things never cut — so it gets a live check of its own rather than only
 * unit tests. It drives the real HTTP endpoint against the real database and
 * asserts the three places a closure has to land: the `closure_notes` row, a
 * system message inside the conversation, and the push to both people.
 *
 * Each seeded chat carries its intended outcome in its opening message, so the
 * assertions read from the fixture rather than from a number typed twice.
 *
 * Needs the fixture and a running dev server:
 *
 *   pnpm db:seed:remote --chats
 *   pnpm --filter @noghost/web dev
 *   pnpm db:verify:fuse
 *
 * Mutates `seasons.ends_at` for the season-end case and restores it in a
 * finally block.
 */
import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { SEED_SEASON } from "../src/seed/data";

process.loadEnvFile(resolve(process.cwd(), "apps/web/.env.local"));

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});
const SECRET = process.env.CRON_SECRET!;
const BASE = "http://localhost:3000";

const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", X = "\x1b[0m";
let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  console.log(`  ${ok ? G + "✓" : R + "✗"}${X} ${label}${detail ? `  ${D}${detail}${X}` : ""}`);
  if (!ok) failures += 1;
};

const sweep = async () =>
  (await fetch(`${BASE}/api/cron/fuse-sweep`, {
    headers: { authorization: `Bearer ${SECRET}` },
  })).json();

/** Reads every fixture chat back, keyed by the label in its opening message. */
async function state() {
  const { data: chats } = await db
    .from("chats")
    .select("id,state,warned_48h,warned_24h,closed_at,fuse_expires_at,user_a,user_b")
    .eq("season_id", SEED_SEASON.id)
    .limit(200);
  const ids = (chats ?? []).map((c) => c.id);
  const { data: messages } = await db
    .from("messages").select("chat_id,kind,body,sender_id").in("chat_id", ids);
  const { data: notes } = await db
    .from("closure_notes").select("chat_id,template_id,from_user,delivered_at").in("chat_id", ids);

  const byLabel = new Map<string, {
    chat: NonNullable<typeof chats>[number];
    systemMessages: string[];
    notes: NonNullable<typeof notes>;
  }>();

  for (const chat of chats ?? []) {
    const mine = (messages ?? []).filter((m) => m.chat_id === chat.id);
    const opener = mine.find((m) => m.kind === "text")?.body ?? "";
    const label = /"([^"]+)"/.exec(opener)?.[1] ?? chat.id.slice(0, 8);
    byLabel.set(label, {
      chat,
      systemMessages: mine.filter((m) => m.kind === "system").map((m) => m.body ?? ""),
      notes: (notes ?? []).filter((n) => n.chat_id === chat.id),
    });
  }
  return byLabel;
}

/*
 * Scoped to one chat, not just to the people in it.
 *
 * These fixtures reuse the same profiles every run, so counting a template
 * across a member's whole history answers "how many warnings has this person
 * ever had" — which passes or fails depending on how many times the script has
 * been run before. `payload->>chat_id` is what the sweep writes, so it is what
 * the assertion should read.
 */
const countNotifs = async (template: string, userIds: string[], chatId: string) => {
  const { count } = await db
    .from("notifications")
    .select("id", { head: true, count: "exact" })
    .eq("template", template)
    .eq("payload->>chat_id", chatId)
    .in("user_id", userIds);
  return count ?? 0;
};

console.log("\n— auth");
for (const [label, headers] of [
  ["no auth", {}],
  ["wrong secret", { authorization: "Bearer nope" }],
] as const) {
  const res = await fetch(`${BASE}/api/cron/fuse-sweep`, { headers });
  check(res.status === 404, `${label} → 404`, `got ${res.status}`);
}

const before = await state();
if (before.size === 0) {
  console.error(
    `\nNo chats to sweep.\n\n` +
      `  pnpm db:seed:remote --chats     seeds one chat per branch of the fuse\n\n` +
      `Without them this script would report a clean pass over nothing, which is\n` +
      `the failure mode it exists to avoid.\n`,
  );
  process.exit(1);
}
/*
 * The season-end case at the end of this script closes every fixture chat, so a
 * second run has nothing open to sweep. Say that, rather than reporting eight
 * confusing failures about chats that are already finished.
 */
if ([...before.values()].every((row) => row.chat.closed_at)) {
  console.error(
    `\nAll ${before.size} fixture chats are already closed — this script's own\n` +
      `season-end case finishes them.\n\n` +
      `  pnpm db:seed:remote --chats     rebuild the fixture, then run again\n`,
  );
  process.exit(1);
}

console.log(`\n— before the sweep: ${before.size} fixture chats`);
for (const [label, row] of before) {
  console.log(`  ${label.padEnd(26)} ${row.chat.state.padEnd(18)} warned48=${row.chat.warned_48h}`);
}

console.log("\n— first sweep");
const first = await sweep();
console.log(`  ${JSON.stringify(first)}`);

const after = await state();

console.log("\n— each fixture case landed where it said it would");
const expectations: Record<string, { state: string; warned48?: boolean; warned24?: boolean }> = {
  calm: { state: "active", warned48: false, warned24: false },
  "48h window": { state: "active", warned48: true, warned24: false },
  "24h window": { state: "active", warned48: true, warned24: true },
  "already warned at 48h": { state: "active", warned48: true, warned24: false },
  expired: { state: "closed_fuse" },
  "date scheduled (paused)": { state: "date_scheduled", warned48: false },
  "check-in, fresh": { state: "post_date_checkin" },
  "check-in, stale": { state: "closed_fuse" },
};

for (const [label, want] of Object.entries(expectations)) {
  const row = after.get(label);
  if (!row) {
    check(false, `${label}: present`, "chat missing");
    continue;
  }
  const bits: string[] = [`state=${row.chat.state}`];
  let ok = row.chat.state === want.state;
  if (want.warned48 !== undefined) {
    ok = ok && row.chat.warned_48h === want.warned48;
    bits.push(`warned48=${row.chat.warned_48h}`);
  }
  if (want.warned24 !== undefined) {
    ok = ok && row.chat.warned_24h === want.warned24;
    bits.push(`warned24=${row.chat.warned_24h}`);
  }
  check(ok, `${label} → ${want.state}`, bits.join(" "));
}

console.log("\n— the promise: nothing closes without a note, in the chat and on the wire");
for (const [label, row] of after) {
  if (!row.chat.closed_at) continue;
  check(row.notes.length === 1, `${label}: exactly one closure_notes row`, `${row.notes.length}`);
  check(
    row.notes[0]?.template_id === "fuse_auto",
    `${label}: it is §9.2's fuse_auto`,
    row.notes[0]?.template_id ?? "none",
  );
  check(row.notes[0]?.from_user === null, `${label}: from_user is null — the system closed it`);
  check(Boolean(row.notes[0]?.delivered_at), `${label}: delivered_at stamped`);
  check(
    row.systemMessages.includes("fuse_auto"),
    `${label}: the note is a system message in the chat, not just a row`,
  );
  check(
    (await countNotifs("chat_closed_fuse", [row.chat.user_a, row.chat.user_b], row.chat.id)) === 2,
    `${label}: both participants were told`,
  );
  check(
    row.chat.closed_at !== null && Date.parse(row.chat.closed_at) <= Date.now(),
    `${label}: closed_at set`,
  );
}

console.log("\n— warnings went to both sides, once");
{
  const w48 = after.get("48h window")!.chat;
  check(
    (await countNotifs("fuse_48h", [w48.user_a, w48.user_b], w48.id)) === 2,
    "fuse_48h: one per participant",
  );
  const w24 = after.get("24h window")!.chat;
  check(
    (await countNotifs("fuse_24h", [w24.user_a, w24.user_b], w24.id)) === 2,
    "fuse_24h: one per participant",
  );
  check(
    (await countNotifs("fuse_48h", [w24.user_a, w24.user_b], w24.id)) === 0,
    "the 24h chat got only the 24h warning — the urgent one is the honest one",
  );
  const calm = after.get("calm")!.chat;
  check(
    (await countNotifs("fuse_48h", [calm.user_a, calm.user_b], calm.id)) === 0 &&
      (await countNotifs("fuse_24h", [calm.user_a, calm.user_b], calm.id)) === 0,
    "the calm chat was left alone",
  );
  const paused = after.get("date scheduled (paused)")!.chat;
  check(
    (await countNotifs("fuse_48h", [paused.user_a, paused.user_b], paused.id)) === 0,
    "a paused fuse is not warned — a date is on the calendar",
  );
}

console.log("\n— second sweep is a no-op");
const second = await sweep();
console.log(`  ${JSON.stringify(second)}`);
check(
  second.warned48h === 0 && second.warned24h === 0 && second.closed === 0,
  "nothing warned, nothing closed",
);
{
  const twice = await state();
  let extraNotes = 0;
  let extraMessages = 0;
  for (const [label, row] of twice) {
    extraNotes += row.notes.length - (after.get(label)?.notes.length ?? 0);
    extraMessages += row.systemMessages.length - (after.get(label)?.systemMessages.length ?? 0);
  }
  check(extraNotes === 0, "no duplicate closure notes", `${extraNotes} added`);
  check(extraMessages === 0, "no duplicate system messages", `${extraMessages} added`);
}

console.log("\n— season end closes whatever is left, whatever state it is in");
{
  const { data: season } = await db
    .from("seasons").select("ends_at").eq("id", SEED_SEASON.id).single();
  const originalEnds = season!.ends_at;
  try {
    await db
      .from("seasons")
      .update({ ends_at: new Date(Date.now() - 3_600_000).toISOString() })
      .eq("id", SEED_SEASON.id);

    const run = await sweep();
    console.log(`  ${JSON.stringify(run)}`);

    const ended = await state();
    const stillOpen = [...ended.values()].filter((r) => !r.chat.closed_at);
    check(stillOpen.length === 0, "every chat is closed", `${stillOpen.length} left open`);

    const seasonEnded = [...ended.values()].filter(
      (r) => r.chat.state === "closed_season_end",
    );
    check(
      seasonEnded.length > 0 && seasonEnded.every((r) => r.notes.some((n) => n.template_id === "season_end")),
      "and each of those carries §9.2's season_end note",
      `${seasonEnded.length} closed at season end`,
    );
    check(
      seasonEnded.every((r) => r.systemMessages.includes("season_end")),
      "delivered into the conversation too",
    );
    // The paused chat is the one that proves it: a date on the calendar does
    // not survive the season ending.
    const paused = ended.get("date scheduled (paused)")!;
    check(
      paused.chat.state === "closed_season_end",
      "even the chat with a date on the calendar",
      paused.chat.state,
    );
  } finally {
    await db.from("seasons").update({ ends_at: originalEnds }).eq("id", SEED_SEASON.id);
    console.log(`  ${D}ends_at restored to ${originalEnds}${X}`);
  }
}

console.log(failures === 0 ? `\n${G}Every check passed${X}\n` : `\n${R}${failures} check(s) failed${X}\n`);
process.exit(failures === 0 ? 0 : 1);
