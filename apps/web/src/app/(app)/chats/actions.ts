"use server";

import { revalidatePath } from "next/cache";
import { CLOSURE_TEMPLATES } from "@noghost/config/copy";
import { validateDateProposal } from "@noghost/logic";
import { requireMember } from "@/lib/member";
import { supabaseServer } from "@/lib/supabase";
import { checkTone, toneCheckConfigured } from "@/lib/tone";

/**
 * Everything a member can do inside a chat — spec §7.2 and §6.3.
 *
 * Every action re-checks `requireMember()`: the layout guard protects
 * rendering, not a POST endpoint. None of them is the authorisation boundary
 * either — sending a message is allowed by one RLS policy pinned to an open
 * chat you belong to, and the date and closure paths go through RPCs that
 * re-validate in SQL.
 */

export interface ChatActionState {
  error?: string;
  /** A tone-check rewrite, offered rather than enforced (§6.6). */
  suggestion?: string;
  /** Set once a close has actually happened, so the sheet can stand down. */
  closed?: boolean;
}

const CLOSED = "That chat is closed. Nothing more can be sent.";

export async function sendMessage(
  _prev: ChatActionState,
  formData: FormData,
): Promise<ChatActionState> {
  const member = await requireMember();

  const chatId = String(formData.get("chatId") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!chatId) return { error: "That chat isn't there any more." };
  if (!body) return {};
  if (body.length > 4000) return { error: "That's longer than a message can be." };

  const supabase = await supabaseServer();

  /*
   * A direct insert. `sender writes into an open chat` is the only policy that
   * permits it, and it checks three things in SQL: the sender is the caller,
   * the kind is text or voice, and the chat is still open. `.select()` matters
   * — with no matching row RLS returns zero rows and no error, so without it a
   * message into a closed chat would look like it sent.
   */
  const { data, error } = await supabase
    .from("messages")
    .insert({ chat_id: chatId, sender_id: member.id, kind: "text", body })
    .select("id");

  if (error) {
    console.error(`[chat] send ${chatId}: ${error.message}`);
    return { error: "That didn't send. Try again." };
  }
  if (!data || data.length === 0) return { error: CLOSED };

  revalidatePath(`/chats/${chatId}`);
  revalidatePath("/chats");
  return {};
}

export async function proposeDate(
  _prev: ChatActionState,
  formData: FormData,
): Promise<ChatActionState> {
  await requireMember();

  const chatId = String(formData.get("chatId") ?? "");
  const day = String(formData.get("day") ?? "");
  const time = String(formData.get("time") ?? "");
  const placeName = String(formData.get("placeName") ?? "").trim();
  const placeNote = String(formData.get("placeNote") ?? "").trim();

  if (!chatId) return { error: "That chat isn't there any more." };
  if (!day || !time) return { error: "Pick a day and a time." };

  /*
   * Assembled as a local wall-clock string and left to the browser's zone.
   * `new Date("2026-08-20T19:00")` — no trailing Z — is parsed as local time,
   * which is what someone typing "7pm" means. Appending Z would move the date
   * by hours and silently propose the wrong evening.
   */
  const scheduledFor = new Date(`${day}T${time}`);
  if (Number.isNaN(scheduledFor.getTime())) return { error: "That's not a real time." };

  const now = new Date().toISOString();
  const check = validateDateProposal(
    { scheduledFor: scheduledFor.toISOString(), placeName, placeNote },
    now,
  );
  if (!check.ok) return { error: check.message };

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("propose_date", {
    p_chat_id: chatId,
    p_scheduled_for: scheduledFor.toISOString(),
    p_place_name: placeName,
    p_place_note: placeNote || null,
  });

  if (error) {
    console.error(`[chat] propose_date ${chatId}: ${error.message}`);
    // The RPC re-checks the same 2-hour and 14-day window in SQL and says so
    // in words a member can read, so those messages pass through.
    if (/at least 2 hours|within the next 14 days/i.test(error.message)) {
      return { error: error.message.replace(/^.*?:\s*/, "") };
    }
    if (/not open|closed/i.test(error.message)) return { error: CLOSED };
    return { error: "That didn't send. Try again." };
  }

  revalidatePath(`/chats/${chatId}`);
  revalidatePath("/chats");
  return {};
}

export async function respondToDate(
  _prev: ChatActionState,
  formData: FormData,
): Promise<ChatActionState> {
  await requireMember();

  const chatId = String(formData.get("chatId") ?? "");
  const dateId = String(formData.get("dateId") ?? "");
  const confirm = String(formData.get("confirm") ?? "") === "yes";

  if (!dateId) return { error: "That plan isn't there any more." };

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("respond_to_date", {
    p_date_id: dateId,
    p_confirm: confirm,
  });

  if (error) {
    console.error(`[chat] respond_to_date ${dateId}: ${error.message}`);
    if (/other person confirms/i.test(error.message)) {
      return { error: "They proposed it, so it's theirs to confirm — not yours." };
    }
    if (/already answered/i.test(error.message)) {
      return { error: "That's already been answered. Reload to see where it landed." };
    }
    return { error: "That didn't save. Try again." };
  }

  revalidatePath(`/chats/${chatId}`);
  revalidatePath("/chats");
  return {};
}

/**
 * Answering the post-date check-in — spec §6.3.
 *
 * `answer_checkin` does all the deciding in one transaction: it upserts the
 * caller's own row, reads the partner's, and then either closes the chat or
 * restarts the fuse for a fresh seven days. Deliberately not split across the
 * client: a member must never be able to observe the partner's answer by
 * inspecting what this action returns, so the RPC's return value is discarded
 * rather than surfaced.
 */
export async function answerCheckin(
  _prev: ChatActionState,
  formData: FormData,
): Promise<ChatActionState> {
  await requireMember();

  const chatId = String(formData.get("chatId") ?? "");
  const dateId = String(formData.get("dateId") ?? "");
  const answer = String(formData.get("answer") ?? "");

  if (!dateId) return { error: "That check-in isn't there any more." };
  if (answer !== "continue" && answer !== "close") {
    return { error: "That isn't an answer we can record." };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("answer_checkin", {
    p_date_id: dateId,
    p_answer: answer,
  });

  if (error) {
    console.error(`[chat] answer_checkin ${dateId}: ${error.message}`);
    if (/not found/i.test(error.message)) {
      return { error: "That check-in isn't yours to answer." };
    }
    return { error: "That didn't save. Try again." };
  }

  revalidatePath(`/chats/${chatId}`);
  revalidatePath("/chats");
  /*
   * Intentionally empty. `answer_checkin` returns "closed" | "continued" |
   * "pending", and returning that here would tell the first person to answer
   * exactly what the second one chose — the one thing §6.3 says neither of them
   * may learn. The page re-reads the chat's own state instead.
   */
  return {};
}

type TemplateId = (typeof CLOSURE_TEMPLATES)[number]["id"];
const TEMPLATE_IDS: readonly string[] = CLOSURE_TEMPLATES.map((template) => template.id);
const isTemplateId = (value: string): value is TemplateId => TEMPLATE_IDS.includes(value);

/**
 * Closing kindly — spec §6.3 and §9.2.
 *
 * A template is required and a personal line is optional. The tone check runs
 * on the line only, and it **offers** a rewrite rather than refusing the close:
 * §6.6 is explicit that a member is never blocked from ending a conversation.
 * Submitting again with the same line goes through — the second submit carries
 * `acknowledged`, which is the member choosing to keep their words.
 */
export async function closeChat(
  _prev: ChatActionState,
  formData: FormData,
): Promise<ChatActionState> {
  await requireMember();

  const chatId = String(formData.get("chatId") ?? "");
  const templateId = String(formData.get("templateId") ?? "");
  const personalLine = String(formData.get("personalLine") ?? "").trim();
  const acknowledged = String(formData.get("acknowledged") ?? "") === "yes";

  if (!chatId) return { error: "That chat isn't there any more." };
  /*
   * Narrowed, not just membership-tested. `close_chat`'s typed signature wants
   * one of §9.2's six ids, and a guard that only returns a boolean leaves the
   * value as `string` — so the RPC call would either not compile or need a cast
   * that throws the check away.
   */
  if (!isTemplateId(templateId)) {
    return { error: "Pick how you want to say it." };
  }
  if (personalLine.length > 500) {
    return { error: "Keep the personal line under 500 characters." };
  }

  /*
   * `null` means the check did not run — §5's own note on the column. A
   * template-only closure skips it (there is no line to check), and so does a
   * missing API key or an outage, which is why the value is nullable rather
   * than defaulting to `true`.
   */
  let tonePassed: boolean | null = null;

  if (personalLine) {
    const result = await checkTone(personalLine);
    tonePassed = toneCheckConfigured() ? result.pass : null;

    if (!result.pass && !acknowledged) {
      return { suggestion: result.suggestion };
    }
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("close_chat", {
    p_chat_id: chatId,
    p_template_id: templateId,
    p_personal_line: personalLine || null,
    p_tone_check_passed: tonePassed,
  });

  if (error) {
    console.error(`[chat] close_chat ${chatId}: ${error.message}`);
    if (/not open|closed|state/i.test(error.message)) return { error: CLOSED };
    return { error: "That didn't send. Try again." };
  }

  revalidatePath(`/chats/${chatId}`);
  revalidatePath("/chats");
  return { closed: true };
}
