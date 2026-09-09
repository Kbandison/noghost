import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_TTL_HOURS,
  planNotification,
  type NotificationPrefs,
  type QueuedNotification,
  type Transports,
} from "./notifications";

const TZ = "America/New_York";
/** 2 PM in Atlanta — comfortably outside quiet hours. */
const NOON = "2026-09-15T18:00:00.000Z";
const ALL: Transports = { push: true, sms: true, email: true };
const NONE: Transports = { push: false, sms: false, email: false };

const prefs = (over: Partial<NotificationPrefs> = {}): NotificationPrefs => ({
  drop_push: true,
  drop_sms: false,
  fuse_warnings: true,
  email_updates: true,
  sms_opt_in_at: null,
  ...over,
});

const queued = (over: Partial<QueuedNotification> = {}): QueuedNotification => ({
  template: "connect_received",
  channel: "push",
  createdAt: NOON,
  ...over,
});

const plan = (
  row: Partial<QueuedNotification>,
  p: NotificationPrefs | null = prefs(),
  options: Partial<{ now: string; timeZone: string; transports: Transports }> = {},
) =>
  planNotification(queued(row), p, {
    now: NOON,
    timeZone: TZ,
    transports: ALL,
    ...options,
  });

describe("delivering what is still true", () => {
  it("delivers a fresh notification on an available transport", () => {
    expect(plan({})).toEqual({ action: "deliver" });
  });

  it("skips a fuse warning that waited out the night", () => {
    // The whole reason this planner exists. "48 hours left" is a claim about a
    // deadline; delivered seven hours later it is not late, it is wrong.
    const result = plan({
      template: "fuse_48h",
      createdAt: "2026-09-15T11:00:00.000Z",
    });
    expect(result).toEqual({ action: "skip", reason: "stale" });
  });

  it("still delivers a closure note that waited, because it is about the past", () => {
    expect(NOTIFICATION_TTL_HOURS.closure_received).toBeNull();
    const result = plan({
      template: "closure_received",
      createdAt: "2026-09-01T18:00:00.000Z",
    });
    expect(result).toEqual({ action: "deliver" });
  });

  it("checks staleness before quiet hours, so morning does not deliver a lie", () => {
    // 3 AM local. A naive implementation defers to 9 AM and sends it then.
    // Queued at 8 PM, considered at 3 AM local: seven hours against a six-hour
    // TTL. A naive implementation defers to 9 AM and sends it then.
    const result = plan(
      { template: "fuse_24h", createdAt: "2026-09-15T00:00:00.000Z" },
      prefs(),
      { now: "2026-09-15T07:00:00.000Z" },
    );
    expect(result).toEqual({ action: "skip", reason: "stale" });
  });

  it("refuses a template no rule knows about, rather than guessing", () => {
    expect(plan({ template: "invented_by_nobody" })).toEqual({
      action: "skip",
      reason: "unknown-template",
    });
  });
});

describe("quiet hours", () => {
  it("defers rather than skipping — §8 says these queue for morning", () => {
    const result = plan({ template: "connect_received" }, prefs(), {
      now: "2026-09-15T04:00:00.000Z", // midnight ET
    });
    expect(result).toEqual({ action: "defer", until: "waking-hours" });
  });

  it("does not apply to in-app, which wakes nobody", () => {
    const result = plan({ template: "closure_received", channel: "inapp" }, prefs(), {
      now: "2026-09-15T04:00:00.000Z",
    });
    expect(result).toEqual({ action: "deliver" });
  });
});

describe("what the member asked for", () => {
  it("honours the fuse-warning switch they were shown", () => {
    expect(plan({ template: "fuse_48h" }, prefs({ fuse_warnings: false }))).toEqual({
      action: "skip",
      reason: "declined",
    });
  });

  it("but the closure that follows is not optional — nobody gets ghosted", () => {
    expect(
      plan({ template: "chat_closed_fuse" }, prefs({ fuse_warnings: false, email_updates: false })),
    ).toEqual({ action: "deliver" });
  });

  it("reads the drop preference for the channel in hand, not the template", () => {
    const off = prefs({ drop_push: false, drop_sms: true, sms_opt_in_at: NOON });
    expect(plan({ template: "drop_live", channel: "push" }, off).action).toBe("skip");
    expect(plan({ template: "drop_live", channel: "sms" }, off)).toEqual({ action: "deliver" });
  });

  it("treats a missing prefs row as the column defaults", () => {
    expect(plan({ template: "connect_received" }, null)).toEqual({ action: "deliver" });
  });

  it("never texts without a recorded opt-in, however required the template", () => {
    // TCPA §9.8: the timestamp is the consent, not the toggle beside it.
    expect(plan({ template: "admitted_claim", channel: "sms" }, prefs({ drop_sms: true }))).toEqual(
      { action: "skip", reason: "declined" },
    );
    expect(
      plan({ template: "admitted_claim", channel: "sms" }, prefs({ sms_opt_in_at: NOON })),
    ).toEqual({ action: "deliver" });
  });

  it("lets email updates be switched off, except for the season they bought", () => {
    const quiet = prefs({ email_updates: false });
    expect(plan({ template: "season_finale", channel: "email" }, quiet).action).toBe("skip");
    expect(plan({ template: "admitted_claim", channel: "email" }, quiet)).toEqual({
      action: "deliver",
    });
  });
});

describe("a channel with nowhere to go", () => {
  it("defers, because a transport may exist tomorrow", () => {
    expect(plan({ template: "closure_received" }, prefs(), { transports: NONE })).toEqual({
      action: "defer",
      until: "a-transport",
    });
  });

  it("and staleness is what stops that being forever", () => {
    const result = plan(
      { template: "connect_received", createdAt: "2026-09-01T18:00:00.000Z" },
      prefs(),
      { transports: NONE },
    );
    // Named for the cause: this never went because nothing could send it, which
    // is a missing provider rather than a notification that aged out.
    expect(result).toEqual({ action: "skip", reason: "no-transport" });
  });

  it("in-app always has one — the row is the delivery", () => {
    expect(
      plan({ template: "closure_received", channel: "inapp" }, prefs(), { transports: NONE }),
    ).toEqual({ action: "deliver" });
  });
});
