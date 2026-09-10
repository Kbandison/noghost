import { describe, expect, it } from "vitest";
import { renderEmail } from "./notify-email";

const ctx = { seasonName: "Atlanta Season One", seasonEndDate: "30 November", seasonWeeks: 8 };

describe("filling in §9.5's lifecycle mail", () => {
  it("renders a subject, a preheader and the body", () => {
    const mail = renderEmail("application_received", {}, ctx);
    expect(mail?.subject).toBe("Application received — Atlanta Season One");
    expect(mail?.preheader).toBe("Here's what happens next.");
    expect(mail?.paragraphs.length).toBeGreaterThan(2);
    expect(mail?.paragraphs[0]).toContain("Atlanta Season One");
  });

  it("refuses rather than sending a hole", () => {
    // "{{SEASON_NAME}} starts today" in an inbox is worse than silence, and
    // substituting a generic word would be rewriting §9.5 at send time.
    expect(renderEmail("application_received", {}, {})).toBeNull();
    expect(renderEmail("season_start", {}, { seasonName: "S1" })).toBeNull();
  });

  it("returns null for a template §9.5 never wrote", () => {
    expect(renderEmail("connect_received", {}, ctx)).toBeNull();
    expect(renderEmail("invented_by_nobody", {}, ctx)).toBeNull();
  });

  it("carries a broadcast's own words, because §9 has none for it", () => {
    const mail = renderEmail("broadcast", { body: "The finale venue is booked." }, ctx);
    expect(mail?.paragraphs).toEqual(["The finale venue is booked."]);
    expect(renderEmail("broadcast", {}, ctx)).toBeNull();
  });

  it("formats money as money", () => {
    const mail = renderEmail(
      "admitted_claim",
      {},
      {
        ...ctx,
        link: "https://noghostdating.app/claim",
        claimHours: 72,
        claimDeadline: "Friday at 8pm",
        priceCents: 5000,
      },
    );
    expect(mail).not.toBeNull();
    // Not "$50.00" and never "5000".
    expect(mail?.paragraphs.join(" ")).toContain("$50");
    expect(mail?.paragraphs.join(" ")).not.toContain("5000");
  });

  it("returns null for an SMS-only template rather than throwing on it", () => {
    // §9.5's `claim_reminder` has no subject and no body — reading them off it
    // would throw, and §8 routes it to sms alone.
    expect(renderEmail("claim_reminder", {}, ctx)).toBeNull();
  });

  it("never leaves a token behind in anything it does return", () => {
    for (const template of ["application_received", "season_start", "season_finale"]) {
      const mail = renderEmail(template, {}, { ...ctx, link: "https://noghostdating.app" });
      if (!mail) continue;
      const all = [mail.subject, mail.preheader, ...mail.paragraphs].join(" ");
      expect(all).not.toMatch(/\{\{[A-Z_]+\}\}/);
    }
  });
});
