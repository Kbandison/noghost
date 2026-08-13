import type { Gender, MemberStatus } from "@noghost/types";
import { supabaseServer } from "./supabase";

/**
 * What the settings tab reads — spec §7.2's fourth tab.
 *
 * `notification_prefs` has one row per member and, for most of them, no row at
 * all: nothing has ever created one. So the defaults live here and match the
 * column defaults exactly, and the page renders identically whether or not a
 * row exists. `release-drops` already reads the table the same way
 * (`pref?.drop_push ?? true`), which is the behaviour this mirrors rather than
 * invents.
 */

export interface NotificationPrefs {
  dropPush: boolean;
  dropSms: boolean;
  fuseWarnings: boolean;
  emailUpdates: boolean;
  /** TCPA §9.8: the toggle is not consent, this is. */
  smsOptInAt: string | null;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  dropPush: true,
  dropSms: false,
  fuseWarnings: true,
  emailUpdates: true,
  smsOptInAt: null,
};

export interface Identity {
  firstName: string;
  age: number;
  gender: Gender;
  seeking: Gender[];
  neighborhood: string | null;
  status: MemberStatus;
  /** True once admitted — the trigger refuses identity edits from here on. */
  locked: boolean;
  phone: string | null;
}

export async function readSettings(): Promise<{
  identity: Identity;
  prefs: NotificationPrefs;
} | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: prefs }, { data: application }] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name,birthdate,gender,seeking,neighborhood,status,phone")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("notification_prefs")
      .select("drop_push,drop_sms,fuse_warnings,email_updates,sms_opt_in_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    /*
     * The lock is a fact about the application, not about the profile, because
     * that is what `freeze_identity_after_admission()` actually checks. Reading
     * it from the same place the trigger does means the screen cannot claim a
     * field is editable that the database will refuse.
     */
    supabase
      .from("applications")
      .select("status")
      .eq("user_id", user.id)
      .in("status", ["admitted", "claimed"])
      .limit(1)
      .maybeSingle(),
  ]);

  if (!profile) return null;

  const birth = new Date(profile.birthdate);
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDay = now.getUTCMonth() * 100 + now.getUTCDate();
  if (monthDay < birth.getUTCMonth() * 100 + birth.getUTCDate()) age -= 1;

  return {
    identity: {
      firstName: profile.first_name,
      age,
      gender: profile.gender,
      seeking: profile.seeking,
      neighborhood: profile.neighborhood,
      status: profile.status,
      locked: Boolean(application),
      phone: profile.phone,
    },
    prefs: prefs
      ? {
          dropPush: prefs.drop_push,
          dropSms: prefs.drop_sms,
          fuseWarnings: prefs.fuse_warnings,
          emailUpdates: prefs.email_updates,
          smsOptInAt: prefs.sms_opt_in_at,
        }
      : DEFAULT_PREFS,
  };
}
