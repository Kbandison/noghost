"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";

export interface BroadcastState {
  error?: string;
  sent?: number;
}

export interface TestState {
  error?: string;
  sent?: string;
}

const MISSING_0023 =
  "This database hasn't had 0023_broadcasts.sql applied, so there's nothing to send with yet.";

const missing = (message: string) =>
  /could not find the function|PGRST202/i.test(message);

const CHANNELS = ["push", "sms", "email", "inapp"] as const;
type Channel = (typeof CHANNELS)[number];
const isChannel = (value: string): value is Channel =>
  (CHANNELS as readonly string[]).includes(value);

/**
 * Sending an announcement to a whole cohort — spec §7.3's Comms module.
 *
 * `requireAdmin()` is re-checked here for the reason every other action in this
 * console gives: a layout guard protects rendering, and a Server Action is a
 * POST endpoint a session cookie can reach directly. `broadcast_to_season`
 * checks `is_admin()` in SQL as well, and that is the boundary that holds.
 *
 * Deliberately not idempotent and deliberately not confirmed twice. Two
 * identical announcements are two decisions somebody made, and a console that
 * quietly swallowed the second would be deciding for them — the guard that
 * matters is the recipient count on the button, which says how many people are
 * about to be interrupted.
 */
export async function sendBroadcast(
  _prev: BroadcastState,
  formData: FormData,
): Promise<BroadcastState> {
  await requireAdmin();

  const seasonId = String(formData.get("seasonId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const email = formData.get("email") === "on";

  if (!seasonId) return { error: "Pick a season to send to." };
  if (body.length === 0) return { error: "A broadcast needs something to say." };
  if (body.length > 1000) {
    return { error: `That's ${body.length} characters. The limit is 1000 — it lands on a phone.` };
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("broadcast_to_season", {
    p_season_id: seasonId,
    p_body: body,
    p_email: email,
  });

  if (error) {
    console.error(`[admin] broadcast to ${seasonId}: ${error.message}`);
    if (missing(error.message)) return { error: MISSING_0023 };
    return { error: "That didn't send. Nothing went out." };
  }

  revalidatePath("/comms");
  return { sent: typeof data === "number" ? data : 0 };
}

/**
 * A test send — §7.3's "template preview/test-send for every notification".
 *
 * Goes to the admin doing it and nowhere else; `send_test_notification` enforces
 * that in SQL by ignoring any target but `auth.uid()`. A console button that
 * could send any template to any member would be a button for saying things to
 * people the product never decided to say.
 *
 * Delivery is still `notification-sweep`'s job — this only queues. That is the
 * point of testing it this way: what gets exercised is the real path, prefs and
 * quiet hours and transports included, rather than a shortcut that proves the
 * console can format a string.
 */
export async function sendTest(_prev: TestState, formData: FormData): Promise<TestState> {
  await requireAdmin();

  const template = String(formData.get("template") ?? "");
  const channel = String(formData.get("channel") ?? "");
  if (!template) return { error: "Pick a template." };
  // Narrowed rather than cast: the value arrives from a form field, so it is a
  // string until something checks, and `notif_channel` would reject it in SQL
  // with a less useful message than this one.
  if (!isChannel(channel)) return { error: "That isn't a channel this product sends on." };

  /*
   * Sample values for the copy's placeholders. Obviously fake on purpose — a
   * rehearsal that used a real member's name would be indistinguishable from
   * the real thing in a screenshot.
   */
  const payload: Record<string, unknown> = {
    chat_id: "00000000-0000-4000-8000-000000000000",
    connect_id: "00000000-0000-4000-8000-000000000000",
    prompt_ref: "prompt_11",
    place: "the sample place",
    day: new Date(Date.now() + 86_400_000).toISOString(),
    body: "This is a test broadcast. Nobody else received it.",
  };

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("send_test_notification", {
    p_template: template,
    p_channel: channel,
    p_payload: payload,
  });

  if (error) {
    console.error(`[admin] test send ${template}/${channel}: ${error.message}`);
    if (missing(error.message)) return { error: MISSING_0023 };
    // Raised by the function itself when the admin has no member profile, and
    // worth passing through verbatim — it names the fix.
    if (/member profile/i.test(error.message)) return { error: error.message };
    return { error: "That didn't queue." };
  }

  revalidatePath("/comms");
  return {
    sent: `${template} queued on ${channel}. The next notification-sweep decides whether it sends.`,
  };
}
