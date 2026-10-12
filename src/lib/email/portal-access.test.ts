import { describe, expect, it } from "vitest";
import { buildDocumentMailBody } from "@/lib/admin/documents/email";
import { buildCreditNoteMailBody } from "@/lib/admin/documents/credit-note-mail";
import { portalAccessTextLine, portalUrl, portalUrlLabel } from "@/lib/email/portal-access";
import { buildActivationMail } from "@/lib/payments/activation-email";
import { buildReminderMailBody } from "@/lib/payments/reminder-email";
import { buildCancellationMail, buildPriceChangeMail } from "@/lib/payments/service-change-email";
import { accessGrantedMail, inviteMail, passwordResetMail, reinviteMail, welcomeMail } from "@/lib/portal/mail";
import { buildDecisionConfirmation, buildInternalDecisionNotice } from "@/lib/quotes/decision-mail";
import { buildInternalRequestMail, buildRequestReceivedMail, buildRequestStatusMail } from "@/lib/requests/mail";

/*
  A customer never has to remember where the portal is: every mail of the
  customer relationship names it once, quietly, under the mail's own action,
  and the account mails say it where it matters most.
*/
const footerLink = `href="${portalUrl}"`;

describe("the portal address", () => {
  it("is the production address, never a local or a preview one", () => {
    expect(portalUrl).toBe("https://ymcreations.com/portaal");
    expect(portalUrlLabel).toBe("ymcreations.com/portaal");
    expect(portalAccessTextLine()).toBe("Klantportaal: https://ymcreations.com/portaal");
  });
});

const invoiceBase = {
  kind: "invoice" as const,
  number: "YM-F-2026-000001",
  contactName: "A. Alfa",
  issueDateLabel: "13 sep 2026",
  deadlineLabel: "27 sep 2026",
  totalLabel: "€ 1.815,00",
  pdf: new Uint8Array(),
  fileName: "YM-F-2026-000001.pdf",
  payUrl: "https://payment-link.mollie.com/payment/pl_1",
};

const reminderBase = {
  contactName: "A. Alfa",
  invoiceNumber: "YM-F-2026-000001",
  dueDateLabel: "28 sep 2026",
  daysOverdue: 3,
  outstandingLabel: "€ 1.815,00",
  finalDateLabel: "19 okt 2026",
  payUrl: "https://payment-link.mollie.com/payment/pl_1",
};

const customerMails: [string, { html: string; text: string }][] = [
  ["invoice", buildDocumentMailBody(invoiceBase)],
  ["invoice that is also the mandate", buildDocumentMailBody({ ...invoiceBase, payMode: "first" })],
  ["quote", buildDocumentMailBody({ ...invoiceBase, kind: "quote", payUrl: undefined })],
  ["monthly term", buildDocumentMailBody({ ...invoiceBase, payUrl: undefined, recurring: { serviceName: "Websitebeheer", collection: { kind: "scheduled", debitOn: "2026-11-04" } } })],
  ["first reminder", buildReminderMailBody({ ...reminderBase, stage: "first_reminder" })],
  ["second reminder", buildReminderMailBody({ ...reminderBase, stage: "second_reminder" })],
  ["final notice", buildReminderMailBody({ ...reminderBase, stage: "final_notice" })],
  ["direct debit notice", buildReminderMailBody({ ...reminderBase, stage: "first_reminder", payUrl: undefined, collectedByDirectDebit: true })],
  ["credit note", buildCreditNoteMailBody({ contactName: "A. Alfa", number: "YM-C-2026-000001", invoiceNumber: "YM-F-2026-000001", issueDateLabel: "10 okt 2026", reason: "Korting", totalLabel: "€ 60,50", invoicePaid: true, pdf: new Uint8Array(), fileName: "x.pdf" })],
  ["quote decision", buildDecisionConfirmation({ decisionId: "d", quoteId: "11111111-1111-4111-8111-111111111111", quoteNumber: "YM-O-2026-000007", decidedAt: "2026-10-12T10:15:00.000Z", termsEdition: "2026", rejectionReason: null, decision: "accepted", contactName: "Jan" })],
  ["request received", buildRequestReceivedMail({ contactName: "Jan", requestId: "r-1", subject: "Logo", category: "content" })],
  ["request status", buildRequestStatusMail({ contactName: "Jan", requestId: "r-1", subject: "Logo", category: "issue", status: "awaiting_customer" })],
  ["direct debit activation", buildActivationMail({ contactName: "Jan", services: [{ name: "Websitebeheer", monthlyGrossCents: 3025 }], activationUrl: "https://payment-link.mollie.com/payment/pl_act" })],
  ["price change", buildPriceChangeMail({ contactName: "Jan", serviceName: "Websitebeheer", oldNetCents: 1000, oldGrossCents: 1210, newNetCents: 1500, newGrossCents: 1815, vatRate: 21, effectiveFrom: "2026-12-04", firstDebitOn: "2026-12-04" })],
  [
    "cancellation",
    buildCancellationMail({
      contactName: "Jan",
      serviceName: "Websitebeheer",
      monthlyGrossCents: 1210,
      requestedOn: "2026-10-10",
      endsOn: "2026-11-09",
      lastTerm: { start: "2026-11-04", end: "2026-11-09", partial: true, daysUsed: 6, periodDays: 30, grossCents: 242 },
      collectionsAhead: [],
    } as never),
  ],
];

describe("every mail of the customer relationship", () => {
  it.each(customerMails)("%s names the portal once in the footer, as a link, and in plain text", (_name, mail) => {
    expect(mail.html.split(footerLink)).toHaveLength(2);
    expect(mail.html).toContain(`Klantportaal: <a href="https://ymcreations.com/portaal"`);
    expect(mail.html).toContain(">ymcreations.com/portaal</a>");
    expect(mail.text).toContain("Klantportaal: https://ymcreations.com/portaal");
    expect(mail.html).not.toMatch(/localhost|127\.0\.0\.1/);
  });

  it("keeps each mail's own action first: the portal is never a button", () => {
    const invoice = customerMails[0]![1].html;
    expect(invoice).toContain(">Factuur betalen<");
    expect(invoice.indexOf(">Factuur betalen<")).toBeLessThan(invoice.indexOf(footerLink));
    const combined = customerMails[1]![1].html;
    expect(combined.indexOf(">Factuur betalen en incasso activeren<")).toBeLessThan(combined.indexOf(footerLink));
    const reminder = customerMails[4]![1].html;
    expect(reminder.indexOf("payment-link.mollie.com")).toBeLessThan(reminder.indexOf(footerLink));
    for (const [, mail] of customerMails) expect(mail.html).not.toMatch(/>Klantportaal openen</);
  });
});

describe("mails to YM Creations itself", () => {
  it("carry no customer portal line", () => {
    for (const mail of [
      buildInternalDecisionNotice({ decisionId: "d", quoteId: "q", quoteNumber: "YM-O-2026-000007", decidedAt: "2026-10-12T10:15:00.000Z", termsEdition: "2026", rejectionReason: null, decision: "accepted", companyName: "Alfa", actorEmail: null }),
      buildInternalRequestMail({ requestId: "r-1", companyName: "Alfa", subject: "Fout", category: "issue", description: "x" }),
    ]) {
      expect(mail.html).not.toContain("Klantportaal:");
      expect(mail.text).not.toContain("Klantportaal:");
    }
  });
});

describe("the account mails", () => {
  it("keep the set-password link as the button, and say where to log in later", () => {
    for (const mail of [inviteMail({ companyName: "Alfa", tokenHash: "abc" }), reinviteMail({ companyName: "Alfa", tokenHash: "abc" })]) {
      expect(mail.html).toContain(">Wachtwoord instellen<");
      expect(mail.html.indexOf(">Wachtwoord instellen<")).toBeLessThan(mail.html.indexOf(footerLink));
      expect(mail.html).toContain(`Later inloggen? Ga naar <a href="https://ymcreations.com/portaal"`);
      expect(mail.html).toContain(">ymcreations.com/portaal</a>");
      expect(mail.text).toContain("Later inloggen? Ga naar https://ymcreations.com/portaal");
      expect(mail.text.indexOf("token_hash=abc")).toBeLessThan(mail.text.indexOf("Later inloggen"));
    }
  });

  it("welcome the customer once set up, with the portal as the button", () => {
    const mail = welcomeMail();
    expect(mail.subject).toBe("Uw klantportaal is gereed");
    expect(mail.html).toContain(">Klantportaal openen<");
    expect(mail.html).toContain(footerLink);
    expect(mail.text).toContain("Uw klantportaal van YM Creations is gereed.");
    expect(mail.text).toContain("ymcreations.com/portaal");
    expect(mail.text).toContain("https://ymcreations.com/portaal");
    expect(mail.text).toContain("facturen, offertes, diensten, verzoeken en bedrijfsgegevens");
    expect(mail.text).not.toContain("token_hash");
  });

  it("send an existing account to the portal itself, not to a login address of its own", () => {
    const mail = accessGrantedMail({ companyName: "Alfa" });
    expect(mail.html).toContain(footerLink);
    expect(mail.html).not.toContain("/portaal/inloggen");
  });

  it("leave the reset mail about the reset", () => {
    const mail = passwordResetMail({ tokenHash: "abc" });
    expect(mail.html).toContain(">Nieuw wachtwoord instellen<");
    expect(mail.text).not.toContain("Later inloggen");
  });
});
