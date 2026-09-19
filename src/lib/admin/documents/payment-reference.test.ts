import { describe, expect, it } from "vitest";
import { buildDocumentMailBody } from "@/lib/admin/documents/email";
import { isProvisionalDocumentNumber } from "@/lib/admin/documents/numbering";
import { invoiceMetaRows, paymentInstruction } from "@/lib/admin/pdf/invoice-pdf";
import { invoiceFixture } from "@/lib/payments/fixtures";

/**
 * The betalingskenmerk of an invoice that is being issued.
 *
 * One value has to end up in four places at once -- the row, the PDF, the
 * mail and the bank transfer the customer makes -- and the failure this
 * guards against is silent: a payment that arrives quoting a reference no
 * invoice carries is money nobody can book.
 */
describe("telling an automatic reference from one the admin typed", () => {
  /*
    The screens ask this to say what will happen to the betalingskenmerk when
    the invoice is made definitive. `finalize_invoice` asks the same question
    in SQL at the moment it happens, of the same two prefixes; the test in
    invoices/finalize.test.ts reads the migration to keep the two together.
  */
  it("recognises the values a concept is given automatically", () => {
    expect(isProvisionalDocumentNumber("FAC-CONCEPT-QLJB5")).toBe(true);
    // A concept whose reference came from a different seed than its number;
    // that is still an automatic value, and still may not reach a customer.
    expect(isProvisionalDocumentNumber("FAC-CONCEPT-OUSHO")).toBe(true);
    expect(isProvisionalDocumentNumber("OFF-CONCEPT-AB12C")).toBe(true);
    expect(isProvisionalDocumentNumber(" FAC-CONCEPT-X ")).toBe(true);
  });

  it("leaves everything a person would type alone", () => {
    expect(isProvisionalDocumentNumber("PO-4417")).toBe(false);
    expect(isProvisionalDocumentNumber("Inkoopnummer 2026/88")).toBe(false);
    expect(isProvisionalDocumentNumber("YM-F-2025-000123")).toBe(false);
    expect(isProvisionalDocumentNumber("")).toBe(false);
  });
});

describe("what the PDF prints", () => {
  const issued = invoiceFixture({
    number: { value: "YM-F-2026-000001", provisional: false },
    paymentReference: "YM-F-2026-000001",
  });

  it("asks for the definitive reference in the payment sentence and the rows", () => {
    expect(paymentInstruction(issued)).toContain("onder vermelding van YM-F-2026-000001");
    expect(paymentInstruction(issued)).not.toContain("CONCEPT");
    expect(invoiceMetaRows(issued).find((row) => row.label === "Betalingskenmerk")?.value).toBe("YM-F-2026-000001");
  });

  it("prints a manual reference instead, in both places", () => {
    const own = { ...issued, paymentReference: "PO-4417" };
    expect(paymentInstruction(own)).toContain("onder vermelding van PO-4417");
    expect(invoiceMetaRows(own).find((row) => row.label === "Betalingskenmerk")?.value).toBe("PO-4417");
  });
});

describe("what the mail says", () => {
  const base = {
    kind: "invoice" as const,
    number: "YM-F-2026-000001",
    recipientEmail: "a@example.com",
    contactName: "A. Alfa",
    issueDateLabel: "19 sep 2026",
    deadlineLabel: "3 okt 2026",
    totalLabel: "€ 1.815,00",
    pdf: new Uint8Array(),
    fileName: "YM-F-2026-000001.pdf",
  };

  /*
    The reference is the number here, so naming it twice under two labels
    would read as two things to quote. The number is already in the mail.
  */
  it("does not repeat the number as a separate reference", () => {
    const mail = buildDocumentMailBody({ ...base, paymentReference: "YM-F-2026-000001" });
    for (const body of [mail.html, mail.text]) {
      expect(body).toContain("YM-F-2026-000001");
      expect(body).not.toContain("Betalingskenmerk");
    }
  });

  it("names a manual reference, so the mail and the PDF ask for the same thing", () => {
    const mail = buildDocumentMailBody({ ...base, paymentReference: "PO-4417" });
    for (const body of [mail.html, mail.text]) {
      expect(body).toContain("Betalingskenmerk");
      expect(body).toContain("PO-4417");
    }
  });

  it("never carries a concept reference", () => {
    const mail = buildDocumentMailBody({ ...base, paymentReference: "YM-F-2026-000001" });
    for (const body of [mail.html, mail.text]) {
      expect(body).not.toContain("FAC-CONCEPT");
    }
  });
});
