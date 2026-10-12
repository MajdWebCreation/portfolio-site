import { describe, expect, it } from "vitest";
import { portalQuoteState, quoteDecisionFromPortalRow } from "@/lib/portal/quotes/model";
import { decisionTextProblem, isOfflineDecisionSource, normalizeDecisionText, shortHash } from "@/lib/quotes/decision";
import { buildDecisionConfirmation, buildInternalDecisionNotice } from "@/lib/quotes/decision-mail";

const content = {
  decisionId: "dec-1",
  quoteId: "11111111-1111-4111-8111-111111111111",
  quoteNumber: "YM-O-2026-000007",
  decidedAt: "2026-10-12T10:15:00.000Z",
  termsEdition: "2026",
  rejectionReason: null,
};

describe("a decision's text", () => {
  it("is trimmed, and nothing when empty", () => {
    expect(normalizeDecisionText("  Te duur.\r\nLater  ")).toBe("Te duur.\nLater");
    expect(normalizeDecisionText("   ")).toBeNull();
    expect(normalizeDecisionText(undefined)).toBeNull();
  });

  it("is refused past 2000 characters, counted as the database counts them, or with control or direction characters", () => {
    expect(decisionTextProblem("x".repeat(2000))).toBeNull();
    expect(decisionTextProblem("😀".repeat(2000))).toBeNull();
    expect(decisionTextProblem("x".repeat(2001))).toBeTruthy();
    expect(decisionTextProblem("a‮b")).toBeTruthy();
    expect(decisionTextProblem("a\u0007b")).toBeTruthy();
    expect(decisionTextProblem("regel één\nregel twee\tmet tab")).toBeNull();
  });

  it("offline sources never include the portal", () => {
    expect(isOfflineDecisionSource("email")).toBe(true);
    expect(isOfflineDecisionSource("portal")).toBe(false);
    expect(isOfflineDecisionSource("fax")).toBe(false);
  });

  it("shows a hash short", () => {
    expect(shortHash("0123456789abcdef".repeat(4))).toBe("01234567…89abcdef");
  });
});

describe("the portal's reading of a decision", () => {
  const row = { decision: null, source: null, decided_at: null, rejection_reason: null, decided_by_email: null, terms_edition: "2026", refusal: null, document_sha256: "a".repeat(64) };

  it("is open with the document the form must carry back", () => {
    expect(quoteDecisionFromPortalRow(row)).toEqual({ state: "open", documentSha256: "a".repeat(64), termsEdition: "2026" });
  });

  it("names the decision, and who made it in the portal", () => {
    expect(
      quoteDecisionFromPortalRow({ ...row, refusal: "decided", decision: "rejected", source: "portal", decided_at: content.decidedAt, rejection_reason: "Nee", decided_by_email: "a@b.nl" }),
    ).toEqual({
      state: "decided",
      documentSha256: "a".repeat(64),
      termsEdition: "2026",
      decision: { kind: "rejected", source: "portal", decidedAt: content.decidedAt, rejectionReason: "Nee", decidedBy: "a@b.nl" },
    });
  });

  it("refuses an answer it does not know", () => {
    expect(() => quoteDecisionFromPortalRow({ ...row, refusal: "maybe" })).toThrow();
    expect(() => quoteDecisionFromPortalRow({ ...row, refusal: "decided" })).toThrow();
  });

  it("lets a decision win over a newer version or the date", () => {
    const replaced = { validUntil: "2026-01-01", supersededBy: { id: "q2", number: "N2", sentAt: null } };
    expect(portalQuoteState({ ...replaced, status: "rejected" }, "2026-10-12")).toBe("rejected");
    expect(portalQuoteState({ ...replaced, status: "accepted" }, "2026-10-12")).toBe("accepted");
    expect(portalQuoteState({ ...replaced, status: "sent" }, "2026-10-12")).toBe("superseded");
    expect(portalQuoteState({ validUntil: "2026-01-01", status: "sent" }, "2026-10-12")).toBe("expired");
    expect(portalQuoteState({ validUntil: "2099-01-01", status: "sent" }, "2026-10-12")).toBe("awaiting");
  });
});

describe("the mails of a decision", () => {
  it("confirms an acceptance with the terms and a link to the portal", () => {
    const mail = buildDecisionConfirmation({ ...content, decision: "accepted", contactName: "Jan" });
    expect(mail.subject).toBe("Offerte geaccepteerd: YM-O-2026-000007 | YM Creations");
    expect(mail.text).toContain("Beste Jan,");
    expect(mail.text).toContain("Algemene Voorwaarden B2B 2026");
    expect(mail.text).toContain(`/portaal/offertes/${content.quoteId}`);
  });

  it("confirms a rejection with the customer's own words, escaped", () => {
    const mail = buildDecisionConfirmation({ ...content, decision: "rejected", rejectionReason: "<b>Te duur</b>", contactName: "" });
    expect(mail.subject).toBe("Offerte afgewezen: YM-O-2026-000007 | YM Creations");
    expect(mail.text).toContain("Uw toelichting: <b>Te duur</b>");
    expect(mail.html).not.toContain("<b>Te duur</b>");
    expect(mail.html).toContain("&lt;b&gt;Te duur&lt;/b&gt;");
    expect(mail.text).not.toContain("Algemene Voorwaarden");
  });

  it("tells YM Creations who, which quote, what and why", () => {
    const mail = buildInternalDecisionNotice({ ...content, decision: "rejected", rejectionReason: "Te duur", companyName: "Alfa BV", actorEmail: "jan@alfa.nl" });
    expect(mail.subject).toBe("YM-O-2026-000007 afgewezen door Alfa BV");
    expect(mail.text).toContain("Klant: Alfa BV");
    expect(mail.text).toContain("Reden: Te duur");
    expect(mail.text).toContain("Door: jan@alfa.nl");
    expect(mail.text).toContain(`/admin/offertes/${content.quoteId}`);
  });
});
