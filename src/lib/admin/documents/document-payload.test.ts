import { describe, expect, it } from "vitest";
import { documentCanon, documentFingerprint, invoiceDocument } from "@/lib/admin/documents/document-payload";
import { invoiceColumns, invoiceFromRow, type InvoiceRow } from "@/lib/admin/invoices/mapper";
import type { InvoiceActivation } from "@/lib/admin/documents/types";
import { invoiceFixture } from "@/lib/payments/fixtures";

/**
 * One document, two renders.
 *
 * The admin's preview and the PDF that is mailed have to be the same
 * document, and "have to" is worth nothing unless something breaks when they
 * are not. What makes it true is that both are built by `invoiceDocument`
 * from the same row: this file pins that the function ignores everything
 * else once an invoice is definitive, and that the fingerprint notices when
 * any printed field moves.
 */
const frozen = {
  serviceId: "svc-1",
  serviceName: "Websitebeheer",
  monthlyNetCents: 2500,
  monthlyGrossCents: 3025,
  firstDebitOn: "2026-10-01",
};

/** What a screen might currently believe about the monthly service. */
const live: InvoiceActivation = { serviceName: "Iets anders", monthlyGrossCents: 9900, firstDebitOn: "2027-01-01" };

describe("the document an invoice renders as", () => {
  it("uses the note that was frozen into it, whatever the screen thinks", () => {
    const issued = invoiceFixture({ status: "issued", activationNote: frozen });

    expect(invoiceDocument(issued, live).activates).toEqual({
      serviceName: "Websitebeheer",
      monthlyGrossCents: 3025,
      firstDebitOn: "2026-10-01",
    });
  });

  it("carries no note when the definitive invoice was issued without one", () => {
    const issued = invoiceFixture({ status: "issued" });

    expect(invoiceDocument(issued, live).activates).toBeUndefined();
  });

  /* A concept has nothing frozen yet, so its preview is a preview. */
  it("falls back to the screen's view while the invoice is a concept", () => {
    const concept = invoiceFixture({
      status: "draft",
      number: { value: "FAC-CONCEPT-QLJB5", provisional: true },
      issuedAt: undefined,
      sentAt: undefined,
    });

    expect(invoiceDocument(concept, live).activates).toEqual(live);
    expect(invoiceDocument(concept).activates).toBeUndefined();
  });
});

describe("the fingerprint", () => {
  const issued = invoiceFixture({ status: "issued", activationNote: frozen });
  const base = documentFingerprint(invoiceDocument(issued));

  it("is the same for two documents built from the same invoice", () => {
    expect(documentFingerprint(invoiceDocument(issued))).toBe(base);
    // Built from a copy with its keys in another order: the same document.
    const copy = { ...issued, lines: issued.lines.map((line) => ({ ...line })) };
    expect(documentFingerprint(invoiceDocument(copy))).toBe(base);
  });

  /* Anything the customer would read differently is a different document. */
  it.each([
    ["the number", { number: { value: "YM-F-2026-000002", provisional: false } }],
    ["the payment reference", { paymentReference: "PO-4417" }],
    ["the due date", { dueDate: "2026-10-31" }],
    ["an amount", { netCents: 12345 }],
    ["the notes", { notes: "Iets anders" }],
    ["the customer", { customer: { ...issued.customer, companyName: "Beta BV" } }],
  ])("changes when %s changes", (_what, override) => {
    const other = invoiceFixture({ status: "issued", activationNote: frozen, ...override });
    expect(documentFingerprint(invoiceDocument(other))).not.toBe(base);
  });

  it("changes when the monthly-service note changes", () => {
    const other = invoiceFixture({ status: "issued", activationNote: { ...frozen, monthlyGrossCents: 9900 } });
    expect(documentFingerprint(invoiceDocument(other))).not.toBe(base);
  });

  /* `updatedAt` is not something the document prints. */
  it("ignores what is not on the document", () => {
    const touched = invoiceFixture({ status: "issued", activationNote: frozen, updatedAt: "2027-01-01T00:00:00.000Z" });
    expect(documentFingerprint(invoiceDocument(touched))).toBe(base);
  });

  it("names the fields it is made of, so a silent omission shows", () => {
    const canon = documentCanon(invoiceDocument(issued));
    for (const field of ["number:", "reference:", "issue:", "due:", "line0:", "subtotal:", "vat:", "total:", "activation:"]) {
      expect(canon).toContain(field);
    }
  });
});

/*
  The screen and the send flow read the same row through the same mapper.
  Two mappings of one row are one document -- which is what makes the
  fingerprint the screen sends comparable to the one the server computes.
*/
describe("preview and send, from one row", () => {
  const row = {
    id: "inv-1",
    number_value: "YM-F-2026-000001",
    number_provisional: false,
    status: "issued",
    customer_id: "cust-1",
    customer_company_name: "Alfa BV",
    customer_contact_name: "A. Alfa",
    customer_email: "a@example.com",
    customer_street: "Straat 1",
    customer_postal_code: "1011 AA",
    customer_city: "Amsterdam",
    customer_country: "Nederland",
    customer_kvk_number: null,
    customer_vat_number: null,
    project_id: null,
    recurring_service_id: null,
    billing_period_start: null,
    billing_period_end: null,
    issue_date: "2026-09-19",
    due_date: "2026-10-03",
    finalizing_at: "2026-09-19T18:00:00.000Z",
    issued_at: "2026-09-19T18:00:00.000Z",
    activation_note: frozen,
    document_path: "2026/YM-F-2026-000001.pdf",
    document_sha256: "a".repeat(64),
    document_bytes: 12345,
    document_generated_at: "2026-09-19T18:00:00.000Z",
    payment_reference: "YM-F-2026-000001",
    notes: "",
    quote_id: null,
    sent_at: null,
    recipient_email: null,
    updated_at: "2026-09-19T18:00:00.000Z",
    invoice_lines: [
      { id: "l1", position: 0, description: "Werk", quantity_hundredths: 100, unit_price_cents: 150000, vat_rate: 21 },
    ],
  } satisfies InvoiceRow;

  it("produces the identical document on both sides", () => {
    const onScreen = invoiceDocument(invoiceFromRow(row), live);
    const onServer = invoiceDocument(invoiceFromRow(row));

    expect(documentFingerprint(onScreen)).toBe(documentFingerprint(onServer));
    expect(onScreen.invoice.number.value).toBe(onServer.invoice.number.value);
    expect(onScreen.invoice.paymentReference).toBe(onServer.invoice.paymentReference);
    expect(onScreen.invoice.lines).toEqual(onServer.invoice.lines);
    expect(onScreen.activates).toEqual(onServer.activates);
    // And nothing provisional survived into it.
    expect(documentCanon(onServer)).not.toContain("CONCEPT");
  });

  /* The row the screen reads is the row the send flow reads; same columns. */
  it("reads the frozen fields out of the same column list", () => {
    for (const column of ["issued_at", "activation_note", "payment_reference", "number_value", "document_path", "document_sha256"]) {
      expect(invoiceColumns).toContain(column);
    }
  });
});
