/**
 * Notification copy — spec §9.4 (push/SMS) and the §8 delivery matrix.
 *
 * Spec §3.3 bans engagement bait outright: no streaks, no "X likes waiting",
 * no manufactured urgency. Every message below either reports a real event or
 * states a real deadline.
 */

export const NOTIFICATION_COPY = {
  drop_live: {
    push: "Tonight's drop is live. 👻",
    sms: "{{APP_NAME}}: tonight's drop is live. {{APP_URL}}",
  },
  connect_received: {
    push: "Someone replied to your prompt about {{PROMPT_TOPIC}}.",
  },
  connect_accepted: {
    push: "{{FIRST_NAME}} said yes. Your seven days start now.",
  },
  fuse_48h: {
    push: "48 hours left with {{FIRST_NAME}}. Put a date on the calendar or part ways kindly — those are the options.",
  },
  fuse_24h: {
    push: "Last day with {{FIRST_NAME}}. One tap to propose a time and place.",
  },
  chat_closed_fuse: {
    push: "Your chat with {{FIRST_NAME}} closed at the seven-day mark. No silence — there's a note waiting.",
  },
  closure_received: {
    push: "{{FIRST_NAME}} left you a closing note. It's kind — they all are here.",
  },
  date_proposed: {
    push: "{{FIRST_NAME}} proposed {{DAY}} at {{PLACE}}. Confirm or counter.",
  },
  date_confirmed: {
    push: "It's on: {{DAY}}, {{PLACE}}. The clock's paused — go be people.",
  },
  checkin_open: {
    push: "How was {{PLACE}} with {{FIRST_NAME}}? Continue or close — your answer stays private.",
  },
  connect_nudge: {
    push: "Someone wrote you a note two days ago. They deserve an answer either way — that's the whole idea.",
  },
} as const;

export type NotificationTemplateKey = keyof typeof NOTIFICATION_COPY;

/**
 * Delivery matrix — spec §8. `channels` is the default; member preferences
 * (`notification_prefs`) narrow it, except where `required` is true.
 *
 * The drop alert and fuse warnings are product-critical: the UI must keep at
 * least one channel active for them (spec §5, notification_prefs note).
 */
export const NOTIFICATION_MATRIX = {
  application_received: { channels: ["email"], required: false },
  admitted_claim: { channels: ["email", "sms"], required: true },
  claim_reminder: { channels: ["sms"], required: true },
  season_start: { channels: ["push", "email"], required: false },
  drop_live: { channels: ["push"], optIn: ["sms"], required: true },
  connect_received: { channels: ["push"], required: false },
  connect_accepted: { channels: ["push"], required: false },
  connect_declined: { channels: ["inapp"], required: true },
  fuse_48h: { channels: ["push"], optIn: ["sms"], required: true },
  fuse_24h: { channels: ["push"], optIn: ["sms"], required: true },
  chat_closed_fuse: { channels: ["push", "inapp"], required: true },
  closure_received: { channels: ["push", "inapp"], required: true },
  date_proposed: { channels: ["push"], required: false },
  date_confirmed: { channels: ["push"], required: false },
  checkin_open: { channels: ["push"], required: false },
  connect_nudge: { channels: ["push"], required: false },
  season_finale: { channels: ["push", "email"], required: false },
} as const satisfies Record<
  string,
  { channels: readonly string[]; optIn?: readonly string[]; required: boolean }
>;

export type NotificationKey = keyof typeof NOTIFICATION_MATRIX;
