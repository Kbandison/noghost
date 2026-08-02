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
