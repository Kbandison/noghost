import {
  dropDateFor,
  dropTimeMinutes,
  isSeasonServing,
  localParts,
  seasonWeek,
} from "@noghost/logic";
import type { CardAction, ProfilePhoto, ProfilePromptAnswer, SeasonPhase } from "@noghost/types";
import { supabaseServer } from "./supabase";
import { signedVoiceUrls } from "./voice-urls";

/**
 * Tonight's drop, as the member's own session can see it.
 *
 * Every read here runs under RLS, and that is doing real work rather than being
 * a formality. `drops` is only selectable when `released_at is not null`, and
 * `visible_profiles` is gated on `can_view_profile`, which asks the same
 * question. So an unreleased drop is not merely hidden by this code — it is
 * unreadable, and a bug in this file cannot leak one.
 */

export interface DropCardView {
  cardId: string;
  action: CardAction;
  isEncore: boolean;
  /** The week they were passed on, for the encore banner. Null when not an encore. */
  encoreWeek: number | null;
  profile: {
    id: string;
    firstName: string;
    age: number;
    neighborhood: string | null;
    occupation: string | null;
    heightCm: number | null;
    photos: ProfilePhoto[];
    prompts: ProfilePromptAnswer[];
    interests: string[];
    voiceIntroPath: string | null;
    /** Signed from `voice-intros`, or null — see `signedVoiceUrls`. */
    voiceIntroUrl: string | null;
  };
}

export type DropState =
  /**
   * No season is serving. Three different situations, and the screen must not
   * conflate them — see `noSeasonReason`. `endsAt` and `phase` travel with it
   * because "started but not yet serving" is indistinguishable from "over"
   * without them, and that mistake tells a paying member on day one that their
   * season has ended.
   */
  | {
      kind: "no-season";
      seasonName: string | null;
      startsAt: string | null;
      endsAt: string | null;
      phase: SeasonPhase | null;
    }
  /** Serving, but tonight's drop has not been released yet. */
  | { kind: "before-release"; releasesAt: string }
  /** Released with nothing in it. Honest, and its own screen (§9.6). */
  | { kind: "quiet-night"; nextReleaseAt: string }
  /** Released with cards. `pending` may be empty once they've answered them all. */
  | { kind: "released"; cards: DropCardView[]; nextReleaseAt: string };

/**
 * The next moment a drop lands, as an instant.
 *
 * Built by walking the season's local wall clock rather than by adding 24 hours
 * to anything: on a DST boundary the gap between two 8:00 PMs is 23 or 25
 * hours, and a countdown that assumes 24 is visibly wrong for a day.
 */
function nextRelease(now: string, timezone: string, dropTime: string): string {
  const target = dropTimeMinutes(dropTime);
  const { hour, minute } = localParts(now, timezone);
  const minutesIntoDay = hour * 60 + minute;

  // Same-day if the drop hasn't landed yet, otherwise tomorrow. Probing at
  // hourly steps and re-reading the local clock keeps this correct across a
  // changeover instead of assuming a fixed offset.
  let probe = Date.parse(now) + (minutesIntoDay < target ? 0 : 86_400_000);
  for (let i = 0; i < 48; i += 1) {
    const at = new Date(probe).toISOString();
    const parts = localParts(at, timezone);
    const delta = target - (parts.hour * 60 + parts.minute);
    if (delta === 0) return at;
    probe += delta * 60_000;
    if (Math.abs(delta) < 1) break;
  }
  return new Date(probe).toISOString();
}

function photoList(value: unknown): ProfilePhoto[] {
  return Array.isArray(value) ? (value as ProfilePhoto[]) : [];
}

function promptList(value: unknown): ProfilePromptAnswer[] {
  return Array.isArray(value) ? (value as ProfilePromptAnswer[]) : [];
}

export async function tonightsDrop(memberId: string, now: string): Promise<DropState> {
  const supabase = await supabaseServer();

  const { data: season } = await supabase
    .from("seasons")
    .select("id,name,phase,starts_at,ends_at,timezone,drop_time")
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!season || !isSeasonServing(season.phase, season.starts_at, season.ends_at, now)) {
    return {
      kind: "no-season",
      seasonName: season?.name ?? null,
      startsAt: season?.starts_at ?? null,
      endsAt: season?.ends_at ?? null,
      phase: (season?.phase as SeasonPhase | undefined) ?? null,
    };
  }

  const releasesAt = nextRelease(now, season.timezone, season.drop_time);
  const dropDate = dropDateFor(now, season.timezone);

  const { data: drop } = await supabase
    .from("drops")
    .select("id,released_at")
    .eq("season_id", season.id)
    .eq("user_id", memberId)
    .eq("drop_date", dropDate)
    .maybeSingle();

  /*
   * No row means one of three things — not built, built but not released, or
   * released and unreadable for some other reason — and the member should be
   * told the same thing in all three: it hasn't landed. Distinguishing them
   * here would leak the build schedule and help nobody.
   */
  if (!drop) return { kind: "before-release", releasesAt };

  /*
   * Ordered by `(created_at, id)`, not `created_at` alone.
   *
   * `generate-drops` writes a member's three cards in one batch, so they share
   * a `created_at` to the microsecond and the timestamp cannot order them.
   * Postgres is then free to return any order — and it changes as soon as one
   * row is updated, because an UPDATE rewrites the tuple and moves it in the
   * heap. The visible symptom is ugly: pass on someone, and a *different*
   * person slides into the slot you were reading.
   *
   * The algorithm's ranking is not preserved here and cannot be — the score
   * lives in `buildDrop`'s return value, not in a column. §6.1 specifies which
   * three people are served, not what order they are read in, so a stable order
   * is the requirement. Strongest-first would need a `rank` column.
   */
  const { data: cards } = await supabase
    .from("drop_cards")
    .select("id,shown_profile_id,is_encore,action")
    .eq("drop_id", drop.id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (!cards || cards.length === 0) {
    return { kind: "quiet-night", nextReleaseAt: releasesAt };
  }

  const shownIds = cards.map((card) => card.shown_profile_id);

  const [{ data: profiles }, { data: passes }] = await Promise.all([
    supabase
      .from("visible_profiles")
      .select(
        "id,first_name,age,neighborhood,occupation,height_cm,photos,prompts,interests,voice_intro_path",
      )
      .in("id", shownIds),
    // For the encore banner's "you passed on them in week N". Their own earlier
    // cards, which RLS already scopes to drops they own.
    supabase
      .from("drop_cards")
      .select("shown_profile_id,acted_at,drop_id")
      .in("shown_profile_id", shownIds)
      .eq("action", "passed"),
  ]);

  const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  const passedWeek = new Map<string, number>();
  for (const pass of passes ?? []) {
    if (pass.drop_id === drop.id || !pass.acted_at) continue;
    const week = seasonWeek(season.starts_at, pass.acted_at);
    const existing = passedWeek.get(pass.shown_profile_id);
    if (existing === undefined || week < existing) passedWeek.set(pass.shown_profile_id, week);
  }

  // At most three cards a night, so one batched signing call covers the drop.
  const introUrls = await signedVoiceUrls(
    (profiles ?? []).map((profile) => profile.voice_intro_path),
    "voice-intros",
  );

  const views = cards.flatMap((card): DropCardView[] => {
    const profile = byId.get(card.shown_profile_id);
    /*
     * A card whose profile is unreadable is dropped rather than rendered as a
     * blank. It means the other person is gone, or a report now sits between
     * them — `can_view_profile` returns false in both cases, and a ghost card
     * with no name is worse than one fewer card.
     */
    if (!profile) return [];

    return [
      {
        cardId: card.id,
        action: card.action,
        isEncore: card.is_encore,
        encoreWeek: card.is_encore ? (passedWeek.get(card.shown_profile_id) ?? null) : null,
        profile: {
          id: profile.id,
          firstName: profile.first_name,
          age: profile.age,
          neighborhood: profile.neighborhood,
          occupation: profile.occupation,
          heightCm: profile.height_cm,
          photos: photoList(profile.photos),
          prompts: promptList(profile.prompts),
          interests: profile.interests ?? [],
          voiceIntroPath: profile.voice_intro_path,
          voiceIntroUrl: profile.voice_intro_path
            ? (introUrls.get(profile.voice_intro_path) ?? null)
            : null,
        },
      },
    ];
  });

  if (views.length === 0) return { kind: "quiet-night", nextReleaseAt: releasesAt };

  return { kind: "released", cards: views, nextReleaseAt: releasesAt };
}
