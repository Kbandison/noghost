"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/member";
import { supabaseServer } from "@/lib/supabase";

/**
 * Answering a note — spec §6.2.
 *
 * Accept and decline are both final, and both are answers. There is no third
 * option and deliberately no way to leave it: the whole product is that a note
 * gets a real reply rather than silence.
 *
 * Neither branch trusts this file for authorisation. `respond_connect()` checks
 * that the caller is the recipient and that the connect is still pending, and
 * does the decline note in the same transaction as the status change — so a
 * decline cannot exist without its note, whatever a client does.
 */

export interface RespondState {
  error?: string;
  /** Set on a successful accept, so the pane can say the chat is open. */
  chatId?: string;
}

export async function respond(
  _prev: RespondState,
  formData: FormData,
): Promise<RespondState> {
  // Re-checked here: the layout guard protects rendering, not a POST endpoint.
  await requireMember();

  const connectId = String(formData.get("connectId") ?? "");
  const decision = String(formData.get("decision") ?? "");

  if (!connectId) return { error: "That note isn't there any more." };
  if (decision !== "accept" && decision !== "decline") {
    return { error: "That isn't an answer we can record." };
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("respond_connect", {
    p_connect_id: connectId,
    p_accept: decision === "accept",
  });

  if (error) {
    console.error(`[inbox] respond_connect ${connectId} (${decision}): ${error.message}`);

    if (/already answered/i.test(error.message)) {
      return { error: "You've already answered this one. Reload to see where it landed." };
    }
    if (/not your connect/i.test(error.message)) {
      return { error: "That note isn't yours to answer." };
    }

    /*
     * Named precisely, like the 0009 case in the admin console.
     *
     * Before `0011_enum_assignment_casts.sql`, `respond_connect` cannot seed
     * message #1 — a CASE of two string literals has type `text` and the
     * column is `message_kind` — so the insert fails and the whole accept rolls
     * back. "That didn't save" would send someone looking at their connection.
     */
    if (/is of type message_kind|expression is of type text/i.test(error.message)) {
      return {
        error:
          "This database hasn't had 0011_enum_assignment_casts.sql applied, so accepting " +
          "can't open the chat. Apply it and try again.",
      };
    }
    return { error: "That didn't save. Try again." };
  }

  revalidatePath("/inbox");
  // Accepting opens a chat whose fuse is already running, so the Tonight
  // header's counts and anything reading chat state need refreshing too.
  revalidatePath("/tonight");

  // `respond_connect` returns the new chat id on accept, and null on decline.
  return { chatId: typeof data === "string" ? data : undefined };
}
