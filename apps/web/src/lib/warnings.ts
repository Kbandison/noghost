import { isReportReasonId, reportReasonById } from "@noghost/config/copy";
import { supabaseServer } from "./supabase";

/**
 * The warning a moderator sent, if there is one waiting.
 *
 * `notifications` has existed since 0005 and nothing has ever read it — every
 * template in the product is enqueued and left there. This is the first row
 * type with a surface, and it got one first on purpose: a warning that sits in
 * a queue is indistinguishable from no warning at all, which is the state
 * §7.3's "warn member" was in until now.
 *
 * Read through the member's own session, so `owner reads own inapp
 * notifications` is what scopes it — the policy already restricts to
 * `channel = 'inapp'` and to their own rows, so there is no filtering here that
 * a mistake could widen.
 */

export interface PendingWarning {
  id: string;
  /** The reported category, in words. Never who reported it — see 0017. */
  category: string;
  sentAt: string;
}

export async function pendingWarning(): Promise<PendingWarning | null> {
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("notifications")
    .select("id,payload,created_at")
    .eq("template", "member_warned")
    .is("read_at", null)
    // Oldest first: two warnings mean two incidents, and they are acknowledged
    // in the order they happened rather than newest-shouts-loudest.
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Never fatal. A warning that cannot be read must not take the whole app
    // down with it — the member would lose every screen over a banner.
    console.error(`[warning] read: ${error.message}`);
    return null;
  }
  if (!data) return null;

  const payload = (data.payload ?? {}) as { reason?: string };
  const reason = payload.reason ?? "";

  return {
    id: data.id,
    /*
     * Falls back rather than throwing. `reports.reason` is free text in the
     * database, and a category retired from `REPORT_REASONS` after somebody was
     * warned under it would otherwise crash the one screen they cannot skip.
     */
    category: isReportReasonId(reason)
      ? reportReasonById(reason).label.toLowerCase()
      : "something that broke the Community Standards",
    sentAt: data.created_at,
  };
}
