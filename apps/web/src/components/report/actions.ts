"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isReportReasonId } from "@noghost/config/copy";
import { requireMember } from "@/lib/member";
import { supabaseServer } from "@/lib/supabase";

export interface ReportState {
  error?: string;
}

const MAX_DETAIL = 2000; // matches the column's check constraint

/**
 * Reporting a member — spec §7.2, and the four promises the Community
 * Standards page makes in public.
 *
 * The protective half is not written here and deliberately so. `report_member`
 * inserts the row, and `has_report_between()` — which `can_view_profile()`
 * consults — does the rest: from that moment the two of them are invisible to
 * each other and cannot be matched again this season. No code in the app has to
 * remember to enforce it, which is why it cannot be forgotten.
 *
 * What this file owes the member is that it *lands*. A report that fails
 * quietly is worse than a missing feature, because they will believe it worked
 * and go on believing it. So there is no silent path out of here: every branch
 * either files or says why not.
 */
export async function reportMember(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const member = await requireMember();

  const reportedId = String(formData.get("reportedId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const chatId = String(formData.get("chatId") ?? "");
  const detail = String(formData.get("detail") ?? "").trim();

  if (!reportedId) return { error: "We couldn't tell who this is about. Reload and try again." };
  if (!isReportReasonId(reason)) return { error: "Pick what happened." };
  if (detail.length > MAX_DETAIL) {
    return { error: `That's longer than ${MAX_DETAIL} characters — trim it a little.` };
  }
  if (reportedId === member.id) return { error: "You can't report yourself." };

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("report_member", {
    p_reported_id: reportedId,
    p_reason: reason,
    p_chat_id: chatId || null,
    p_detail: detail || null,
  });

  if (error) {
    console.error(`[report] ${member.id} → ${reportedId} (${reason}): ${error.message}`);
    if (/cannot report yourself/i.test(error.message)) {
      return { error: "You can't report yourself." };
    }
    if (/not your chat/i.test(error.message)) {
      return { error: "That chat isn't yours." };
    }
    return { error: "That didn't send. Try again, or email us — the address is above." };
  }

  /*
   * Everything, because a report changes what the member can see everywhere at
   * once: the reported person leaves their drop, their inbox and their chat
   * list in the same instant, and a stale page showing someone they just
   * reported is its own small harm.
   */
  revalidatePath("/tonight");
  revalidatePath("/inbox");
  // The list lives at /inbox now; /chats is only a redirect.
  revalidatePath("/inbox");
  if (chatId) revalidatePath(`/chats/${chatId}`);

  /*
   * A page, not a card inside the sheet.
   *
   * The sheet cannot report its own success: revalidating re-renders the route
   * that contains it, and by then the reported member is invisible — so the
   * drop card, the inbox note or the chat header the sheet was sitting in has
   * gone, taking the confirmation with it. That was not a hypothetical; the
   * first browser run of this flow filed the report correctly and showed the
   * member nothing at all.
   *
   * Redirecting also makes the three surfaces behave identically, which matters
   * for something people do once, under stress, and should not have to
   * interpret.
   */
  redirect("/reported");
}
