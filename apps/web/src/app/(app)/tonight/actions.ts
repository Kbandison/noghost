"use server";

import { revalidatePath } from "next/cache";
import type { PromptRef } from "@noghost/types";
import { requireMember } from "@/lib/member";
import { supabaseServer } from "@/lib/supabase";

/**
 * The two things you can do with a card — spec §6.2.
 *
 * Both re-check `requireMember()`. The layout calls it too, but a layout guard
 * protects rendering; a Server Action is a POST endpoint anyone holding a
 * session cookie can invoke directly.
 *
 * Neither action trusts its own guard for authorisation, either. A pass is a
 * direct UPDATE, allowed by exactly one RLS policy that pins the transition to
 * `pending → passed` on a released drop the caller owns; a connect goes through
 * `send_connect()`, which re-validates everything in SQL. The checks here are
 * for the message, not for the boundary.
 */

export interface CardActionState {
  error?: string;
  /** Which card the error belongs to, so one failure doesn't blank the others. */
  cardId?: string;
}

export async function passCard(
  _prev: CardActionState,
  formData: FormData,
): Promise<CardActionState> {
  await requireMember();

  const cardId = String(formData.get("cardId") ?? "");
  if (!cardId) return { error: "That card isn't there any more." };

  const supabase = await supabaseServer();

  /*
   * A direct UPDATE, not an RPC — the one column a client may write, and only
   * `pending → passed`. `.select()` matters: with no matching row RLS returns
   * zero rows and no error, so without it a pass on someone else's card would
   * look like success.
   */
  const { data, error } = await supabase
    .from("drop_cards")
    .update({ action: "passed", acted_at: new Date().toISOString() })
    .eq("id", cardId)
    .eq("action", "pending")
    .select("id");

  if (error) {
    console.error(`[tonight] pass ${cardId}: ${error.message}`);
    return { error: "That didn't save. Try again.", cardId };
  }
  if (!data || data.length === 0) {
    return { error: "You've already answered this card.", cardId };
  }

  revalidatePath("/tonight");
  return {};
}

export async function sendConnect(
  _prev: CardActionState,
  formData: FormData,
): Promise<CardActionState> {
  await requireMember();

  const cardId = String(formData.get("cardId") ?? "");
  const refType = String(formData.get("refType") ?? "");
  const refId = String(formData.get("refId") ?? "");
  const reply = String(formData.get("reply") ?? "").trim();

  if (!cardId) return { error: "That card isn't there any more." };

  // §6.2: a connect must carry a reply to something specific. There is no like
  // button, and this is the rule that makes the inbox worth opening.
  if (refType !== "prompt" && refType !== "photo") {
    return { error: "Pick the prompt or photo you're replying to.", cardId };
  }
  if (!refId) {
    return { error: "Pick the prompt or photo you're replying to.", cardId };
  }
  if (reply.length < 2) {
    return { error: "Reply to something specific. It's the only way to say hello here.", cardId };
  }
  if (reply.length > 1000) {
    return { error: "Keep it under 1000 characters.", cardId };
  }

  const promptRef: PromptRef = { type: refType, id: refId };
  const supabase = await supabaseServer();

  const { error } = await supabase.rpc("send_connect", {
    p_card_id: cardId,
    p_prompt_ref: promptRef,
    p_reply_text: reply,
  });

  if (error) {
    console.error(`[tonight] send_connect ${cardId}: ${error.message}`);

    /*
     * `send_connect` raises with deliberate, member-readable text for the cases
     * a person can actually hit, so those are passed through rather than
     * replaced with something vaguer. Anything else is ours, not theirs.
     */
    const raw = error.message;
    if (/already answered|hasn't landed|only way to say hello/i.test(raw)) {
      return { error: raw.replace(/^.*?:\s*/, ""), cardId };
    }
    if (/duplicate key|unique/i.test(raw)) {
      return {
        error: "You've already had your one connect with this person this season.",
        cardId,
      };
    }
    return { error: "That didn't send. Try again.", cardId };
  }

  revalidatePath("/tonight");
  return {};
}
