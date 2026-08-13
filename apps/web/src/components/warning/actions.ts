"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/member";
import { supabaseServer } from "@/lib/supabase";

export interface AcknowledgeState {
  error?: string;
}

/**
 * Acknowledging a warning.
 *
 * `read_at` is the whole record. There is no separate "acknowledged" column and
 * this deliberately does not add one: the member app never marks anything read
 * automatically — nothing else reads `notifications` at all — so on this row the
 * timestamp means exactly one thing, which is that a person pressed a button
 * saying they had read it.
 *
 * The write goes through the member's own session and `owner marks a
 * notification read` is what permits it, scoped to their own rows. Filtering by
 * id *and* template here is not a second boundary; it stops a stray id from
 * clearing some other notification once other templates get surfaces.
 */
export async function acknowledgeWarning(
  _prev: AcknowledgeState,
  formData: FormData,
): Promise<AcknowledgeState> {
  await requireMember();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "That didn't go through. Reload and try again." };

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("template", "member_warned")
    .select("id");

  if (error) {
    console.error(`[warning] acknowledge ${id}: ${error.message}`);
    return { error: "That didn't go through. Try again." };
  }
  // RLS returns zero rows rather than an error when nothing matches, so without
  // this the screen would clear itself on a write that never happened.
  if (!data || data.length === 0) {
    return { error: "That didn't go through. Reload and try again." };
  }

  revalidatePath("/", "layout");
  return {};
}
