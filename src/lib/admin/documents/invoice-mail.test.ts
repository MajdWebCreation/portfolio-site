import { describe, expect, it } from "vitest";
import { buildDocumentMailBody, invoiceSubject } from "@/lib/admin/documents/email";

/*
  The invoice mail. An ordinary invoice payment settles that invoice and the
  mail says nothing about direct debit. When the payment is also the
  customer's mandate (payMode "first"), the one button says both and one
  short section says what that means -- never a second button, never a
  separate amount.

  Amounts are compared with the spaces normalised: Intl puts a non-breaking
  space after the euro sign, which is right in a mail and unreadable in an
  assertion.
*/
const flat = (value: string) => value.replace(/ /g, " ");

const base = {
  kind: "invoice" as const,
  number: "YM-F-2026-000001",
  recipientEmail: "a@example.com",
  contactName: "A. Alfa",
  issueDateLabel: "13 sep 2026",
  deadlineLabel: "27 sep 2026",
  totalLabel: "€ 1.815,00",
  pdf: new Uint8Array(),
  fileName: "YM-F-2026-000001.pdf",
  projectName: "Website Alfa BV",
  payUrl: "https://pay.mollie.com/tr_1",
};

const plain = buildDocumentMailBody(base);

describe("the subject", () => {
  it("names the project, not the invoice number", () => {
    expect(invoiceSubject(base)).toBe("Factuur voor Website Alfa BV");
    expect(invoiceSubject(base)).not.toContain("YM-F");
  });
});

/*
  An ordinary invoice is a transactional mail too, so it carries the same
  contact block -- one thing the customer recognises across all of them.
*/
describe("the contact block across the transactional mails", () => {
  it("appears on an ordinary invoice, under its payment button", () => {
    expect(plain.html).toContain(">WhatsApp ons<");
    expect(plain.html.indexOf("Factuur betalen")).toBeLessThan(plain.html.indexOf("WhatsApp ons"));
    expect(plain.text).toContain("WhatsApp ons: https://wa.me/31653400220");
  });

  /* A quote is a proposal, not a payment request; it keeps its own closing. */
  it("stays off a quote", () => {
    const quote = buildDocumentMailBody({
      ...base,
      kind: "quote",
      payUrl: undefined,
    });
    expect(quote.html).not.toContain("WhatsApp ons");
    expect(quote.text).toContain("Vragen of aanpassingen? Reageer gerust op deze mail.");
  });
});

describe("an invoice mail", () => {
  it("keeps the plain call to action and says nothing about direct debit or a monthly amount", () => {
    expect(plain.html).toContain("Factuur betalen");
    expect(plain.html).not.toContain("automatische incasso");
    expect(plain.text).not.toContain("machtig");
    for (const body of [plain.html, plain.text].map(flat)) {
      expect(body).not.toContain("€ 30,25");
      expect(body).not.toContain("per maand");
    }
  });
});

describe("an invoice whose one payment is also the direct debit mandate", () => {
  const combined = buildDocumentMailBody({ ...base, payUrl: "https://payment-link.mollie.com/payment/pl_first", payMode: "first" });

  it("has exactly one button, named for both", () => {
    expect(combined.html).toContain(">Factuur betalen en incasso activeren<");
    expect(combined.html).not.toContain(">Factuur betalen<");
    expect(combined.html.match(/payment-link\.mollie\.com/g)).toHaveLength(1);
    expect(flat(combined.text)).toContain("Factuur betalen en incasso activeren: https://payment-link.mollie.com/payment/pl_first");
  });

  it("says the payment settles the invoice and authorises the monthly collection, for the invoice amount only", () => {
    expect(flat(combined.text)).toContain("Met deze betaling voldoe je de factuur en geef je tegelijk toestemming voor de automatische incasso");
    expect(flat(combined.text)).toContain("Je betaalt nu alleen het factuurbedrag");
    expect(combined.text).not.toMatch(/0,01|activatielink/);
  });

  it("stays an ordinary invoice mail without a link", () => {
    const none = buildDocumentMailBody({ ...base, payUrl: undefined, payMode: "first" });
    expect(none.text).not.toContain("incasso");
  });
});

