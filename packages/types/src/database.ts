import type {
  AdminAuditEntry,
  AdminUser,
  Application,
  Chat,
  ClosureNote,
  Connect,
  DateCheckin,
  DateProposal,
  Drop,
  DropCard,
  ExitSurvey,
  Graduation,
  Message,
  Notification,
  NotificationPrefs,
  PhotoScreening,
  ProcessedWebhookEvent,
  Profile,
  PushSubscriptionRow,
  Report,
  Season,
  SeasonMember,
  Verification,
  VerificationChallenge,
  VisibleProfile,
  WaitlistEntry,
} from "./domain";
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

/**
 * The `Database` type supabase-js is generic over.
 *
 * Composed from the domain interfaces rather than duplicating them, so a schema
 * change lands in one place. This is a hand-written stand-in for
 * `supabase gen types typescript`, which needs a live project — once the
 * dedicated project exists, regenerate and replace this file. The domain
 * interfaces stay either way; they are what application code should reference.
 */

/**
 * postgrest-js constrains every Row to `Record<string, unknown>`, and a TS
 * `interface` does not satisfy that — interfaces get no implicit index
 * signature. Mapping over one produces an anonymous object type, which does.
 * Without this the whole schema silently fails the constraint and every query
 * resolves to `never`.
 */
type Flatten<T> = { [K in keyof T]: T[K] };

type Table<Row> = {
  Row: Flatten<Row>;
  Insert: Partial<Flatten<Row>>;
  Update: Partial<Flatten<Row>>;
  Relationships: [];
};

type View<Row> = {
  Row: Flatten<Row>;
  Relationships: [];
};

/** Mirrors the `public_season_stats` view. Anon-readable; no PII. */
export interface PublicSeasonStatsRow {
  id: string;
  name: string;
  city: string;
  phase: SeasonPhase;
  starts_at: string;
  ends_at: string;
  applications_open_at: string | null;
  member_cap: number;
  claim_hours: number;
  seats_remaining: number;
  price_early_cents: number;
  price_standard_cents: number;
  early_bird_cap: number;
  timezone: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: Table<Profile>;
      verifications: Table<Verification>;
      verification_challenges: Table<VerificationChallenge>;
      photo_screenings: Table<PhotoScreening>;
      seasons: Table<Season>;
      applications: Table<Application>;
      season_members: Table<SeasonMember>;
      drops: Table<Drop>;
      drop_cards: Table<DropCard>;
      connects: Table<Connect>;
      chats: Table<Chat>;
      messages: Table<Message>;
      dates: Table<DateProposal>;
      date_checkins: Table<DateCheckin>;
      closure_notes: Table<ClosureNote>;
      reports: Table<Report>;
      waitlist: Table<WaitlistEntry>;
      notifications: Table<Notification>;
      notification_prefs: Table<NotificationPrefs>;
      push_subscriptions: Table<PushSubscriptionRow>;
      graduations: Table<Graduation>;
      exit_surveys: Table<ExitSurvey>;
      admin_audit: Table<AdminAuditEntry>;
      admin_users: Table<AdminUser>;
      processed_webhook_events: Table<ProcessedWebhookEvent>;
    };
    Views: {
      public_season_stats: View<PublicSeasonStatsRow>;
      visible_profiles: View<VisibleProfile>;
    };
    Functions: {
      pass_card: { Args: { p_card_id: string }; Returns: undefined };
      /**
       * 0033. The caller's own application status, and which door it came
       * through. Members may know the outcome of their own application; they
       * may never know a score or that they fell short of one.
       */
      my_application_route: {
        Args: Record<string, never>;
        Returns: { status: ApplicationStatus; admitted_automatically: boolean }[];
      };
      /**
       * 0029. Everything the review team needs about one verification —
       * including the columns revoked from the applicant. Admin-gated inside
       * the function, which is why the console can call it with the reviewer's
       * own session instead of reaching for a service client.
       */
      review_verification: {
        Args: { p_user_id: string };
        Returns: {
          selfie_path: string | null;
          frame_paths: string[] | null;
          challenge_passed: boolean | null;
          /** 0032. Face Liveness confidence — was a live human there? */
          liveness_confidence: number | null;
          liveness_checked_at: string | null;
          /** The face MATCH against their photos. A different question. */
          liveness_score: number | null;
          liveness_passed: boolean | null;
          auto_reason: string | null;
          auto_checked_at: string | null;
          phone_verified_at: string | null;
          /**
           * 0037. Worst-frame sharpness of the winning capture, 0–100. Below
           * about 90 means the camera was still focusing while it filmed —
           * which is what a low liveness score usually turns out to be.
           */
          capture_sharpness: number | null;
          /**
           * 0037. Completed liveness attempts for this application, and the
           * lowest of them. The row reports the applicant's BEST attempt, and
           * best-of-N shown without the N flatters rather than informs.
           */
          liveness_attempts: number | null;
          liveness_lowest: number | null;
        }[];
      };
      send_connect: {
        Args: {
          p_card_id: string;
          p_prompt_ref: unknown;
          p_reply_text?: string | null;
          p_reply_voice_path?: string | null;
        };
        Returns: string;
      };
      respond_connect: {
        Args: { p_connect_id: string; p_accept: boolean };
        Returns: string | null;
      };
      propose_date: {
        Args: {
          p_chat_id: string;
          p_scheduled_for: string;
          p_place_name: string;
          p_place_note?: string | null;
        };
        Returns: string;
      };
      respond_to_date: { Args: { p_date_id: string; p_confirm: boolean }; Returns: undefined };
      cancel_date: { Args: { p_date_id: string }; Returns: undefined };
      answer_checkin: {
        Args: { p_date_id: string; p_answer: CheckinAnswer };
        Returns: string;
      };
      close_chat: {
        Args: {
          p_chat_id: string;
          p_template_id: string;
          p_personal_line?: string | null;
          p_tone_check_passed?: boolean | null;
        };
        Returns: undefined;
      };
      propose_graduation: { Args: { p_chat_id: string }; Returns: string };
      respond_graduation: {
        Args: { p_graduation_id: string; p_confirm: boolean };
        Returns: undefined;
      };
      set_account_paused: { Args: { p_paused: boolean }; Returns: undefined };
      report_member: {
        Args: {
          p_reported_id: string;
          p_reason: string;
          p_chat_id?: string | null;
          p_detail?: string | null;
        };
        Returns: string;
      };
      /**
       * Server-side only — EXECUTE is revoked from `authenticated`, because a
       * client that can call this can burn somebody else's allowance.
       */
      hit_rate_limit: {
        Args: { p_bucket: string; p_key: string; p_limit: number; p_window_seconds: number };
        Returns: boolean;
      };
      prune_rate_limits: { Args: Record<string, never>; Returns: number };
      /** Erases the caller in place; the chats they were in survive with an ending. */
      delete_own_account: { Args: Record<string, never>; Returns: undefined };
      /**
       * Admin-only (§7.3 photo re-review). The flag `visible_profiles` filters
       * on, so this is what puts a photo in front of another member.
       */
      set_photo_approval: {
        Args: { p_user_id: string; p_path: string; p_approved: boolean };
        Returns: undefined;
      };
      /**
       * Registers the caller's browser for Web Push (0024). Takes the endpoint
       * over from a previous owner — a subscription left pointing at a browser
       * somebody else now uses would deliver one member's notifications to
       * another, and RLS alone cannot reassign a row you do not own.
       */
      register_push_subscription: {
        Args: {
          p_endpoint: string;
          p_p256dh: string;
          p_auth: string;
          p_user_agent: string | null;
        };
        Returns: string;
      };
      /**
       * Admin-only (§7.3's Season console). Null means leave a field alone;
       * audits only what actually changed, old and new.
       */
      update_season: {
        Args: {
          p_season_id: string;
          p_name?: string | null;
          p_city?: string | null;
          p_applications_open_at?: string | null;
          p_starts_at?: string | null;
          p_ends_at?: string | null;
          p_member_cap?: number | null;
          p_drop_time?: string | null;
          p_drop_max?: number | null;
          p_fuse_days?: number | null;
          p_claim_hours?: number | null;
          p_price_early_cents?: number | null;
          p_price_standard_cents?: number | null;
          p_early_bird_cap?: number | null;
          p_encore_start_week?: number | null;
          p_timezone?: string | null;
          p_seats_display_cap?: number | null;
          p_clear_seats_cap?: boolean;
        };
        Returns: undefined;
      };
      /** Admin-only, audited with a reason. Separate on purpose — see 0027. */
      set_season_phase: {
        Args: { p_season_id: string; p_phase: SeasonPhase; p_reason?: string | null };
        Returns: undefined;
      };
      /**
       * Admin-only (§7.3's Comms). One `broadcast` notification per season
       * member, in-app and optionally by email; returns the number of rows
       * written. The body is audited in full — for this one, the words are the
       * mutation.
       */
      broadcast_to_season: {
        Args: { p_season_id: string; p_body: string; p_email: boolean };
        Returns: number;
      };
      /**
       * Admin-only, and can only ever target the caller. `enqueue_notification`
       * stays ungranted to `authenticated` precisely so no console button can
       * send an arbitrary template to an arbitrary member.
       */
      send_test_notification: {
        Args: { p_template: string; p_channel: NotifChannel; p_payload: Record<string, unknown> };
        Returns: string;
      };
      /** Admin-only (§7.3). `p_note` is the reviewer's reasoning, not the reporter's. */
      resolve_report: {
        Args: {
          p_report_id: string;
          p_resolution: "dismissed" | "warned" | "removed";
          p_note?: string | null;
        };
        Returns: undefined;
      };
      advance_application: {
        Args: {
          p_application_id: string;
          p_new_status: ApplicationStatus;
          p_reason?: string | null;
        };
        Returns: undefined;
      };
      /*
       * Service-role and admin only — EXECUTE is revoked from anon and
       * authenticated. Typed here because the cron routes in §4.3 call them
       * directly; a member never can.
       */
      enqueue_notification: {
        Args: {
          p_user: string;
          p_channel: NotifChannel;
          p_template: string;
          p_payload?: Record<string, unknown>;
        };
        Returns: undefined;
      };
      audit: {
        Args: {
          p_action: string;
          p_table: string;
          p_target: string;
          p_detail?: Record<string, unknown>;
        };
        Returns: undefined;
      };
    };
    Enums: {
      application_status: ApplicationStatus;
      season_phase: SeasonPhase;
      member_status: MemberStatus;
      card_action: CardAction;
      connect_status: ConnectStatus;
      chat_state: ChatState;
      message_kind: MessageKind;
      date_status: DateStatus;
      checkin_answer: CheckinAnswer;
      notif_channel: NotifChannel;
    };
    CompositeTypes: Record<never, never>;
  };
}
