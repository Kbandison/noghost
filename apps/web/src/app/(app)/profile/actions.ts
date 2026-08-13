"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServiceClient } from "@noghost/db/service";
import { requireMember } from "@/lib/member";
import { supabaseServer } from "@/lib/supabase";

export interface SettingsState {
  error?: string;
  saved?: boolean;
}

/**
 * Notification preferences — spec §5, §8 and §9.8.
 *
 * Two rules the database does not enforce and this does.
 *
 * **At least one channel for the drop.** `notification_prefs`' own comment says
 * "the drop alert and fuse warnings always keep at least one channel; the UI
 * enforces that, not the database". Turning both drop channels off would leave
 * somebody in a season whose entire mechanic is a thing that happens at 8pm,
 * with no way to know it happened. Refused, with the reason.
 *
 * **SMS consent is a timestamp, not a toggle.** §9.8 is TCPA: an SMS opt-in has
 * to be explicit and separately recorded, which is why `sms_opt_in_at` exists
 * alongside `drop_sms`. `release-drops` already reads it that way — a toggle
 * with no timestamp is not consent and gets no message — so this stamps it on
 * the transition into `true` and leaves it in place afterwards. Keeping the old
 * timestamp is deliberate: it is the record that consent was given at a
 * particular moment, and the toggle is what actually gates sending.
 */
export async function saveNotificationPrefs(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const member = await requireMember();

  const on = (name: string) => formData.get(name) === "on";
  const dropPush = on("dropPush");
  const dropSms = on("dropSms");
  const fuseWarnings = on("fuseWarnings");
  const emailUpdates = on("emailUpdates");

  if (!dropPush && !dropSms) {
    return {
      error:
        "Keep at least one way to hear about the drop. It's the one thing that happens at a " +
        "fixed time, and missing it costs you the night.",
    };
  }

  const supabase = await supabaseServer();
  const { data: existing } = await supabase
    .from("notification_prefs")
    .select("drop_sms,sms_opt_in_at")
    .eq("user_id", member.id)
    .maybeSingle();

  const alreadyConsented = Boolean(existing?.sms_opt_in_at);
  const smsOptInAt = dropSms
    ? (existing?.sms_opt_in_at ?? new Date().toISOString())
    : (existing?.sms_opt_in_at ?? null);

  const { error } = await supabase.from("notification_prefs").upsert(
    {
      user_id: member.id,
      drop_push: dropPush,
      drop_sms: dropSms,
      fuse_warnings: fuseWarnings,
      email_updates: emailUpdates,
      sms_opt_in_at: smsOptInAt,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error(`[settings] prefs ${member.id}: ${error.message}`);
    return { error: "That didn't save. Try again." };
  }

  // Not a UI concern, but worth being able to prove later: the moment consent
  // was first recorded is the thing a TCPA complaint asks about.
  if (dropSms && !alreadyConsented) {
    console.info(`[settings] sms opt-in recorded for ${member.id} at ${smsOptInAt}`);
  }

  revalidatePath("/profile");
  return { saved: true };
}

/**
 * Pausing — spec §7.2 and §6.4.
 *
 * Nothing is lost and the season keeps running; `set_account_paused` moves the
 * status and the drop's eligibility pass skips anyone who is not `active`.
 * Open chats are deliberately untouched: a paused member still owes the people
 * they are already talking to an answer, and closing those conversations would
 * turn a pause into a mass ghosting.
 */
export async function setPaused(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const member = await requireMember();
  const paused = String(formData.get("paused") ?? "") === "yes";

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("set_account_paused", { p_paused: paused });

  if (error) {
    console.error(`[settings] pause ${member.id} → ${paused}: ${error.message}`);
    return { error: "That didn't save. Try again." };
  }

  /*
   * The RPC returns void and RLS-style silent no-ops are exactly what 0012
   * exists to stop, so the effect is read back rather than assumed. Before 0012
   * the profiles trigger reverts the write inside the same statement and
   * returns success — which is how pausing looked healthy for two units.
   */
  const { data: after } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", member.id)
    .maybeSingle();

  const want = paused ? "paused" : "active";
  if (after?.status !== want) {
    return {
      error:
        "This database hasn't had 0012_status_writes_by_rpc.sql applied, so pausing can't " +
        "change your account. Apply it and try again.",
    };
  }

  revalidatePath("/profile");
  revalidatePath("/tonight");
  return { saved: true };
}

/**
 * Deleting your account — the privacy page's promise, §7.2's "delete account".
 *
 * Read the paths, erase the rows, then erase the files — in that order, and
 * the order took two goes to get right.
 *
 * Storage lives outside the transaction, so the paths have to be read while the
 * rows still name them. Deleting the files at that point, before the database
 * work, looked equivalent and is not: if the erasure then fails — an
 * unapplied migration, a dropped connection — the member's photos and selfie
 * are gone and their account is still standing. That is not recoverable by
 * trying again. Doing the rows first means a failure leaves everything exactly
 * as it was, and the only thing that can go wrong afterwards is an unreferenced
 * file in a private bucket that nothing points at.
 *
 * The service role is used for exactly this and nothing else here. Storage
 * policies deliberately have no member-facing delete for verification selfies
 * or for sent voice notes: a note that reached somebody is not the sender's to
 * retract. Erasure is the one case where they must go anyway, and it is the
 * server, not the member, that decides that.
 */
export async function deleteAccount(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const member = await requireMember();

  /*
   * Typed, not clicked. Everything else on this page is a button because
   * everything else is reversible; this is the one action that is not, and the
   * confirmation has to be something a mis-tap cannot produce.
   */
  if (String(formData.get("confirm") ?? "").trim().toLowerCase() !== "delete") {
    return { error: 'Type "delete" to confirm.' };
  }

  const supabase = await supabaseServer();
  const service = createServiceClient();

  // Paths are read before anything is erased, because the rows are what name
  // the objects.
  const [{ data: profile }, { data: verification }, { data: voice }] = await Promise.all([
    supabase.from("profiles").select("photos,voice_intro_path").eq("id", member.id).maybeSingle(),
    service.from("verifications").select("selfie_path").eq("user_id", member.id).maybeSingle(),
    service.from("messages").select("voice_path").eq("sender_id", member.id).not("voice_path", "is", null),
  ]);

  const photos = Array.isArray(profile?.photos)
    ? (profile.photos as { path?: string }[]).map((photo) => photo.path).filter(Boolean)
    : [];
  const voiceNotes = (voice ?? []).map((row) => row.voice_path).filter(Boolean) as string[];

  const removals: [string, string[]][] = [
    ["photos", photos as string[]],
    ["voice-notes", voiceNotes],
    ["voice-intros", profile?.voice_intro_path ? [profile.voice_intro_path] : []],
    ["verification-selfies", verification?.selfie_path ? [verification.selfie_path] : []],
  ];

  const { error } = await supabase.rpc("delete_own_account");
  if (error) {
    console.error(`[settings] delete ${member.id}: ${error.message}`);
    if (/could not find the function|PGRST202/i.test(error.message)) {
      return {
        error:
          "This database hasn't had 0018_delete_own_account.sql applied, so this can't finish. " +
          "Apply it and try again — nothing about your account has changed.",
      };
    }
    return { error: "That didn't finish. Try again, or email us." };
  }

  for (const [bucket, paths] of removals) {
    if (paths.length === 0) continue;
    const { error: removeError } = await service.storage.from(bucket).remove(paths);
    /*
     * Logged, not fatal, and by now genuinely recoverable: the rows are already
     * erased, so a file left behind is unreferenced and unreachable rather than
     * a photo still attached to a live account. A bucket that does not exist
     * yet (0015) lands here too.
     */
    if (removeError) {
      console.error(`[settings] erase ${bucket} for ${member.id}: ${removeError.message}`);
    }
  }

  await supabase.auth.signOut();
  redirect("/");
}
