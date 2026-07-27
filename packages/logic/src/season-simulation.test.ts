import { describe, expect, it } from "vitest";
import { isChatClosed } from "@noghost/types";
import { fuseTransition, type FuseChat, type FuseConfig, type FuseEvent } from "./fuse";
import { hashSeed, seededRandom } from "./random";
import { addDays, addHours, toIso, toMs } from "./time";

/**
 * Full-season simulation — spec §10 Phase 7: "time-travel test: 56 days in
 * fast-forward, assert zero silent endings possible".
 *
 * Written now rather than in Phase 7 because it is the test that proves the
 * central product claim. Every chat is driven through 56 days of hourly
 * sweeps with pseudo-random member behaviour, and the assertion is simple:
 * no chat may reach a closed state without words having been delivered to
 * someone.
 */

const SEASON_START = "2026-09-14T00:00:00.000Z";
const SEASON_END = addDays(SEASON_START, 56);
const CONFIG: FuseConfig = { fuseDays: 7, seasonEndsAt: SEASON_END };

const CHAT_COUNT = 60;

interface Tracked {
  chat: FuseChat;
  /** When the connect was accepted. The chat does not exist before this. */
  openedAt: string;
  /** Recipients of every closure note this chat produced. */
  noteRecipients: Set<string>;
  closeReason: string | null;
  /** The confirmed date's time, when one is on the calendar. */
  scheduledFor: string | null;
}

function simulate(seed: string) {
  const random = seededRandom(hashSeed(seed));
  const pick = <T>(items: readonly T[]): T =>
    items[Math.floor(random() * items.length)] as T;

  const chats: Tracked[] = Array.from({ length: CHAT_COUNT }, (_, i) => {
    // Chats open on staggered days across the whole season, including the
    // final week — those are the ones whose fuse outlives `ends_at`, which is
    // what exercises the season-end closure path.
    const openedAt = addDays(SEASON_START, Math.floor(random() * 56));
    return {
      chat: {
        id: `chat-${i}`,
        state: "active",
        userA: `a${i}`,
        userB: `b${i}`,
        fuseExpiresAt: addDays(openedAt, CONFIG.fuseDays),
        fusePausedAt: null,
        warned48h: false,
        warned24h: false,
        closedAt: null,
      },
      openedAt,
      noteRecipients: new Set<string>(),
      closeReason: null,
      scheduledFor: null,
    };
  });

  const apply = (tracked: Tracked, event: FuseEvent) => {
    const before = tracked.chat.state;
    const result = fuseTransition(tracked.chat, event, CONFIG);
    tracked.chat = result.chat;

    for (const effect of result.effects) {
      if (effect.kind === "closure_note") {
        for (const user of effect.toUsers) tracked.noteRecipients.add(user);
      }
    }
    if (!isChatClosed(before) && isChatClosed(result.chat.state)) {
      tracked.closeReason = `${event.type} -> ${result.chat.state}`;
    }
    return result;
  };

  // Hourly sweep across the whole season, plus a grace day so anything still
  // open runs into `ends_at`.
  const endOfRun = addDays(SEASON_END, 1);
  for (let at = toMs(SEASON_START); at <= toMs(endOfRun); at += 60 * 60 * 1000) {
    const now = toIso(at);

    for (const tracked of chats) {
      if (isChatClosed(tracked.chat.state)) continue;
      // The chat doesn't exist until its connect was accepted.
      if (toMs(now) < toMs(tracked.openedAt)) continue;

      // Members act occasionally, not every hour.
      if (random() < 0.02) {
        const state = tracked.chat.state;

        if (state === "active") {
          const action = pick(["date", "close", "graduate", "remove", "nothing"] as const);
          if (action === "date") {
            const scheduledFor = addHours(now, 3 + Math.floor(random() * 300));
            tracked.scheduledFor = scheduledFor;
            apply(tracked, { type: "date_confirmed", at: now, scheduledFor });
          } else if (action === "close") {
            apply(tracked, {
              type: "user_close",
              at: now,
              by: pick([tracked.chat.userA, tracked.chat.userB]),
              templateId: pick(["closure_01", "closure_02", "closure_05"]),
            });
          } else if (action === "graduate") {
            apply(tracked, { type: "graduated", at: now, byUser: tracked.chat.userA });
          } else if (action === "remove") {
            apply(tracked, {
              type: "member_removed",
              at: now,
              removedUserId: tracked.chat.userB,
            });
          }
        } else if (state === "date_scheduled" && random() < 0.3) {
          tracked.scheduledFor = null;
          apply(tracked, { type: "date_cancelled", at: now });
        } else if (state === "post_date_checkin") {
          const outcome = pick(["continue", "close"] as const);
          apply(tracked, {
            type: "checkin_resolved",
            at: now,
            outcome,
            closedBy: tracked.chat.userA,
            templateId: "closure_02",
          });
        }
      }

      // The date's time passes: the check-in opens 24h later.
      if (
        tracked.chat.state === "date_scheduled" &&
        tracked.scheduledFor &&
        toMs(now) >= toMs(addHours(tracked.scheduledFor, 24))
      ) {
        tracked.scheduledFor = null;
        apply(tracked, { type: "date_elapsed", at: now });
      }

      // The hourly fuse sweep runs regardless.
      if (!isChatClosed(tracked.chat.state)) {
        apply(tracked, { type: "tick", at: now });
      }
    }
  }

  return chats;
}

describe("56-day season simulation", () => {
  const seeds = ["season-one", "atlanta", "cohort-b", "encore"];

  it.each(seeds)("closes every chat with words (seed: %s)", (seed) => {
    const chats = simulate(seed);

    for (const tracked of chats) {
      expect(
        isChatClosed(tracked.chat.state),
        `${tracked.chat.id} was still open past the season end`,
      ).toBe(true);

      expect(
        tracked.noteRecipients.size,
        `${tracked.chat.id} closed via "${tracked.closeReason}" with nobody receiving a note`,
      ).toBeGreaterThan(0);
    }
  });

  it("exercises every closing path across the seeds, not just one", () => {
    const reasons = new Set<string>();
    for (const seed of seeds) {
      for (const tracked of simulate(seed)) reasons.add(tracked.chat.state);
    }
    expect(reasons).toEqual(
      new Set(["closed_fuse", "closed_by_user", "closed_graduated", "closed_season_end"]),
    );
  });

  it("never leaves a chat closed without a closedAt timestamp", () => {
    for (const tracked of simulate("season-one")) {
      expect(tracked.chat.closedAt).not.toBeNull();
    }
  });

  it("is deterministic — the same seed replays identically", () => {
    const a = simulate("atlanta").map((t) => `${t.chat.id}:${t.chat.state}`);
    const b = simulate("atlanta").map((t) => `${t.chat.id}:${t.chat.state}`);
    expect(a).toEqual(b);
  });
});
