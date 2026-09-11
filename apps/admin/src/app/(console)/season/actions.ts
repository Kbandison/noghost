"use server";

import { revalidatePath } from "next/cache";
import type { SeasonPhase } from "@noghost/types";
import { requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";

export interface SeasonState {
  error?: string;
  saved?: boolean;
}

const MISSING =
  "This database hasn't had 0027_the_season_console.sql applied, so there's nothing to save with yet.";
const missing = (m: string) => /could not find the function|PGRST202/i.test(m);

/** "" and "unchanged" are different things; only the second leaves a field alone. */
const num = (fd: FormData, key: string): number | null => {
  const raw = String(fd.get(key) ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};
const text = (fd: FormData, key: string): string | null => {
  const raw = String(fd.get(key) ?? "").trim();
  return raw === "" ? null : raw;
};
/** `datetime-local` gives a naive string; the column wants an instant. */
const stamp = (fd: FormData, key: string): string | null => {
  const raw = String(fd.get(key) ?? "").trim();
  if (raw === "") return null;
  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
};

/**
 * Editing a season — spec §7.3's Season console.
 *
 * Every field goes through `update_season`, which audits what changed rather
 * than that something did. `admins manage seasons` would permit a direct
 * UPDATE, and that is exactly the version this avoids: a price edited with
 * nothing recording who did it.
 */
export async function saveSeason(
  _prev: SeasonState,
  formData: FormData,
): Promise<SeasonState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "That season isn't there any more." };

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("update_season", {
    p_season_id: id,
    p_name: text(formData, "name"),
    p_city: text(formData, "city"),
    p_applications_open_at: stamp(formData, "applications_open_at"),
    p_starts_at: stamp(formData, "starts_at"),
    p_ends_at: stamp(formData, "ends_at"),
    p_member_cap: num(formData, "member_cap"),
    p_drop_time: text(formData, "drop_time"),
    p_drop_max: num(formData, "drop_max"),
    p_fuse_days: num(formData, "fuse_days"),
    p_claim_hours: num(formData, "claim_hours"),
    p_price_early_cents: num(formData, "price_early_cents"),
    p_price_standard_cents: num(formData, "price_standard_cents"),
    p_early_bird_cap: num(formData, "early_bird_cap"),
    p_encore_start_week: num(formData, "encore_start_week"),
    p_timezone: text(formData, "timezone"),
    p_seats_display_cap: num(formData, "seats_display_cap"),
    // Null is a real value here — "show the truth" — so clearing it needs a flag.
    p_clear_seats_cap: String(formData.get("seats_display_cap") ?? "").trim() === "",
  });

  if (error) {
    console.error(`[admin] update_season ${id}: ${error.message}`);
    if (missing(error.message)) return { error: MISSING };
    // The database's own check constraints say the useful thing here — a
    // negative cap, an end before a start — so they are passed through.
    return { error: /violates check constraint/i.test(error.message)
      ? "That combination isn't allowed: check the dates and that every number is positive."
      : "That didn't save." };
  }

  revalidatePath("/season");
  return { saved: true };
}

const PHASES: SeasonPhase[] = [
  "draft", "applications_open", "pre_season", "live", "finale_week", "closed",
];

/**
 * Changing the phase — §7.3's "phase transitions (with confirm gates)".
 *
 * `season-tick` moves a season forward on its own and deliberately never
 * publishes a draft or moves anything backwards. This is the human half: the
 * decisions a clock should not be making.
 *
 * A reason is required for anything that moves backwards or closes a season,
 * because those are the ones somebody will be asking about later. Closing ends
 * every open conversation at the next fuse sweep.
 */
export async function changePhase(
  _prev: SeasonState,
  formData: FormData,
): Promise<SeasonState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const phase = String(formData.get("phase") ?? "") as SeasonPhase;
  const from = String(formData.get("from") ?? "") as SeasonPhase;
  const reason = String(formData.get("reason") ?? "").trim();

  if (!id || !PHASES.includes(phase)) return { error: "That isn't a phase." };

  const backwards = PHASES.indexOf(phase) < PHASES.indexOf(from);
  if ((backwards || phase === "closed") && reason.length < 3) {
    return {
      error: backwards
        ? "Moving a season backwards needs a reason. It stays internal, but it has to exist."
        : "Closing a season ends every open conversation. Say why.",
    };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("set_season_phase", {
    p_season_id: id,
    p_phase: phase,
    p_reason: reason || null,
  });

  if (error) {
    console.error(`[admin] set_season_phase ${id} → ${phase}: ${error.message}`);
    return { error: missing(error.message) ? MISSING : "That didn't save." };
  }

  revalidatePath("/season");
  return { saved: true };
}
