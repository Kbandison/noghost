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

export interface ProfilePhotoRow {
  path: string;
  /** False until a reviewer approves it — see 0020. Members read their own. */
  approved: boolean;
}

export interface Identity {
  firstName: string;
  age: number;
  gender: Gender;
  seeking: Gender[];
  neighborhood: string | null;
  /**
   * The rounded point and the radius — matching input, not decoration.
   *
   * Read here so the settings page can seed the editor with what is already
   * stored. It is never rendered as a number; `LocationField` shows a place
   * name and the radius as a chip.
   */
  lat: number | null;
  lng: number | null;
  travelRadiusKm: number | null;
  status: MemberStatus;
  /** True once admitted — the trigger refuses identity edits from here on. */
  locked: boolean;
  phone: string | null;
  /**
   * Their own photos, approved or not.
   *
   * Read from `profiles` rather than `visible_profiles`, which is the whole
   * point: 0020 hides unapproved photos from everyone *else*, and the owner
   * needs to see them to know one is waiting rather than to think it vanished.
   */
  photos: ProfilePhotoRow[];
  prompts: { prompt_id: string; answer: string }[];
  voiceIntroPath: string | null;
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
      .select(
        "first_name,birthdate,gender,seeking,neighborhood,lat,lng,travel_radius_km,status,phone,photos,prompts,voice_intro_path",
      )
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
      lat: profile.lat === null ? null : Number(profile.lat),
      lng: profile.lng === null ? null : Number(profile.lng),
      travelRadiusKm: profile.travel_radius_km,
      seeking: profile.seeking,
      neighborhood: profile.neighborhood,
      status: profile.status,
      locked: Boolean(application),
      phone: profile.phone,
      photos: Array.isArray(profile.photos)
        ? (profile.photos as { path: string; approved?: boolean }[]).map((photo) => ({
            path: photo.path,
            approved: photo.approved === true,
          }))
        : [],
      prompts: Array.isArray(profile.prompts)
        ? (profile.prompts as { prompt_id: string; answer: string }[])
        : [],
      voiceIntroPath: profile.voice_intro_path,
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
