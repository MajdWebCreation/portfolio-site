import { describe, expect, it } from "vitest";
import { buildDocumentMailBody, invoiceSubject } from "@/lib/admin/documents/email";

/*
  The invoice mail. Paying an invoice settles that invoice and nothing else --
  direct debit is activated through its own EUR 0.01 link -- so the mail never
  speaks of a mandate, a monthly amount or an incasso.

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
