"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/member";
import { supabaseServer } from "@/lib/supabase";

/**
 * Dismissing an announcement.
 *
 * `read_at` is the dismissal — the same column the warning screen uses, and the
 * only column 0022's guard lets a member write on their own notification. There
 * is deliberately no "mark unread": an announcement is something you were told,
 * not a task, and a list you can put back is a list that grows.
 */
export async function dismissBroadcast(formData: FormData): Promise<void> {
  await requireMember();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);

  if (error) console.error(`[broadcast] dismiss ${id}: ${error.message}`);

  revalidatePath("/", "layout");
}
