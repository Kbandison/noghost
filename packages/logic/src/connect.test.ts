import { describe, expect, it } from "vitest";
import {
  answerWindow,
  expireConnect,
  needsNudge,
  respondToConnect,
  validateConnect,
  type ConnectCardContext,
  type ConnectDraft,
} from "./connect";
import { addDays, addHours } from "./time";

const NOW = "2026-09-20T20:30:00.000Z";

function draft(overrides: Partial<ConnectDraft> = {}): ConnectDraft {
  return {
    fromUser: "alice",
    toUser: "bob",
    dropCardId: "card-1",
    promptRef: { type: "prompt", id: "prompt_03" },
    replyText: "You said you'd talk anyone's ear off about bridges — go on then.",
    ...overrides,
  };
}

function card(overrides: Partial<ConnectCardContext> = {}): ConnectCardContext {
  return {
    ownerId: "alice",
    shownProfileId: "bob",
    action: "pending",
    released: true,
    ...overrides,
  };
}

describe("validateConnect", () => {
  it("accepts a reply to a specific prompt", () => {
    expect(validateConnect(draft(), card(), null)).toEqual({ ok: true });
  });

  it("accepts a voice reply with no text", () => {
    const voice = draft({ replyText: null, replyVoicePath: "voice/abc.webm" });
    expect(validateConnect(voice, card(), null)).toEqual({ ok: true });
  });

  it("rejects an empty hello — there is no like button", () => {
    const empty = draft({ replyText: "   ", replyVoicePath: null });
    expect(validateConnect(empty, card(), null)).toMatchObject({
      ok: false,
      code: "reply_required",
    });
  });

  it("rejects acting on someone else's card", () => {
    expect(validateConnect(draft(), card({ ownerId: "mallory" }), null)).toMatchObject({
      code: "not_your_card",
    });
  });

  it("rejects a card that points at a different person", () => {
    expect(validateConnect(draft(), card({ shownProfileId: "carol" }), null)).toMatchObject({
      code: "card_mismatch",
    });
  });

  it("rejects an unreleased drop", () => {
    expect(validateConnect(draft(), card({ released: false }), null)).toMatchObject({
      code: "drop_not_released",
    });
  });

  it("rejects a card that was already passed or connected", () => {
    expect(validateConnect(draft(), card({ action: "passed" }), null)).toMatchObject({
      code: "card_already_acted",
    });
    expect(validateConnect(draft(), card({ action: "connected" }), null)).toMatchObject({
      code: "card_already_acted",
    });
  });

  it("enforces one connect per pair per season, in every status", () => {
    for (const status of ["pending", "accepted", "declined", "expired"] as const) {
      expect(validateConnect(draft(), card(), status)).toMatchObject({
        code: "connect_exists",
      });
    }
  });

  it("rejects an overlong reply", () => {
    const long = draft({ replyText: "x".repeat(1001) });
    expect(validateConnect(long, card(), null)).toMatchObject({ code: "reply_too_long" });
  });
});

describe("respondToConnect", () => {
  it("opens a chat on accept, with the fuse already running", () => {
    const outcome = respondToConnect("accept", {
      fromUser: "alice",
      toUser: "bob",
      at: NOW,
      fuseDays: 7,
    });
    expect(outcome.status).toBe("accepted");
    expect(outcome.chat?.fuseExpiresAt).toBe(addDays(NOW, 7));
  });

  it("seeds the connect reply as message #1", () => {
    const outcome = respondToConnect("accept", {
      fromUser: "alice",
      toUser: "bob",
      at: NOW,
      fuseDays: 7,
    });
    expect(outcome.effects).toContainEqual({
      kind: "seed_first_message",
      fromUser: "alice",
    });
  });

  it("sends a real answer on decline, not silence", () => {
    const outcome = respondToConnect("decline", {
      fromUser: "alice",
      toUser: "bob",
      at: NOW,
      fuseDays: 7,
    });
    expect(outcome.status).toBe("declined");
    expect(outcome.chat).toBeUndefined();
    expect(outcome.effects).toContainEqual({
      kind: "system_message",
      templateId: "decline_auto",
      toUser: "alice",
    });
  });

  it("still answers the sender when the season expires a pending connect", () => {
    const outcome = expireConnect("alice");
    expect(outcome.status).toBe("expired");
    // Its own note, not the decline. `decline_auto` claims they read it.
    expect(outcome.effects).toContainEqual({
      kind: "system_message",
      templateId: "expired_auto",
      toUser: "alice",
    });
  });
});

describe("needsNudge", () => {
  it("nudges the recipient once, after 72 hours", () => {
    const connect = { status: "pending" as const, createdAt: NOW };
    expect(needsNudge(connect, addHours(NOW, 71))).toBe(false);
    expect(needsNudge(connect, addHours(NOW, 72))).toBe(true);
  });

  it("never nudges twice", () => {
    const nudged = { status: "pending" as const, createdAt: NOW, nudgedAt: addHours(NOW, 72) };
    expect(needsNudge(nudged, addHours(NOW, 200))).toBe(false);
  });

  it("never nudges a connect that has been answered", () => {
    for (const status of ["accepted", "declined", "expired"] as const) {
      expect(needsNudge({ status, createdAt: NOW }, addHours(NOW, 100))).toBe(false);
    }
  });
});

describe("answerWindow", () => {
  const sent = "2026-09-12T00:00:00.000Z";
  const at = (hours: number) =>
    new Date(Date.parse(sent) + hours * 3_600_000).toISOString();

  it("is calm for the first third of the window", () => {
    expect(answerWindow(sent, at(1)).tone).toBe("calm");
    expect(answerWindow(sent, at(23)).tone).toBe("calm");
  });

  it("turns amber, then urgent, as the nudge approaches", () => {
    expect(answerWindow(sent, at(30)).tone).toBe("amber");
    expect(answerWindow(sent, at(60)).tone).toBe("urgent");
  });

  it("keeps counting past the nudge rather than pretending the note is gone", () => {
    // A pending connect survives until the season ends. 72h is when the sender
    // is told nobody has answered, not when the note disappears.
    const after = answerWindow(sent, at(83));
    expect(after.left).toBeCloseTo(-11, 5);
    expect(after.remaining).toBe(0);
    expect(after.tone).toBe("urgent");
  });

  it("never draws an arc outside 0..1", () => {
    for (const h of [-5, 0, 36, 72, 500]) {
      const w = answerWindow(sent, at(h));
      expect(w.remaining).toBeGreaterThanOrEqual(0);
      expect(w.remaining).toBeLessThanOrEqual(1);
    }
  });
});
