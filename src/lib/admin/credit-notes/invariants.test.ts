import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoiceLedger } from "@/lib/admin/credit-notes/settlement";
import { creditNoteRpc, invoiceRowFixture, refundTrigger } from "@/lib/admin/credit-notes/test-support";
import { isFinanciallyIssued } from "@/lib/admin/credit-notes/types";
import { invoiceFromRow, type InvoiceRow } from "@/lib/admin/invoices/mapper";
import { invoiceAmounts } from "@/lib/admin/invoices/types";
import { invoiceCollectionView } from "@/lib/payments/collection-state";
import { customerFinancials } from "@/lib/payments/customer-status";
import { createFakeDb } from "@/lib/payments/fixtures";
import { settleInvoice } from "@/lib/payments/settlement";

/**
 * Two invariants, pinned.
 *
 *   1. Only a credit note that is a document counts. One whose issue did
 *      not finish -- numbered, no PDF -- lowers nothing, stops nothing and
 *      refunds nothing, and counts exactly once the moment it is finished.
 *   2. Refunds are capped on the whole invoice: over every credit note of
 *      it, never more than the issued credits and never more than what was
 *      paid, with a pending refund reserving its amount and a failed one
 *      giving it back.
 */
vi.mock("@/lib/admin/pdf/to-buffer", () => ({
  renderCreditNotePdf: vi.fn(async (note: { number: { value: string } }) => Buffer.from(`%PDF ${note.number.value}`)),
  renderInvoicePdf: vi.fn(),
  renderQuotePdf: vi.fn(),
  documentFileName: (number: string) => `${number}.pdf`,
}));
const getPayment = vi.fn();
const createRefund = vi.fn();
const listPaymentRefunds = vi.fn();
vi.mock("@/lib/mollie/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mollie/client")>()),
  getPayment: (...args: unknown[]) => getPayment(...args),
  createRefund: (...args: unknown[]) => createRefund(...args),
  getRefund: vi.fn(),
  listPaymentRefunds: (...args: unknown[]) => listPaymentRefunds(...args),
}));

const { createCreditNote, issueCreditNoteDocument } = await import("@/lib/admin/credit-notes/issue");
const { markManualRefund, refundViaMollie, notIssuedReason } = await import("@/lib/payments/refunds");
const { creditNoteFromRow, refundFromRow } = await import("@/lib/admin/credit-notes/mapper");
const { paymentFromRow } = await import("@/lib/payments/mapper");

type Db = Parameters<typeof createCreditNote>[0];
const admin = { userId: "admin-1" };
const half = { description: "50%", quantityHundredths: 100, unitPriceCents: 5000, vatRate: 21 };

const paidRow = (overrides: Record<string, unknown> = {}) => ({
  id: "pay-1", invoice_id: "inv-1", customer_id: "cust-1", amount_cents: 12100, currency: "EUR", status: "paid", source: "mollie",
  provider_payment_id: "tr_1", method: "ideal", paid_at: "2026-09-02T10:00:00.000Z", description: "Factuur",
  created_at: "2026-09-02T10:00:00.000Z", updated_at: "2026-09-02T10:00:00.000Z", ...overrides,
});

function seed(payments: Record<string, unknown>[] = [paidRow()], invoiceOverrides: Record<string, unknown> = {}) {
  const { invoice, lines } = invoiceRowFixture(invoiceOverrides);
  return createFakeDb({ invoices: [invoice], invoice_lines: lines, payments, credit_notes: [], credit_note_lines: [], refunds: [] }, { rpc: creditNoteRpc(), trigger: refundTrigger });
}

/** The invoice as every reader sees it: through `invoiceColumns`, credit notes embedded. */
function readInvoice(db: ReturnType<typeof seed>) {
  return invoiceFromRow({ ...db.rows("invoices")[0], invoice_lines: db.rows("invoice_lines"), credit_notes: db.rows("credit_notes") } as unknown as InvoiceRow);
}
function ledger(db: ReturnType<typeof seed>) {
  return invoiceLedger({
    invoice: readInvoice(db),
    payments: db.rows("payments").map((row) => paymentFromRow(row as never)),
    creditNotes: db.rows("credit_notes").map((row) => creditNoteFromRow({ ...row, credit_note_lines: db.rows("credit_note_lines").filter((line) => line.credit_note_id === row.id) } as never)),
    refunds: db.rows("refunds").map((row) => refundFromRow(row as never)),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MOLLIE_API_KEY = "test_dummy";
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  getPayment.mockResolvedValue({ id: "tr_1", status: "paid", amount: { currency: "EUR", value: "121.00" }, amountRemaining: { currency: "EUR", value: "121.00" }, amountRefunded: { currency: "EUR", value: "0.00" }, description: "", method: "ideal" });
  listPaymentRefunds.mockResolvedValue([]);
  createRefund.mockImplementation(async (input: { amountCents: number; metadata: Record<string, string> }) => ({ id: `re_${input.metadata.refundId}`, paymentId: "tr_1", status: "pending", amount: { currency: "EUR", value: (input.amountCents / 100).toFixed(2) }, metadata: input.metadata }));
});

describe("only a finished credit note counts", () => {
  it("a numbered note without a document leaves the invoice fully open everywhere", async () => {
    const db = seed([], { status: "sent" });
    db.bucket.failNextUpload("bucket offline");
    const attempt = await createCreditNote(db as unknown as Db, { invoiceId: "inv-1", reason: "Korting", issueDate: "2026-10-10", lines: [half], source: "manual" });
    expect(attempt.ok).toBe(false);
    const row = db.rows("credit_notes")[0]!;
    expect(row).toMatchObject({ number_value: "YM-C-2026-000001", issued_at: null, document_path: null });

    const invoice = readInvoice(db);
    expect(invoice.creditedCents).toBeUndefined();
    expect(invoiceAmounts(invoice)).toEqual({ totalCents: 12100, creditedCents: 0, dueCents: 12100 });
    expect(settleInvoice(invoiceAmounts(invoice).dueCents, []).outstandingCents).toBe(12100);
    expect(customerFinancials([invoice], [], "2026-10-10")).toMatchObject({ outstandingCents: 12100, openInvoiceCount: 1 });
    const reminders = invoiceCollectionView({ invoice, payments: [], events: [], directDebit: false, todayKey: "2026-09-16" });
    expect(reminders).toMatchObject({ outstandingCents: 12100, daysOverdue: 1, dueStage: "first_reminder" });
    expect(ledger(db)).toMatchObject({ creditedCents: 0, dueCents: 12100, notes: [] });
  });

  it("a failed PDF changes nothing about what is due; finishing it later counts the credit exactly once, and a retry never twice", async () => {
    const db = seed();
    db.bucket.failNextUpload("bucket offline");
    await createCreditNote(db as unknown as Db, { invoiceId: "inv-1", reason: "Korting", issueDate: "2026-10-10", lines: [half], source: "manual" });
    expect(invoiceAmounts(readInvoice(db)).dueCents).toBe(12100);
    expect(ledger(db).overpaidCents).toBe(0);

    const id = db.rows("credit_notes")[0]!.id as string;
    const finished = await issueCreditNoteDocument(db as unknown as Db, id);
    expect(finished.ok && finished.creditNote.number.value).toBe("YM-C-2026-000001");
    expect(invoiceAmounts(readInvoice(db))).toEqual({ totalCents: 12100, creditedCents: 6050, dueCents: 6050 });
    expect(ledger(db)).toMatchObject({ creditedCents: 6050, overpaidCents: 6050, refundDueCents: 6050 });

    const again = await issueCreditNoteDocument(db as unknown as Db, id);
    expect(again).toMatchObject({ ok: true, adopted: true });
    expect(db.rows("credit_notes")).toHaveLength(1);
    expect(invoiceAmounts(readInvoice(db)).creditedCents).toBe(6050);
    expect(ledger(db).notes).toHaveLength(1);
  });

  it("refuses a refund on an unfinished note, in the application and in the database", async () => {
    const db = seed();
    db.bucket.failNextUpload("bucket offline");
    await createCreditNote(db as unknown as Db, { invoiceId: "inv-1", reason: "Korting", issueDate: "2026-10-10", lines: [half], source: "manual" });
    const id = db.rows("credit_notes")[0]!.id as string;
    expect(isFinanciallyIssued(creditNoteFromRow(db.rows("credit_notes")[0] as never))).toBe(false);

    expect(await refundViaMollie(db as unknown as Db, id, 6050, admin)).toEqual({ ok: false, reason: notIssuedReason });
    expect(await markManualRefund(db as unknown as Db, id, { amountCents: 6050, settledOn: "2026-10-11", note: "" }, admin)).toEqual({ ok: false, reason: notIssuedReason });
    expect(createRefund).not.toHaveBeenCalled();

    /* Straight at the table, past the application: the trigger refuses too. */
    const direct = await db.from("refunds").insert({ id: "rf-x", credit_note_id: id, invoice_id: "inv-1", customer_id: "cust-1", amount_cents: 100, method: "manual", status: "refunded", idempotency_key: "manual-rf-x", settled_at: "2026-10-11T10:00:00.000Z" }).select().single();
    expect(direct.error?.message).toContain("nog niet afgerond");
    expect(db.rows("refunds")).toHaveLength(0);
  });

  it("a half-finished note still holds its share of the credit cap: the invoice cannot be credited twice", async () => {
    const db = seed();
    db.bucket.failNextUpload("bucket offline");
    await createCreditNote(db as unknown as Db, { invoiceId: "inv-1", reason: "Eerste", issueDate: "2026-10-10", lines: [{ ...half, unitPriceCents: 10000 }], source: "manual" });
    const second = await createCreditNote(db as unknown as Db, { invoiceId: "inv-1", reason: "Tweede", issueDate: "2026-10-10", lines: [half], source: "manual" });
    expect(second).toMatchObject({ ok: false, error: expect.stringContaining("meer gecrediteerd") });
  });
});

describe("the invoice-wide refund cap", () => {
  const credit = (overrides: Record<string, unknown>) => ({
    id: "cn-a", customer_id: "cust-1", invoice_id: "inv-1", number_value: "YM-C-2026-000001", number_provisional: false, status: "issued", reason: "A", issue_date: "2026-10-10",
    source: "manual", recurring_service_id: null, customer_company_name: "Alfa BV", customer_contact_name: "A", customer_email: "a@example.com", customer_street: "S", customer_postal_code: "1", customer_city: "A", customer_country: "Nederland",
    customer_kvk_number: null, customer_vat_number: null, subtotal_cents: 4959, vat_cents: 1041, total_cents: 6000, currency: "EUR",
    finalizing_at: "2026-10-10T10:00:01.000Z", issued_at: "2026-10-10T10:00:02.000Z", document_path: "2026/x.pdf", document_sha256: "b".repeat(64), document_bytes: 10, document_generated_at: "2026-10-10T10:00:02.000Z",
    sent_at: null, recipient_email: null, created_by: null, created_at: "2026-10-10T10:00:00.000Z", updated_at: "2026-10-10T10:00:00.000Z", ...overrides,
  });
  const refund = (overrides: Record<string, unknown>) => ({
    id: `rf-${Math.random().toString(36).slice(2, 8)}`, credit_note_id: "cn-a", invoice_id: "inv-1", customer_id: "cust-1", amount_cents: 0, currency: "EUR", method: "manual", status: "refunded",
    idempotency_key: `k-${Math.random().toString(36).slice(2, 10)}`, settled_at: "2026-10-11T10:00:00.000Z", note: "", ...overrides,
  });

  /* Invoice paid EUR 100; credit note A EUR 60, credit note B EUR 40 (the example from the specification). */
  function seedTwoNotes(paidCents = 10000) {
    const { invoice, lines } = invoiceRowFixture();
    return createFakeDb(
      {
        invoices: [invoice],
        invoice_lines: lines,
        payments: [paidRow({ amount_cents: paidCents })],
        credit_notes: [credit({ id: "cn-a", total_cents: 6000 }), credit({ id: "cn-b", number_value: "YM-C-2026-000002", total_cents: 4000, created_at: "2026-10-10T11:00:00.000Z" })],
        credit_note_lines: [],
        refunds: [],
      },
      { trigger: refundTrigger },
    );
  }
  const write = (db: ReturnType<typeof seedTwoNotes>, row: Record<string, unknown>) => db.from("refunds").insert(refund(row)).select().single();

  it("refuses 60 + 60 on two notes of a 100 invoice, although each refund fits its own note's cap", async () => {
    const db = seedTwoNotes();
    expect((await write(db, { credit_note_id: "cn-a", amount_cents: 6000 })).error).toBeNull();
    const second = await write(db, { credit_note_id: "cn-b", amount_cents: 6000 });
    expect(second.error?.message).toContain("crediteert (4000 cent)");
    const third = await write(db, { credit_note_id: "cn-b", amount_cents: 4001 });
    expect(third.error?.message).toContain("crediteert (4000 cent)");
    expect(db.rows("refunds")).toHaveLength(1);
  });

  it("allows refunds that together equal what was paid, and refuses the cent beyond it", async () => {
    const db = seedTwoNotes(9000);
    expect((await write(db, { credit_note_id: "cn-a", amount_cents: 6000 })).error).toBeNull();
    expect((await write(db, { credit_note_id: "cn-b", amount_cents: 3000 })).error).toBeNull();
    const over = await write(db, { credit_note_id: "cn-b", amount_cents: 1 });
    expect(over.error?.message).toContain("betaald (9000 cent)");
    expect(db.rows("refunds").reduce((sum, row) => sum + Number(row.amount_cents), 0)).toBe(9000);
  });

  it("refuses refunds that together exceed the issued credits, even when more was paid", async () => {
    const db = seedTwoNotes(20000);
    expect((await write(db, { credit_note_id: "cn-a", amount_cents: 6000 })).error).toBeNull();
    expect((await write(db, { credit_note_id: "cn-b", amount_cents: 4000 })).error).toBeNull();
    const over = await write(db, { credit_note_id: "cn-b", amount_cents: 1 });
    expect(over.error?.message).toContain("crediteert (4000 cent)");
    /* Only an issued note counts towards the invoice-wide credit cap. */
    const unfinished = seedTwoNotes(20000);
    Object.assign(unfinished.rows("credit_notes")[1]!, { issued_at: null, document_path: null, document_sha256: null, document_bytes: null, document_generated_at: null });
    expect((await write(unfinished, { credit_note_id: "cn-a", amount_cents: 6000 })).error).toBeNull();
    const onUnfinished = await write(unfinished, { credit_note_id: "cn-b", amount_cents: 1 });
    expect(onUnfinished.error?.message).toContain("nog niet afgerond");
  });

  it("a pending refund reserves its amount; a failed or cancelled one gives it back", async () => {
    const db = seedTwoNotes();
    expect((await write(db, { id: "rf-pending", credit_note_id: "cn-a", amount_cents: 6000, method: "mollie", status: "pending", settled_at: null, payment_id: "pay-1", provider: "mollie", provider_payment_id: "tr_1", provider_refund_id: null })).error).toBeNull();
    expect((await write(db, { credit_note_id: "cn-b", amount_cents: 4000 })).error).toBeNull();
    expect((await write(db, { credit_note_id: "cn-b", amount_cents: 1 })).error?.message).toContain("crediteert");
    /* 100 paid, 100 live refunds: full. The pending one fails at Mollie, and its 60 is free again. */
    expect((await db.from("refunds").update({ status: "failed" }).eq("id", "rf-pending")).error).toBeNull();
    expect((await write(db, { credit_note_id: "cn-a", amount_cents: 6000 })).error).toBeNull();
    expect(ledger(db).notes.map((entry) => [entry.creditNoteId, entry.refundedCents, entry.remainingCents])).toEqual([["cn-a", 6000, 0], ["cn-b", 4000, 0]]);
    /* Reviving a failed refund is checked again. */
    const revived = (await db.from("refunds").update({ status: "pending" }).eq("id", "rf-pending")) as { error: { message: string } | null };
    expect(revived.error?.message).toContain("crediteert");
  });

  it("two refunds at the same moment: both read a clean ledger, the database lets only one through", async () => {
    /*
      Two manual refunds of the full note, submitted together: each reads
      the ledger before the other has written, so the application refuses
      neither. The cap in the database -- no in-flight index applies to a
      manual refund -- refuses the second.
    */
    const db = seedTwoNotes();
    const [a, b] = await Promise.all([
      markManualRefund(db as unknown as Db, "cn-a", { amountCents: 6000, settledOn: "2026-10-11", note: "" }, admin),
      markManualRefund(db as unknown as Db, "cn-a", { amountCents: 6000, settledOn: "2026-10-11", note: "" }, admin),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect([a, b].find((result) => !result.ok)).toMatchObject({ ok: false, reason: expect.stringContaining("crediteert (6000 cent)") });
    expect(db.rows("refunds")).toHaveLength(1);

    /* The same, invoice-wide: two notes, paid 9000, each refund alone fits its note. */
    const wide = seedTwoNotes(9000);
    const [c, d] = await Promise.all([
      write(wide, { credit_note_id: "cn-a", amount_cents: 6000 }),
      write(wide, { credit_note_id: "cn-b", amount_cents: 4000 }),
    ]);
    expect([c.error, d.error].filter((error) => error === null)).toHaveLength(1);
    expect([c.error, d.error].find((error): error is { message: string } => Boolean(error))?.message).toContain("betaald (9000 cent)");
    expect(wide.rows("refunds").reduce((sum, row) => sum + Number(row.amount_cents), 0)).toBeLessThanOrEqual(9000);
  });
});
