"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
import type { Resolution } from "@/lib/reports";

export interface ResolveState {
  error?: string;
}

const RESOLUTIONS = ["dismissed", "warned", "removed"] as const;
const isResolution = (value: string): value is Resolution =>
  (RESOLUTIONS as readonly string[]).includes(value);

/**
 * Resolving a report — spec §7.3.
 *
 * `requireAdmin()` is re-checked here for the reason the admissions action
 * gives: a layout guard protects rendering, and a Server Action is a POST
 * endpoint a session cookie can reach directly. `resolve_report` checks
 * `is_admin()` in SQL as well, which is the boundary that actually holds.
 *
 * Removal asks for a note and the other two do not. Dismissing is the absence
 * of an action and warning is a small one, but removing somebody from the
 * season is the console's most consequential act and the audit row for it
 * should say why in a sentence a person wrote — six months later, "removed" on
 * its own explains nothing to whoever is reading the trail.
 */
export async function resolve(
  _prev: ResolveState,
  formData: FormData,
): Promise<ResolveState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const resolution = String(formData.get("resolution") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!id) return { error: "That report isn't there any more." };
  if (!isResolution(resolution)) return { error: "That isn't a resolution we can record." };
  if (resolution === "removed" && note.length < 3) {
    return { error: "Removing somebody needs a reason. It stays internal, but it has to exist." };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("resolve_report", {
    p_report_id: id,
    p_resolution: resolution,
    p_note: note || null,
  });

  if (error) {
    console.error(`[admin] resolve_report ${id} → ${resolution}: ${error.message}`);

    // Named precisely, like the 0009 case next door: without 0017 the function
    // does not exist at all, and "that didn't save" would send somebody looking
    // at their session.
    if (/could not find the function|PGRST202/i.test(error.message)) {
      return {
        error:
          "This database hasn't had 0017_resolve_report.sql applied, so reports can be read " +
          "but not resolved. Apply it and try again.",
      };
    }
    if (/already resolved/i.test(error.message)) {
      return { error: `${error.message.replace(/^.*?:\s*/, "")} Reload to see it.` };
    }
    if (/only an admin/i.test(error.message)) {
      return { error: "That account isn't on the admin list any more." };
    }
    return { error: "That didn't save. Try again." };
  }

  revalidatePath("/reports");
  revalidatePath(`/reports/${id}`);
  return {};
}
