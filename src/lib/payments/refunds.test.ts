import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoiceRowFixture, refundTrigger } from "@/lib/admin/credit-notes/test-support";
import { MollieError, type MolliePayment, type MollieRefund } from "@/lib/mollie/client";
import { createFakeDb } from "@/lib/payments/fixtures";

/**
 * Money back through Mollie, exactly once per decision, whatever happens in
 * between: a double click, a lost answer, a retry the next day.
 *
 * Alfa paid invoice YM-F-2026-000001 (EUR 121) through Mollie payment tr_1;
 * credit note YM-C-2026-000001 credits half of it, EUR 60,50.
 */
const getPayment = vi.fn();
const createRefund = vi.fn();
const getRefund = vi.fn();
const listPaymentRefunds = vi.fn();

vi.mock("@/lib/mollie/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mollie/client")>()),
  getPayment: (...args: unknown[]) => getPayment(...args),
  createRefund: (...args: unknown[]) => createRefund(...args),
  getRefund: (...args: unknown[]) => getRefund(...args),
  listPaymentRefunds: (...args: unknown[]) => listPaymentRefunds(...args),
}));

const { markManualRefund, recoverClaimedRefunds, refreshRefund, refundInProgressReason, refundViaMollie, syncRefundsForPayment } = await import("@/lib/payments/refunds");
const { invoiceLedger } = await import("@/lib/admin/credit-notes/settlement");
const { creditNoteFromRow, refundFromRow } = await import("@/lib/admin/credit-notes/mapper");
const { invoiceFromRow } = await import("@/lib/admin/invoices/mapper");
const { paymentFromRow } = await import("@/lib/payments/mapper");

type Db = Parameters<typeof refundViaMollie>[0];
const admin = { userId: "admin-1" };

function creditNoteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cn-1",
    customer_id: "cust-1",
    invoice_id: "inv-1",
    number_value: "YM-C-2026-000001",
    number_provisional: false,
    status: "issued",
    reason: "Korting achteraf",
    issue_date: "2026-10-10",
    source: "manual",
    recurring_service_id: null,
    customer_company_name: "Alfa BV",
    customer_contact_name: "A. Alfa",
    customer_email: "a@example.com",
    customer_street: "Straat 1",
    customer_postal_code: "1011 AA",
    customer_city: "Amsterdam",
    customer_country: "Nederland",
    customer_kvk_number: null,
    customer_vat_number: null,
    subtotal_cents: 5000,
    vat_cents: 1050,
    total_cents: 6050,
    currency: "EUR",
    finalizing_at: "2026-10-10T10:00:01.000Z",
    issued_at: "2026-10-10T10:00:02.000Z",
    document_path: "2026/YM-C-2026-000001-x.pdf",
    document_sha256: "b".repeat(64),
    document_bytes: 10,
    document_generated_at: "2026-10-10T10:00:02.000Z",
    sent_at: null,
    recipient_email: null,
    created_by: null,
    created_at: "2026-10-10T10:00:00.000Z",
    updated_at: "2026-10-10T10:00:00.000Z",
    ...overrides,
  };
}

const paymentRow = (overrides: Record<string, unknown> = {}) => ({
  id: "pay-1",
  invoice_id: "inv-1",
  customer_id: "cust-1",
  amount_cents: 12100,
  currency: "EUR",
  status: "paid",
  source: "mollie",
  provider_payment_id: "tr_1",
  method: "ideal",
  paid_at: "2026-09-02T10:00:00.000Z",
  description: "Factuur",
  created_at: "2026-09-02T10:00:00.000Z",
  updated_at: "2026-09-02T10:00:00.000Z",
  ...overrides,
});

function seed(options: { payments?: Record<string, unknown>[]; refunds?: Record<string, unknown>[]; notes?: Record<string, unknown>[] } = {}) {
  const { invoice, lines } = invoiceRowFixture();
  return createFakeDb({
    invoices: [invoice],
    invoice_lines: lines,
    payments: options.payments ?? [paymentRow()],
    credit_notes: options.notes ?? [creditNoteRow()],
    credit_note_lines: [{ id: "c1", credit_note_id: "cn-1", position: 0, description: "50%", quantity_hundredths: 100, unit_price_cents: 5000, vat_rate: 21 }],
    refunds: options.refunds ?? [],
  }, { trigger: refundTrigger });
}

const molliePayment = (overrides: Partial<MolliePayment> = {}): MolliePayment => ({
  id: "tr_1",
  status: "paid",
  amount: { currency: "EUR", value: "121.00" },
  description: "Factuur",
  method: "ideal",
  amountRefunded: { currency: "EUR", value: "0.00" },
  amountRemaining: { currency: "EUR", value: "121.00" },
  ...overrides,
});

const mollieRefund = (overrides: Partial<MollieRefund> = {}): MollieRefund => ({
  id: "re_1",
  paymentId: "tr_1",
  status: "pending",
  amount: { currency: "EUR", value: "60.50" },
  metadata: null,
  ...overrides,
});

let db: ReturnType<typeof seed>;
let atMollie: MollieRefund[];

function ledgerOf(database: ReturnType<typeof seed>) {
  return invoiceLedger({
    invoice: invoiceFromRow({ ...database.rows("invoices")[0], invoice_lines: database.rows("invoice_lines"), credit_notes: database.rows("credit_notes") } as never),
    payments: database.rows("payments").map((row) => paymentFromRow(row as never)),
    creditNotes: database.rows("credit_notes").map((row) => creditNoteFromRow({ ...row, credit_note_lines: database.rows("credit_note_lines") } as never)),
    refunds: database.rows("refunds").map((row) => refundFromRow(row as never)),
  }).notes[0]!;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MOLLIE_API_KEY = "test_dummy";
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  db = seed();
  atMollie = [];
  getPayment.mockImplementation(async () => molliePayment());
  listPaymentRefunds.mockImplementation(async () => atMollie);
  createRefund.mockImplementation(async (input: { amountCents: number; metadata: Record<string, string> }) => {
    const refund = mollieRefund({ id: `re_${atMollie.length + 1}`, amount: { currency: "EUR", value: (input.amountCents / 100).toFixed(2) }, metadata: input.metadata });
    atMollie.push(refund);
    return refund;
  });
  getRefund.mockImplementation(async (_payment: string, id: string) => atMollie.find((refund) => refund.id === id));
});

describe("refunding through Mollie", () => {
  it("refunds a refundable payment in full: one claim, one Mollie call with our key, one row with Mollie's id", async () => {
    const result = await refundViaMollie(db as unknown as Db, "cn-1", 6050, admin);
    expect(result).toMatchObject({ ok: true, refund: { amountCents: 6050, method: "mollie", status: "pending", providerRefundId: "re_1", providerPaymentId: "tr_1" } });
    expect(createRefund).toHaveBeenCalledTimes(1);
    const call = createRefund.mock.calls[0]![0] as { idempotencyKey: string; metadata: Record<string, string>; paymentId: string; amountCents: number };
    expect(call).toMatchObject({ paymentId: "tr_1", amountCents: 6050 });
    expect(call.idempotencyKey).toBe(`refund-${call.metadata.refundId}`);
    expect(db.rows("refunds")).toHaveLength(1);
    expect(db.rows("refunds")[0]).toMatchObject({ claimed_at: null, provider_refund_id: "re_1" });
    expect(ledgerOf(db)).toMatchObject({ inFlightCents: 6050, remainingCents: 0, state: "in_progress" });
  });

  it("takes several partial refunds up to the credit, and refuses the cent beyond it", async () => {
    expect((await refundViaMollie(db as unknown as Db, "cn-1", 3000, admin)).ok).toBe(true);
    atMollie[0]!.status = "refunded";
    expect((await refundViaMollie(db as unknown as Db, "cn-1", 3050, admin)).ok).toBe(true);
    atMollie[1]!.status = "refunded";
    await syncRefundsForPayment(db as unknown as Db, "tr_1");
    expect(ledgerOf(db)).toMatchObject({ refundedCents: 6050, remainingCents: 0, state: "processed" });

    const beyond = await refundViaMollie(db as unknown as Db, "cn-1", 1, admin);
    expect(beyond).toMatchObject({ ok: false, reason: expect.stringContaining("niets (meer)") });
    expect(createRefund).toHaveBeenCalledTimes(2);

    const fresh = seed();
    expect(await refundViaMollie(fresh as unknown as Db, "cn-1", 6051, admin)).toMatchObject({ ok: false, reason: expect.stringContaining("Nog terug te betalen is") });
    expect(fresh.rows("refunds")).toHaveLength(0);
  });

  it("makes one refund of a double click: the second finds the first in flight", async () => {
    const [first, second] = await Promise.all([
      refundViaMollie(db as unknown as Db, "cn-1", 6050, admin),
      refundViaMollie(db as unknown as Db, "cn-1", 6050, admin),
    ]);
    const outcomes = [first, second].map((result) => result.ok);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect([first, second].find((result) => !result.ok)).toMatchObject({ ok: false, reason: refundInProgressReason });
    expect(createRefund).toHaveBeenCalledTimes(1);
    expect(db.rows("refunds")).toHaveLength(1);
  });

  it("recovers a refund Mollie made whose answer was never written: adopted on retry, never made twice", async () => {
    /* Mollie made re_1 for our claim; the process died before the row got its id. */
    db = seed({ refunds: [{ id: "rf-claim", credit_note_id: "cn-1", invoice_id: "inv-1", customer_id: "cust-1", amount_cents: 6050, currency: "EUR", method: "mollie", status: "pending", payment_id: "pay-1", provider: "mollie", provider_payment_id: "tr_1", provider_refund_id: null, idempotency_key: "refund-rf-claim", claimed_at: "2026-10-11T09:00:00.000Z", settled_at: null, settled_by: null, note: "", failure_reason: null, created_by: "admin-1", created_at: "2026-10-11T09:00:00.000Z", updated_at: "2026-10-11T09:00:00.000Z" }] });
    atMollie = [mollieRefund({ id: "re_lost", status: "refunded", metadata: { refundId: "rf-claim" } })];

    const retry = await refundViaMollie(db as unknown as Db, "cn-1", 6050, admin, new Date("2026-10-11T09:30:00.000Z"));
    expect(retry).toMatchObject({ ok: false, reason: expect.stringContaining("niets (meer)") });
    expect(createRefund).not.toHaveBeenCalled();
    expect(db.rows("refunds")).toHaveLength(1);
    expect(db.rows("refunds")[0]).toMatchObject({ provider_refund_id: "re_lost", status: "refunded", claimed_at: null });
    expect(ledgerOf(db)).toMatchObject({ refundedCents: 6050, state: "processed" });
  });

  it("waits on a fresh claim Mollie does not list yet, and closes a stale one Mollie never made", async () => {
    const claim = { id: "rf-claim", credit_note_id: "cn-1", invoice_id: "inv-1", customer_id: "cust-1", amount_cents: 6050, currency: "EUR", method: "mollie", status: "pending", payment_id: "pay-1", provider: "mollie", provider_payment_id: "tr_1", provider_refund_id: null, idempotency_key: "refund-rf-claim", claimed_at: "2026-10-11T09:00:00.000Z", settled_at: null, settled_by: null, note: "", failure_reason: null, created_by: "admin-1", created_at: "2026-10-11T09:00:00.000Z", updated_at: "2026-10-11T09:00:00.000Z" };
    db = seed({ refunds: [claim] });
    const soon = await refundViaMollie(db as unknown as Db, "cn-1", 6050, admin, new Date("2026-10-11T09:02:00.000Z"));
    expect(soon).toMatchObject({ ok: false, reason: refundInProgressReason });
    expect(createRefund).not.toHaveBeenCalled();

    const later = await recoverClaimedRefunds(db as unknown as Db, "cn-1", new Date("2026-10-11T09:30:00.000Z"), { apiKey: "test_dummy", mode: "test" } as never);
    expect(later).toEqual({ recovered: [], waiting: false });
    expect(db.rows("refunds")[0]).toMatchObject({ status: "canceled", failure_reason: expect.stringContaining("Afgebroken") });
    expect(ledgerOf(db)).toMatchObject({ remainingCents: 6050, state: "refund_due" });

    const again = await refundViaMollie(db as unknown as Db, "cn-1", 6050, admin, new Date("2026-10-11T09:31:00.000Z"));
    expect(again.ok).toBe(true);
    expect(createRefund).toHaveBeenCalledTimes(1);
  });

  it("writes a refusal from Mollie as failed and shows it as such, never as money returned", async () => {
    createRefund.mockRejectedValueOnce(new MollieError(422, "The amount is higher than the remaining amount"));
    const result = await refundViaMollie(db as unknown as Db, "cn-1", 6050, admin);
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining("weigerde") });
    expect(db.rows("refunds")[0]).toMatchObject({ status: "failed", claimed_at: null, provider_refund_id: null });
    expect(ledgerOf(db)).toMatchObject({ refundedCents: 0, remainingCents: 6050, lastRefundFailed: true, state: "refund_due" });
    // A refund Mollie later reports as failed ends the same way.
    const retried = await refundViaMollie(db as unknown as Db, "cn-1", 6050, admin);
    expect(retried.ok).toBe(true);
    atMollie[0]!.status = "failed";
    await syncRefundsForPayment(db as unknown as Db, "tr_1");
    expect(ledgerOf(db)).toMatchObject({ refundedCents: 0, lastRefundFailed: true, state: "refund_due" });
  });

  it("refuses a payment Mollie will not refund, and an invoice not paid through Mollie", async () => {
    getPayment.mockResolvedValueOnce(molliePayment({ amountRemaining: { currency: "EUR", value: "10.00" } }));
    expect(await refundViaMollie(db as unknown as Db, "cn-1", 6050, admin)).toMatchObject({ ok: false, reason: expect.stringContaining("Mollie laat dit bedrag niet terugbetalen") });
    getPayment.mockResolvedValueOnce(molliePayment({ amountRemaining: null, amountRefunded: null }));
    expect(await refundViaMollie(db as unknown as Db, "cn-1", 100, admin)).toMatchObject({ ok: false, reason: expect.stringContaining("niet (meer) terug te betalen via Mollie") });
    expect(createRefund).not.toHaveBeenCalled();

    const bank = seed({ payments: [paymentRow({ source: "manual_bank_transfer", provider_payment_id: null })] });
    expect(await refundViaMollie(bank as unknown as Db, "cn-1", 6050, admin)).toMatchObject({ ok: false, reason: expect.stringContaining("niet via Mollie betaald") });
  });

  it("refuses when the invoice was not paid at all: nothing to refund, the credit offsets", async () => {
    const unpaid = seed({ payments: [] });
    expect(await refundViaMollie(unpaid as unknown as Db, "cn-1", 6050, admin)).toMatchObject({ ok: false, reason: expect.stringContaining("niets (meer)") });
    expect(await markManualRefund(unpaid as unknown as Db, "cn-1", { amountCents: 100, settledOn: "2026-10-11", note: "" }, admin)).toMatchObject({ ok: false });
  });

  it("cannot refund another customer's money: the refund carries the note's own customer and invoice", async () => {
    const result = await refundViaMollie(db as unknown as Db, "cn-1", 6050, admin);
    expect(result.ok && result.refund).toMatchObject({ customerId: "cust-1", invoiceId: "inv-1", creditNoteId: "cn-1" });
    expect(await refundViaMollie(db as unknown as Db, "cn-other", 100, admin)).toMatchObject({ ok: false, reason: "Deze creditnota bestaat niet (meer)." });
  });

  it("keeps the claim when Mollie gives no answer at all, for recovery rather than a second attempt", async () => {
    createRefund.mockRejectedValueOnce(new TypeError("fetch failed"));
    const result = await refundViaMollie(db as unknown as Db, "cn-1", 6050, admin);
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining("gaf geen antwoord") });
    expect(db.rows("refunds")[0]).toMatchObject({ status: "pending", provider_refund_id: null });
    expect(db.rows("refunds")[0]!.claimed_at).toBeTruthy();
  });

  it("checks a refund's status at Mollie and settles it when refunded", async () => {
    const made = await refundViaMollie(db as unknown as Db, "cn-1", 6050, admin);
    if (!made.ok) throw new Error(made.reason);
    atMollie[0]!.status = "refunded";
    const refreshed = await refreshRefund(db as unknown as Db, made.refund.id);
    expect(refreshed.ok && refreshed.refund).toMatchObject({ status: "refunded" });
    expect(db.rows("refunds")[0]!.settled_at).toBeTruthy();
    expect(ledgerOf(db)).toMatchObject({ refundedCents: 6050, remainingCents: 0, state: "processed" });
  });
});

describe("a manual refund", () => {
  it("records a bank transfer as refunded, settled by the admin, and never calls Mollie", async () => {
    const result = await markManualRefund(db as unknown as Db, "cn-1", { amountCents: 3000, settledOn: "2026-10-11", note: "Rabo ref 123" }, admin);
    expect(result.ok && result.refund).toMatchObject({ method: "manual", status: "refunded", amountCents: 3000, settledBy: "admin-1", note: "Rabo ref 123" });
    expect(createRefund).not.toHaveBeenCalled();
    expect(ledgerOf(db)).toMatchObject({ refundedCents: 3000, remainingCents: 3050, state: "refund_due" });

    const rest = await markManualRefund(db as unknown as Db, "cn-1", { amountCents: 3050, settledOn: "2026-10-12", note: "" }, admin);
    expect(rest.ok).toBe(true);
    expect(ledgerOf(db)).toMatchObject({ refundedCents: 6050, remainingCents: 0, state: "processed" });
    expect(await markManualRefund(db as unknown as Db, "cn-1", { amountCents: 1, settledOn: "2026-10-12", note: "" }, admin)).toMatchObject({ ok: false });
  });
});
