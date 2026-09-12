"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ApplicationStatus } from "@noghost/types";
import { requireAdmin } from "@/lib/auth";
import { listQueue } from "@/lib/admissions";
import { supabaseServer } from "@/lib/supabase";

export interface DecisionState {
  error?: string;
}

/** The three outcomes a reviewer can reach from `under_review`. */
const DECISIONS = ["admitted", "waitlisted", "rejected"] as const;
type Decision = (typeof DECISIONS)[number];

const isDecision = (v: string): v is Decision => (DECISIONS as readonly string[]).includes(v);

export async function decide(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  /*
   * Re-checked here, deliberately.
   *
   * The console layout calls requireAdmin() too, but a layout guard only
   * protects rendering. A Server Action is a POST endpoint that anyone holding
   * a session cookie can invoke directly, without ever passing through the
   * layout that "protects" it.
   */
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!id || !isDecision(decision)) return { error: "That isn't a decision we can record." };

  // Spec §7.3: reject carries a reason. It is internal-only — SELECT on
  // `applications.rejection_reason` is revoked from `authenticated`, so the
  // applicant never reads it — but a rejection with no recorded reason is
  // exactly what makes an admissions process impossible to review later.
  if (decision === "rejected" && reason.length < 3) {
    return { error: "Give a reason. It stays internal, but it has to exist." };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("advance_application", {
    p_application_id: id,
    p_new_status: decision satisfies ApplicationStatus,
    p_reason: decision === "rejected" ? reason : null,
  });

  if (error) {
    console.error(`[admin] advance_application ${id} → ${decision}: ${error.message}`);

    // The one failure worth naming precisely. Before migration 0009 the
    // function is service-role only, so an admin's own session is refused —
    // and calling it as the service role instead would strip the actor from
    // the audit trail, which is the whole reason 0009 exists.
    if (/permission denied|does not exist|PGRST202/i.test(error.message)) {
      return {
        error:
          "This database hasn't had 0009_admin_rpc_attribution.sql applied, so decisions can't " +
          "be attributed to you. Apply it and try again.",
      };
    }
    if (/Cannot move an application/i.test(error.message)) {
      return { error: "Someone already decided this one. Reload to see where it landed." };
    }
    return { error: "The decision didn't save. Try again." };
  }

  revalidatePath("/admissions");
  revalidatePath("/");

  /*
   * Straight to the next one in the queue.
   *
   * A reviewer works through hundreds of these in a sitting; bouncing back to
   * a list and re-finding your place after every decision is the difference
   * between a tool and a chore.
   */
  const remaining = await listQueue("under_review");
  const next = remaining.find((row) => row.id !== id);
  redirect(next ? `/admissions/${next.id}` : "/admissions");
}

export interface CompState {
  error?: string;
  done?: boolean;
}

/**
 * Giving an admitted applicant their seat without a payment — 0038.
 *
 * `season_members` is what `memberGate` reads, and until 0038 the Stripe
 * webhook was the only thing in the product that could write it. With no Stripe
 * keys there was no path from "admitted" to "member" at all: the review screen
 * told people their seat was held and offered nothing to press, forever.
 *
 * Comps are also just part of running this — the review team, press, the
 * founder, and the support case where a card failed three times and the person
 * is plainly in.
 *
 * A reason is required by the function as well as here. "Why is this member not
 * in the revenue figures" needs an answer that outlives whoever knew it.
 */
export async function compSeat(_prev: CompState, formData: FormData): Promise<CompState> {
  // Same reasoning as `decide`: a layout guard protects rendering, and this is
  // a POST endpoint anyone with a session cookie can invoke directly.
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!id) return { error: "No application to comp." };
  if (reason.length < 3) {
    return { error: "Give a reason. A free seat with no explanation is untraceable." };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("comp_seat", {
    p_application_id: id,
    p_reason: reason,
  });

  if (error) {
    console.error(`[admin] comp_seat ${id}: ${error.message}`);

    // Named precisely, because each of these tells the reviewer a different
    // thing to do next.
    if (/PGRST202|does not exist/i.test(error.message)) {
      return {
        error:
          "This database hasn't had 0038_a_seat_without_a_payment.sql applied, so seats can't " +
          "be comped. Apply it and try again.",
      };
    }
    if (/Only an admitted application/i.test(error.message)) {
      return { error: "Only an admitted application can be comped. Admit them first." };
    }
    if (/insufficient_privilege|Only an admin/i.test(error.message)) {
      return { error: "Your account isn't an active admin any more. Sign in again." };
    }
    return { error: "The seat didn't save. Try again." };
  }

  revalidatePath("/admissions");
  revalidatePath(`/admissions/${id}`);
  return { done: true };
}

export interface PhotoState {
  error?: string;
}

/**
 * Approving or hiding one photo — spec §7.3's "photo re-review".
 *
 * One at a time, by path. `set_photo_approval` rewrites a single element of the
 * jsonb array rather than the whole thing, so a reviewer approving a photo and
 * a member reordering theirs in the same moment do not overwrite each other.
 *
 * The flag is not cosmetic: 0020 makes `visible_profiles` filter on it, so this
 * action is the only thing that puts a photo in front of another member.
 */
export async function setPhotoApproval(
  _prev: PhotoState,
  formData: FormData,
): Promise<PhotoState> {
  await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const path = String(formData.get("path") ?? "");
  const approved = String(formData.get("approved") ?? "") === "yes";

  if (!userId || !path) return { error: "That photo isn't there any more." };

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("set_photo_approval", {
    p_user_id: userId,
    p_path: path,
    p_approved: approved,
  });

  if (error) {
    console.error(`[admin] set_photo_approval ${path} → ${approved}: ${error.message}`);
    if (/could not find the function|PGRST202/i.test(error.message)) {
      return {
        error:
          "This database hasn't had 0020_photo_approval.sql applied, so photos can't be " +
          "approved — and nothing is filtering on the flag either, so every photo is live.",
      };
    }
    if (/not on this profile/i.test(error.message)) {
      return { error: "That photo has moved. Reload the page." };
    }
    return { error: "That didn't save. Try again." };
  }

  revalidatePath(`/admissions/${userId}`);
  revalidatePath("/photos");
  return {};
}
