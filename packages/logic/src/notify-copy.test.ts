import { describe, expect, it } from "vitest";
import { renderNotification } from "./notify-copy";

const TZ = "America/New_York";
const context = { firstName: "Maya", timeZone: TZ };

describe("filling in §9.4's copy", () => {
  it("renders a name into the line verbatim", () => {
    const result = renderNotification("connect_accepted", { chat_id: "c1" }, context);
    expect(result?.body).toBe("Maya said yes. Your seven days start now.");
    expect(result?.url).toBe("/chats/c1");
  });

  it("turns a prompt reference into the topic a person would recognise", () => {
    const result = renderNotification(
      "connect_received",
      { connect_id: "k1", prompt_ref: "prompt_11" },
      context,
    );
    expect(result?.body).toBe("Someone replied to your prompt about your unpopular food opinion.");
    expect(result?.url).toBe("/inbox/k1");
  });

  it("names the weekday in the season's timezone, not the server's", () => {
    // 01:00 UTC on the 18th is still Thursday the 17th in Atlanta. A server in
    // UTC would tell them Friday, for a date they are going to on Thursday.
    const result = renderNotification(
      "date_confirmed",
      { chat_id: "c1", place: "Ponce City Market", day: "2026-09-18T01:00:00.000Z" },
      context,
    );
    expect(result?.body).toBe("It's on: Thursday, Ponce City Market. The clock's paused — go be people.");
  });

  it("refuses to send a line with a hole in it", () => {
    // "{{FIRST_NAME}} said yes" on a lock screen is worse than silence, and
    // substituting "Someone" would be rewriting copy §9 says not to rewrite.
    expect(renderNotification("connect_accepted", { chat_id: "c1" }, { timeZone: TZ })).toBeNull();
    expect(
      renderNotification("date_proposed", { chat_id: "c1", place: "Ponce" }, context),
    ).toBeNull();
  });

  it("returns null for a template §9.4 has no push line for", () => {
    // Real templates — they have email and SMS copy in §9.5 and no push line.
    expect(renderNotification("admitted_claim", {}, context)).toBeNull();
    expect(renderNotification("member_warned", { reason: "hate" }, context)).toBeNull();
  });

  it("sends the drop somewhere that is not a conversation", () => {
    const result = renderNotification("drop_live", {}, context);
    expect(result?.body).toBe("Tonight's drop is live. 👻");
    expect(result?.url).toBe("/tonight");
  });

  it("collapses by conversation, so two warnings about one chat replace", () => {
    const first = renderNotification("fuse_48h", { chat_id: "c1" }, context);
    const second = renderNotification("fuse_24h", { chat_id: "c1" }, context);
    expect(first?.tag).toBe("c1");
    expect(second?.tag).toBe(first?.tag);
  });

  it("names the season in the two announcements that are about one", () => {
    const start = renderNotification(
      "season_start",
      { season_id: "s1", season_name: "Atlanta Season One" },
      context,
    );
    expect(start?.body).toBe(
      "Atlanta Season One starts today. Your first drop lands at 8:00 PM tonight.",
    );
    expect(start?.url).toBe("/tonight");

    // And without the name it sends nothing rather than "{{SEASON_NAME}} starts
    // today" — the rule every other template here follows.
    expect(renderNotification("season_start", {}, context)).toBeNull();
  });

  it("carries a broadcast's own words, because §9 has none for it", () => {
    const result = renderNotification(
      "broadcast",
      { body: "The finale venue is booked — details Friday." },
      context,
    );
    expect(result?.body).toBe("The finale venue is booked — details Friday.");
    expect(result?.url).toBe("/tonight");
  });

  it("and refuses an empty one rather than showing a blank notification", () => {
    expect(renderNotification("broadcast", {}, context)).toBeNull();
    expect(renderNotification("broadcast", { body: "" }, context)).toBeNull();
  });

  it("never puts a chat id in front of somebody as a destination it cannot reach", () => {
    // No id in the payload: the fallback is a real route, not `/chats/undefined`.
    // `/inbox` since notes and chats share one list — `/chats` is now only a
    // redirect, and sending somebody to a redirect is a wasted navigation.
    const result = renderNotification("closure_received", {}, context);
    expect(result?.url).toBe("/inbox");
  });
});
