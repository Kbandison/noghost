"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase";

/**
 * Mark everything on the list as seen.
 *
 * Through the member's own session: the policy allows an owner to update their
 * own rows, and 0024's trigger narrows that to `read_at` no matter what this
 * sends — a guard worth having precisely because this is the only caller and
 * the only caller is easy to trust and easy to change.
 */
export async function markNotificationsRead(): Promise<void> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null)
    .not("sent_at", "is", null);

  if (error) {
    console.error(`[notifications] marking read for ${user.id}: ${error.message}`);
    return;
  }
  revalidatePath("/notifications");
}
