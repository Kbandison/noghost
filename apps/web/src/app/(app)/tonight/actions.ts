"use server";

import { revalidatePath } from "next/cache";
import type { PromptRef } from "@noghost/types";
import { requireMember } from "@/lib/member";
import { supabaseServer } from "@/lib/supabase";
import { ACCEPTED_AUDIO, MAX_BYTES, baseMimeType, extensionFor } from "@/lib/voice";

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
  const member = await requireMember();

  const cardId = String(formData.get("cardId") ?? "");
  const refType = String(formData.get("refType") ?? "");
  const refId = String(formData.get("refId") ?? "");
  const reply = String(formData.get("reply") ?? "").trim();
  const audio = formData.get("audio");
  const spoken = audio instanceof File && audio.size > 0;

  if (!cardId) return { error: "That card isn't there any more." };

  // §6.2: a connect must carry a reply to something specific. There is no like
  // button, and this is the rule that makes the inbox worth opening.
  if (refType !== "prompt" && refType !== "photo") {
    return { error: "Pick the prompt or photo you're replying to.", cardId };
  }
  if (!refId) {
    return { error: "Pick the prompt or photo you're replying to.", cardId };
  }
  // A reply is words or a recording. `connects` has the same rule as a check
  // constraint and `send_connect` raises on it, so this is the sentence rather
  // than the boundary.
  if (!spoken && reply.length < 2) {
    return { error: "Reply to something specific. It's the only way to say hello here.", cardId };
  }
  if (reply.length > 1000) {
    return { error: "Keep it under 1000 characters.", cardId };
  }

  const promptRef: PromptRef = { type: refType, id: refId };
  const supabase = await supabaseServer();

  /*
   * A spoken reply lands in `connect-replies`, not `voice-notes`.
   *
   * The chat bucket authorises by chat id, and this reply exists precisely
   * because there is no chat yet — it is the thing that might create one. 0015
   * gives it a bucket whose folder is the *sender's* id, so the same rule holds
   * as everywhere else: the server builds the path, and the policy rather than
   * this code decides whether the write is allowed.
   */
  let voicePath: string | null = null;
  if (spoken) {
    if (audio.size > MAX_BYTES) return { error: "That recording is too large to send.", cardId };
    const mime = baseMimeType(audio.type);
    const extension = extensionFor(mime);
    if (!extension || !ACCEPTED_AUDIO.includes(mime as (typeof ACCEPTED_AUDIO)[number])) {
      return { error: "That audio format isn't one we can store.", cardId };
    }

    voicePath = `${member.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("connect-replies")
      .upload(voicePath, audio, { contentType: mime, upsert: false });

    if (uploadError) {
      console.error(`[tonight] reply upload ${cardId}: ${uploadError.message}`);
      if (/bucket not found/i.test(uploadError.message)) {
        return {
          error:
            "This database hasn't had 0015_voice_homes.sql applied, so a spoken reply has " +
            "nowhere to go. Write instead, or apply it and try again.",
          cardId,
        };
      }
      return { error: "That didn't send. Try again.", cardId };
    }
  }

  const { error } = await supabase.rpc("send_connect", {
    p_card_id: cardId,
    p_prompt_ref: promptRef,
    p_reply_text: reply || null,
    p_reply_voice_path: voicePath,
  });

  if (error) {
    /*
     * The upload happened first, so a refused send leaves audio behind. 0015's
     * delete policy matches only while nothing references the object, which is
     * exactly now — once `send_connect` succeeds it stops matching and the
     * recording is as immutable as the connect that carries it.
     */
    if (voicePath) {
      const { error: cleanupError } = await supabase.storage
        .from("connect-replies")
        .remove([voicePath]);
      if (cleanupError) console.error(`[tonight] orphan ${voicePath}: ${cleanupError.message}`);
    }
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
