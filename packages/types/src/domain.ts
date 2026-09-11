import type {
  ApplicationStatus,
  CardAction,
  ChatState,
  CheckinAnswer,
  ConnectStatus,
  DateStatus,
  MemberStatus,
  MessageKind,
  NotifChannel,
  SeasonPhase,
} from "./enums";

/** ISO-8601 timestamp string, as Supabase returns `timestamptz`. */
export type Timestamp = string;
/** ISO date string, `YYYY-MM-DD`. */
export type DateOnly = string;
export type UUID = string;

export type Gender = "man" | "woman" | "nonbinary";

export interface ProfilePhoto {
  path: string;
  order: number;
  approved: boolean;
}

export interface ProfilePromptAnswer {
  prompt_id: string;
  answer: string;
}

/** `profiles` — spec §5. Age is computed from `birthdate`, never stored. */
export interface Profile {
  id: UUID;
  first_name: string;
  birthdate: DateOnly;
  gender: Gender;
  seeking: Gender[];
  /**
   * Stated age preference and interest tags. Additions to spec §5 — the drop's
   * hard age filter and interest-overlap score (§6.1) have nothing to read
   * without them, and onboarding (§7.2) already collects both.
   */
  age_min: number;
  age_max: number;
  interests: string[];
  /** Free text on the card. Not a location — see `lat`/`lng` (0028). */
  neighborhood: string | null;
  /** Rounded to ~110m in the browser. Both halves or neither. */
  lat: number | null;
  lng: number | null;
  /** How far they will travel, in km. Null means they have not said. */
  travel_radius_km: number | null;
  height_cm: number | null;
  occupation: string | null;
  photos: ProfilePhoto[];
  prompts: ProfilePromptAnswer[];
/** Receipts and lifecycle mail (§7.4, 0026). Never a sign-in credential. */
  email: string | null;
    voice_intro_path: string | null;
  phone: string | null;
  status: MemberStatus;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/**
 * What another member is allowed to see — the shape returned by the
 * `visible_profiles` security-definer view (spec §5 profiles RLS). Phone,
 * birthdate and status never cross this boundary; `age` is derived server-side.
 */
export interface VisibleProfile {
  id: UUID;
  first_name: string;
  age: number;
  gender: Gender;
  neighborhood: string | null;
  height_cm: number | null;
  occupation: string | null;
  photos: ProfilePhoto[];
  prompts: ProfilePromptAnswer[];
  voice_intro_path: string | null;
  interests: string[];
}

/** `seasons` — every mechanic reads its configuration from this row. */
export interface Season {
  id: UUID;
  name: string;
  city: string;
  phase: SeasonPhase;
  applications_open_at: Timestamp | null;
  starts_at: Timestamp;
  ends_at: Timestamp;
  member_cap: number;
  drop_time: string;
  drop_max: number;
  fuse_days: number;
  claim_hours: number;
  price_early_cents: number;
  price_standard_cents: number;
  early_bird_cap: number;
  encore_start_week: number;
  /**
   * Caps the seats the marketing site shows (0027). Lowers only — it can hold
   * inventory back, never manufacture scarcity. Null shows the truth.
   */
  seats_display_cap: number | null;
  timezone: string;
  created_at: Timestamp;
}

export interface Verification {
  id: UUID;
  user_id: UUID;
  phone_verified_at: Timestamp | null;
  selfie_path: string | null;
  liveness_score: number | null;
  liveness_passed: boolean | null;
  admin_reviewed_by: UUID | null;
  admin_decision: "approved" | "rejected" | null;
  admin_notes: string | null;
  reviewed_at: Timestamp | null;
  created_at: Timestamp;
}

export interface Application {
  id: UUID;
  user_id: UUID;
  season_id: UUID;
  status: ApplicationStatus;
  admitted_at: Timestamp | null;
  claim_deadline: Timestamp | null;
  waitlist_position: number | null;
  rejection_reason: string | null;
  created_at: Timestamp;
}

export interface SeasonMember {
  id: UUID;
  user_id: UUID;
  season_id: UUID;
  stripe_payment_intent: string;
  price_paid_cents: number;
  joined_at: Timestamp;
  created_at: Timestamp;
}

export interface Drop {
  id: UUID;
  season_id: UUID;
  user_id: UUID;
  drop_date: DateOnly;
  released_at: Timestamp | null;
  created_at: Timestamp;
}

export interface DropCard {
  id: UUID;
  drop_id: UUID;
  shown_profile_id: UUID;
  is_encore: boolean;
  action: CardAction;
  acted_at: Timestamp | null;
  created_at: Timestamp;
}

/** What the connect reply points at — a specific prompt or a specific photo. */
export type PromptRef =
  | { type: "prompt"; id: string }
  | { type: "photo"; id: string };

export interface Connect {
  id: UUID;
  season_id: UUID;
  from_user: UUID;
  to_user: UUID;
  drop_card_id: UUID;
  prompt_ref: PromptRef;
  reply_text: string | null;
  reply_voice_path: string | null;
  status: ConnectStatus;
  responded_at: Timestamp | null;
  /**
   * The single 72h nudge to the recipient (§6.2). Null means not yet nudged,
   * and `connect-sweep` claims a row by setting it — the column and its partial
   * index have existed since 0003, but this field did not, so nothing could
   * write it without a type error.
   */
  nudged_at: Timestamp | null;
  created_at: Timestamp;
}

export interface Chat {
  id: UUID;
  season_id: UUID;
  connect_id: UUID;
  user_a: UUID;
  user_b: UUID;
  state: ChatState;
  fuse_expires_at: Timestamp;
  fuse_paused_at: Timestamp | null;
  warned_48h: boolean;
  warned_24h: boolean;
  closed_at: Timestamp | null;
  created_at: Timestamp;
}

export interface Message {
  id: UUID;
  chat_id: UUID;
  /** Null for system messages — closure notes, date cards, removal notices. */
  sender_id: UUID | null;
  kind: MessageKind;
  body: string | null;
  voice_path: string | null;
  voice_duration_ms: number | null;
  read_at: Timestamp | null;
  created_at: Timestamp;
}

/** A `confirmed` row here is the only thing that pauses a fuse (spec §6.3). */
export interface DateProposal {
  id: UUID;
  chat_id: UUID;
  proposed_by: UUID;
  status: DateStatus;
  scheduled_for: Timestamp;
  place_name: string;
  place_note: string | null;
  confirmed_at: Timestamp | null;
  created_at: Timestamp;
}

export interface DateCheckin {
  id: UUID;
  date_id: UUID;
  user_id: UUID;
  answer: CheckinAnswer;
  answered_at: Timestamp | null;
  created_at: Timestamp;
}

export interface ClosureNote {
  id: UUID;
  chat_id: UUID;
  /** Null when the fuse closed the chat rather than a person. */
  from_user: UUID | null;
  template_id: string;
  personal_line: string | null;
  tone_check_passed: boolean | null;
  delivered_at: Timestamp | null;
  created_at: Timestamp;
}

export interface Report {
  id: UUID;
  reporter_id: UUID;
  reported_id: UUID;
  chat_id: UUID | null;
  reason: string;
  detail: string | null;
  resolved_by: UUID | null;
  resolution: "dismissed" | "warned" | "removed" | null;
  resolved_at: Timestamp | null;
  created_at: Timestamp;
}

export interface WaitlistEntry {
  id: UUID;
  email: string;
  phone: string | null;
  city: string;
  season_interest: UUID | null;
  position: number | null;
  source: string | null;
  created_at: Timestamp;
}

export interface Notification {
  id: UUID;
  user_id: UUID;
  channel: NotifChannel;
  template: string;
  payload: Record<string, unknown>;
  /**
   * Stamped by `notification-sweep` only when a transport accepted it. A row
   * with both this and `skipped_at` null is still pending.
   */
  sent_at: Timestamp | null;
  /** Set when the sweep decided it will never be sent (0022). */
  skipped_at: Timestamp | null;
  /** stale · declined · no-transport · no-copy · unknown-template */
  skip_reason: string | null;
  read_at: Timestamp | null;
  created_at: Timestamp;
}

/**
 * One browser installation that can receive Web Push (0022).
 *
 * Per device, not per account: the endpoint is the identity and is unique, so
 * signing into a second account on a shared browser moves the subscription
 * rather than duplicating it.
 */
export interface PushSubscriptionRow {
  id: UUID;
  user_id: UUID;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: Timestamp;
  last_sent_at: Timestamp | null;
  /** Set when the push service reported it gone (404/410). */
  expired_at: Timestamp | null;
}

export interface NotificationPrefs {
  user_id: UUID;
  drop_push: boolean;
  drop_sms: boolean;
  fuse_warnings: boolean;
  email_updates: boolean;
  /**
   * TCPA (spec §9.8): SMS needs an explicit, separately-recorded opt-in, so the
   * toggle alone is not consent. Null means never opted in, whatever
   * `drop_sms` says — check both before sending.
   */
  sms_opt_in_at: Timestamp | null;
  created_at: Timestamp;
}

export interface AdminAuditEntry {
  id: UUID;
  admin_id: UUID;
  action: string;
  target_table: string | null;
  target_id: UUID | null;
  detail: Record<string, unknown>;
  created_at: Timestamp;
}

/**
 * The admin allow-list.
 *
 * Spec §7.3 describes an `ADMIN_EMAILS` env var, but every `is_admin()` check
 * is SQL evaluated inside Postgres and Postgres cannot read the app's
 * environment. The table is the allow-list; `pnpm admin:grant` writes to it.
 */
export interface AdminUser {
  id: UUID;
  email: string;
  /** Revoked admins are deactivated, never deleted — `admin_audit` points here. */
  active: boolean;
  created_at: Timestamp;
}

export interface Graduation {
  id: UUID;
  chat_id: UUID;
  proposed_by: UUID;
  confirmed_by: UUID | null;
  status: "proposed" | "confirmed" | "declined";
  responded_at: Timestamp | null;
  created_at: Timestamp;
}

export interface ExitSurvey {
  id: UUID;
  user_id: UUID;
  season_id: UUID;
  dates_count: number | null;
  would_recommend: boolean | null;
  quote: string | null;
  submitted_at: Timestamp | null;
  created_at: Timestamp;
}

/** Idempotency ledger for Stripe (and any other) webhooks. */
export interface ProcessedWebhookEvent {
  /** The provider's own event id — the primary key, so a replay is a no-op. */
  id: string;
  provider: string;
  processed_at: Timestamp;
}
