import { describe, expect, it } from "vitest";
import { CHAT_STATES, isChatClosed, type ChatState } from "@noghost/types";
import {
  fuseTransition,
  fuseUrgency,
  openingFuseExpiry,
  remainingFuseHours,
  type FuseChat,
  type FuseConfig,
  type FuseEvent,
} from "./fuse";
import { addDays, addHours } from "./time";

const START = "2026-09-14T20:00:00.000Z";
const CONFIG: FuseConfig = {
  fuseDays: 7,
  seasonEndsAt: "2026-11-09T05:00:00.000Z",
};

function chat(overrides: Partial<FuseChat> = {}): FuseChat {
  return {
    id: "chat-1",
    state: "active",
    userA: "alice",
    userB: "bob",
    fuseExpiresAt: addDays(START, 7),
    fusePausedAt: null,
    warned48h: false,
    warned24h: false,
    closedAt: null,
    ...overrides,
  };
}

/** Every closure note produced by a transition. */
function notes(result: ReturnType<typeof fuseTransition>) {
  return result.effects.filter((e) => e.kind === "closure_note");
}

function notifications(result: ReturnType<typeof fuseTransition>) {
  return result.effects.filter((e) => e.kind === "notify");
}

describe("the no-silent-ending invariant", () => {
  /**
   * The product's single load-bearing guarantee: there is no path from an open
   * chat to a closed one that does not deliver words. If this test ever fails,
   * NoGhost is just another dating app.
   */
  const everyEvent: FuseEvent[] = [
    { type: "tick", at: addDays(START, 8) },
    { type: "user_close", at: START, by: "alice", templateId: "closure_01" },
    { type: "graduated", at: START, byUser: "alice" },
    { type: "member_removed", at: START, removedUserId: "bob" },
    { type: "season_ended", at: START },
    { type: "checkin_resolved", at: START, outcome: "close", closedBy: "alice" },
    { type: "checkin_resolved", at: START, outcome: "no_response" },
  ];

  it("delivers a closure note on every transition into a closed state", () => {
    for (const event of everyEvent) {
      // post_date_checkin so the check-in events are live; others ignore state.
      const start = chat({
        state: event.type === "checkin_resolved" ? "post_date_checkin" : "active",
        checkinOpenedAt: START,
      });
      const result = fuseTransition(start, event, CONFIG);

      if (!isChatClosed(result.chat.state)) continue;

      expect(
        notes(result).length,
        `${event.type} closed the chat with no note`,
      ).toBeGreaterThan(0);
      expect(notes(result)[0]?.toUsers.length).toBeGreaterThan(0);
      expect(result.chat.closedAt).not.toBeNull();
    }
  });

  it("has no closed state reachable without one", () => {
    // Sanity check that the enum hasn't grown a state the machine can't close kindly.
    const closable: ChatState[] = CHAT_STATES.filter(isChatClosed);
    expect(closable).toEqual([
      "closed_fuse",
      "closed_by_user",
      "closed_graduated",
      "closed_season_end",
    ]);
  });
});

describe("idempotency", () => {
  it("absorbs every event once closed, so the sweep can re-run", () => {
    const closed = chat({ state: "closed_fuse", closedAt: START });
    for (const event of [
      { type: "tick", at: addDays(START, 30) },
      { type: "user_close", at: START, by: "alice", templateId: "closure_01" },
      { type: "date_confirmed", at: START, scheduledFor: addDays(START, 1) },
    ] satisfies FuseEvent[]) {
      const result = fuseTransition(closed, event, CONFIG);
      expect(result.changed).toBe(false);
      expect(result.effects).toEqual([]);
      expect(result.chat).toBe(closed);
    }
  });

  it("does not re-send a warning that already fired", () => {
    const warned = chat({ warned48h: true, fuseExpiresAt: addHours(START, 40) });
    const result = fuseTransition(warned, { type: "tick", at: START }, CONFIG);
    expect(notifications(result)).toEqual([]);
    expect(result.changed).toBe(false);
  });

  it("re-running the sweep at the same moment produces one warning, not two", () => {
    const first = fuseTransition(
      chat({ fuseExpiresAt: addHours(START, 47) }),
      { type: "tick", at: START },
      CONFIG,
    );
    expect(notifications(first)).toHaveLength(1);

    const second = fuseTransition(first.chat, { type: "tick", at: START }, CONFIG);
    expect(notifications(second)).toEqual([]);
  });
});

describe("warnings", () => {
  it("fires the 48h warning once inside the window", () => {
    const result = fuseTransition(
      chat({ fuseExpiresAt: addHours(START, 47) }),
      { type: "tick", at: START },
      CONFIG,
    );
    expect(notifications(result)[0]?.template).toBe("fuse_48h");
    expect(result.chat.warned48h).toBe(true);
    expect(result.chat.warned24h).toBe(false);
  });

  it("fires the 24h warning and marks 48h too, when a sweep is missed", () => {
    // The 48h sweep never ran; only the more urgent warning is worth sending.
    const result = fuseTransition(
      chat({ fuseExpiresAt: addHours(START, 20) }),
      { type: "tick", at: START },
      CONFIG,
    );
    expect(notifications(result)[0]?.template).toBe("fuse_24h");
    expect(result.chat.warned48h).toBe(true);
    expect(result.chat.warned24h).toBe(true);
  });

  it("stays quiet with more than 48 hours on the clock", () => {
    const result = fuseTransition(
      chat({ fuseExpiresAt: addHours(START, 72) }),
      { type: "tick", at: START },
      CONFIG,
    );
    expect(result.changed).toBe(false);
  });

  it("does not warn while a date is on the calendar", () => {
    const scheduled = chat({
      state: "date_scheduled",
      fusePausedAt: START,
      fuseExpiresAt: addHours(START, 10),
    });
    const result = fuseTransition(scheduled, { type: "tick", at: addHours(START, 5) }, CONFIG);
    expect(result.changed).toBe(false);
  });
});

describe("fuse expiry", () => {
  it("auto-closes with the system note when the clock runs out", () => {
    const result = fuseTransition(
      chat({ fuseExpiresAt: addDays(START, 7) }),
      { type: "tick", at: addDays(START, 7) },
      CONFIG,
    );
    expect(result.chat.state).toBe("closed_fuse");
    expect(notes(result)[0]).toMatchObject({
      templateId: "fuse_auto",
      fromUser: null,
      toUsers: ["alice", "bob"],
    });
    expect(notifications(result)[0]?.template).toBe("chat_closed_fuse");
  });
});

describe("dates pause and resume the fuse", () => {
  it("pauses on a confirmed date", () => {
    const result = fuseTransition(
      chat(),
      { type: "date_confirmed", at: START, scheduledFor: addDays(START, 3) },
      CONFIG,
    );
    expect(result.chat.state).toBe("date_scheduled");
    expect(result.chat.fusePausedAt).toBe(START);
    expect(notifications(result)[0]?.template).toBe("date_confirmed");
  });

  it("resumes with the banked time when a date is cancelled", () => {
    const paused = chat({
      state: "date_scheduled",
      fusePausedAt: addDays(START, 1), // 6 days were banked
      fuseExpiresAt: addDays(START, 7),
    });
    const cancelledAt = addDays(START, 4);
    const result = fuseTransition(paused, { type: "date_cancelled", at: cancelledAt }, CONFIG);

    expect(result.chat.state).toBe("active");
    expect(result.chat.fusePausedAt).toBeNull();
    expect(result.chat.fuseExpiresAt).toBe(addDays(cancelledAt, 6));
  });

  it("floors the resumed fuse at 48 hours — a cancellation never insta-kills", () => {
    const paused = chat({
      state: "date_scheduled",
      fusePausedAt: addHours(START, 167), // only 1 hour banked
      fuseExpiresAt: addDays(START, 7),
    });
    const cancelledAt = addDays(START, 10);
    const result = fuseTransition(paused, { type: "date_cancelled", at: cancelledAt }, CONFIG);

    expect(result.chat.fuseExpiresAt).toBe(addHours(cancelledAt, 48));
    // The floor reopens the 48h window, so the coach gets to speak again.
    expect(result.chat.warned48h).toBe(false);
  });

  it("opens the check-in 24 hours after the date", () => {
    const scheduled = chat({ state: "date_scheduled", fusePausedAt: START });
    const at = addHours(START, 24);
    const result = fuseTransition(scheduled, { type: "date_elapsed", at }, CONFIG);
    expect(result.chat.state).toBe("post_date_checkin");
    expect(result.chat.checkinOpenedAt).toBe(at);
    expect(notifications(result)[0]?.template).toBe("checkin_open");
  });

  it("ignores a cancellation for a chat with no date scheduled", () => {
    const result = fuseTransition(chat(), { type: "date_cancelled", at: START }, CONFIG);
    expect(result.changed).toBe(false);
  });
});

describe("post-date check-in", () => {
  const inCheckin = () =>
    chat({ state: "post_date_checkin", fusePausedAt: START, checkinOpenedAt: START });

  it("grants a fresh seven days when both say continue", () => {
    const at = addHours(START, 2);
    const result = fuseTransition(
      inCheckin(),
      { type: "checkin_resolved", at, outcome: "continue" },
      CONFIG,
    );
    expect(result.chat.state).toBe("active");
    expect(result.chat.fuseExpiresAt).toBe(addDays(at, 7));
    expect(result.chat.fusePausedAt).toBeNull();
    expect(result.chat.warned48h).toBe(false);
    expect(result.chat.warned24h).toBe(false);
  });

  it("closes with the closer's note, never revealing who chose to close", () => {
    const result = fuseTransition(
      inCheckin(),
      {
        type: "checkin_resolved",
        at: START,
        outcome: "close",
        closedBy: "alice",
        templateId: "closure_02",
      },
      CONFIG,
    );
    expect(result.chat.state).toBe("closed_by_user");
    expect(notes(result)[0]?.templateId).toBe("closure_02");
    // Bob is told a note arrived — not that Alice answered "close".
    expect(notifications(result)[0]).toMatchObject({
      template: "closure_received",
      toUsers: ["bob"],
    });
  });

  it("auto-closes an unanswered check-in after 72 hours", () => {
    const result = fuseTransition(
      inCheckin(),
      { type: "tick", at: addHours(START, 72) },
      CONFIG,
    );
    expect(result.chat.state).toBe("closed_fuse");
    expect(notes(result)[0]?.templateId).toBe("fuse_auto");
  });

  it("waits while the check-in window is still open", () => {
    const result = fuseTransition(
      inCheckin(),
      { type: "tick", at: addHours(START, 71) },
      CONFIG,
    );
    expect(result.changed).toBe(false);
  });
});

describe("user-initiated close", () => {
  it("delivers the chosen template and any personal line", () => {
    const result = fuseTransition(
      chat(),
      {
        type: "user_close",
        at: START,
        by: "alice",
        templateId: "closure_05",
        personalLine: "I'd rather say it now.",
      },
      CONFIG,
    );
    expect(result.chat.state).toBe("closed_by_user");
    expect(notes(result)[0]).toMatchObject({
      templateId: "closure_05",
      fromUser: "alice",
      personalLine: "I'd rather say it now.",
    });
    expect(notifications(result)[0]?.toUsers).toEqual(["bob"]);
  });
});

describe("removal and season end", () => {
  it("sends the partner a neutral note — even removal doesn't ghost", () => {
    const result = fuseTransition(
      chat(),
      { type: "member_removed", at: START, removedUserId: "bob" },
      CONFIG,
    );
    expect(notes(result)[0]).toMatchObject({
      templateId: "removal",
      fromUser: null,
      toUsers: ["alice"], // the removed member gets nothing
    });
  });

  it("closes every open chat at season end, whatever else was pending", () => {
    const afterEnd = addHours(CONFIG.seasonEndsAt, 1);
    for (const state of ["active", "date_scheduled", "post_date_checkin"] as const) {
      const result = fuseTransition(
        chat({ state, checkinOpenedAt: START }),
        { type: "tick", at: afterEnd },
        CONFIG,
      );
      expect(result.chat.state).toBe("closed_season_end");
      expect(notes(result)[0]?.templateId).toBe("season_end");
    }
  });

  it("beats a fuse expiry that lands after the season ends", () => {
    const result = fuseTransition(
      chat({ fuseExpiresAt: CONFIG.seasonEndsAt }),
      { type: "tick", at: addHours(CONFIG.seasonEndsAt, 2) },
      CONFIG,
    );
    expect(result.chat.state).toBe("closed_season_end");
  });
});

describe("graduation", () => {
  it("closes the chat as graduated with the met-someone template", () => {
    const result = fuseTransition(
      chat(),
      { type: "graduated", at: START, byUser: "alice" },
      CONFIG,
    );
    expect(result.chat.state).toBe("closed_graduated");
    expect(notes(result)[0]?.templateId).toBe("closure_03");
  });
});

describe("helpers", () => {
  it("starts the fuse at accept time", () => {
    expect(openingFuseExpiry(START, 7)).toBe(addDays(START, 7));
  });

  it("reports banked time from the pause point", () => {
    const paused = chat({ fusePausedAt: addDays(START, 2), fuseExpiresAt: addDays(START, 7) });
    expect(remainingFuseHours(paused, addDays(START, 30))).toBe(120);
  });

  it("maps urgency to the ring colours", () => {
    expect(fuseUrgency(chat({ fuseExpiresAt: addHours(START, 96) }), START)).toBe("calm");
    expect(fuseUrgency(chat({ fuseExpiresAt: addHours(START, 40) }), START)).toBe("amber");
    expect(fuseUrgency(chat({ fuseExpiresAt: addHours(START, 3) }), START)).toBe("urgent");
    expect(fuseUrgency(chat({ state: "date_scheduled" }), START)).toBe("paused");
    expect(fuseUrgency(chat({ state: "closed_fuse" }), START)).toBe("closed");
  });
});
