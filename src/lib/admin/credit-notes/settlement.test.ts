import { describe, expect, it } from "vitest";
import { creditNoteLedger, invoiceLedger, isCreditNoteProcessed } from "@/lib/admin/credit-notes/settlement";
import type { CreditNote, Refund } from "@/lib/admin/credit-notes/types";
import { calculateTotals } from "@/lib/money";
import { invoiceFixture, paymentFixture } from "@/lib/payments/fixtures";

/**
 * The one reading of invoice, credit notes, payments and refunds. The
 * example from the specification: EUR 100 excl., EUR 21 VAT, EUR 121 incl.;
 * half of it credited is EUR 50 / 10,50 / 60,50, and the invoice itself
 * stays EUR 121.
 */
const note = (overrides: Partial<CreditNote> = {}): CreditNote => {
  const lines = overrides.lines ?? [{ id: "c1", description: "50% creditering", quantityHundredths: 100, unitPriceCents: 5000, vatRate: 21 }];
  const totals = calculateTotals(lines);
  return {
    id: "cn-1",
    number: { value: "YM-C-2026-000001", provisional: false },
    status: "issued",
    customer: invoiceFixture().customer,
    invoiceId: "inv-1",
    reason: "Korting achteraf",
    issueDate: "2026-10-10",
    source: "manual",
    lines,
    subtotalCents: totals.subtotalCents,
    vatCents: totals.vatCents,
    totalCents: totals.totalCents,
    finalizingAt: "2026-10-10T10:00:01.000Z",
    issuedAt: "2026-10-10T10:00:02.000Z",
    document: { path: "2026/YM-C-2026-000001-x.pdf", sha256: "b".repeat(64), bytes: 10, generatedAt: "2026-10-10T10:00:02.000Z" },
    createdAt: "2026-10-10T10:00:00.000Z",
    updatedAt: "2026-10-10T10:00:00.000Z",
    ...overrides,
  };
};

const refund = (overrides: Partial<Refund> = {}): Refund => ({
  id: "rf-1",
  creditNoteId: "cn-1",
  invoiceId: "inv-1",
  customerId: "cust-1",
  amountCents: 3000,
  method: "mollie",
  status: "refunded",
  idempotencyKey: "refund-rf-1",
  note: "",
  settledAt: "2026-10-11T10:00:00.000Z",
  createdAt: "2026-10-11T09:00:00.000Z",
  updatedAt: "2026-10-11T10:00:00.000Z",
  ...overrides,
});

describe("the invoice ledger", () => {
  it("credits half of a paid invoice: 50,00 excl., 10,50 VAT, 60,50 incl., and the invoice stays 121", () => {
    const half = note();
    expect(half).toMatchObject({ subtotalCents: 5000, vatCents: 1050, totalCents: 6050 });
    const ledger = invoiceLedger({ invoice: invoiceFixture({ creditedCents: 6050 }), payments: [paymentFixture()], creditNotes: [half], refunds: [] });
    expect(ledger).toMatchObject({ totalCents: 12100, creditedCents: 6050, dueCents: 6050, paidCents: 12100, outstandingCents: 0, overpaidCents: 6050, refundDueCents: 6050 });
    expect(ledger.notes[0]).toMatchObject({ refundDueCents: 6050, remainingCents: 6050, state: "refund_due" });
  });

  it("credits a whole invoice in full, and refuses nothing of its own: the cap is the database's and the creator's", () => {
    const full = note({ lines: [{ id: "c1", description: "Volledig", quantityHundredths: 100, unitPriceCents: 10000, vatRate: 21 }] });
    const ledger = invoiceLedger({ invoice: invoiceFixture(), payments: [paymentFixture()], creditNotes: [full], refunds: [] });
    expect(ledger).toMatchObject({ creditedCents: 12100, dueCents: 0, overpaidCents: 12100, refundDueCents: 12100 });
  });

  it("offsets against an unpaid invoice: nothing to refund, less to collect", () => {
    const ledger = invoiceLedger({ invoice: invoiceFixture(), payments: [], creditNotes: [note()], refunds: [] });
    expect(ledger).toMatchObject({ dueCents: 6050, outstandingCents: 6050, overpaidCents: 0, refundDueCents: 0 });
    expect(ledger.notes[0]?.state).toBe("offset");
    expect(isCreditNoteProcessed(ledger.notes[0]!)).toBe(true);
  });

  it("attributes an overpayment to credit notes in issue order", () => {
    const first = note({ id: "cn-1", issueDate: "2026-10-01" });
    const second = note({ id: "cn-2", number: { value: "YM-C-2026-000002", provisional: false }, issueDate: "2026-10-05" });
    // 121 paid, 121 credited in two halves: both fully refundable.
    const both = invoiceLedger({ invoice: invoiceFixture(), payments: [paymentFixture()], creditNotes: [second, first], refunds: [] });
    expect(both.notes.map((entry) => [entry.creditNoteId, entry.refundDueCents])).toEqual([["cn-1", 6050], ["cn-2", 6050]]);
    // 100 paid of 121: due 0, overpaid 100 -> first note 60,50, second 39,50.
    const partly = invoiceLedger({ invoice: invoiceFixture(), payments: [paymentFixture({ amountCents: 10000 })], creditNotes: [first, second], refunds: [] });
    expect(partly.notes.map((entry) => entry.refundDueCents)).toEqual([6050, 3950]);
  });

  it("subtracts refunds: partial, in flight, failed, and processed when everything went back", () => {
    const partial = invoiceLedger({ invoice: invoiceFixture(), payments: [paymentFixture()], creditNotes: [note()], refunds: [refund()] });
    expect(partial.notes[0]).toMatchObject({ refundedCents: 3000, remainingCents: 3050, state: "refund_due" });

    const inFlight = invoiceLedger({ invoice: invoiceFixture(), payments: [paymentFixture()], creditNotes: [note()], refunds: [refund(), refund({ id: "rf-2", amountCents: 3050, status: "pending", settledAt: undefined })] });
    expect(inFlight.notes[0]).toMatchObject({ refundedCents: 3000, inFlightCents: 3050, remainingCents: 0, state: "in_progress" });

    const failed = invoiceLedger({ invoice: invoiceFixture(), payments: [paymentFixture()], creditNotes: [note()], refunds: [refund({ status: "failed", settledAt: undefined })] });
    expect(failed.notes[0]).toMatchObject({ refundedCents: 0, remainingCents: 6050, lastRefundFailed: true, state: "refund_due" });

    const done = invoiceLedger({ invoice: invoiceFixture(), payments: [paymentFixture()], creditNotes: [note()], refunds: [refund(), refund({ id: "rf-2", amountCents: 3050, method: "manual" })] });
    expect(done.notes[0]).toMatchObject({ refundedCents: 6050, remainingCents: 0, state: "processed" });
    expect(isCreditNoteProcessed(done.notes[0]!)).toBe(true);
  });

  it("ignores a credit note whose issue did not finish, and never goes below zero", () => {
    const unfinished = note({ issuedAt: undefined, document: undefined });
    const ledger = invoiceLedger({ invoice: invoiceFixture(), payments: [paymentFixture()], creditNotes: [unfinished], refunds: [] });
    expect(ledger).toMatchObject({ creditedCents: 0, overpaidCents: 0 });
    expect(creditNoteLedger(unfinished, { invoice: invoiceFixture(), payments: [], creditNotes: [unfinished], refunds: [] })).toMatchObject({ state: "offset", remainingCents: 0 });
  });

  it("rounds VAT once per rate, in cents, exactly as the invoice does", () => {
    // 1548 net at 21% -> 325,08 -> 325; total 1873. Never a float total.
    const odd = note({ lines: [{ id: "c1", description: "Pro rata", quantityHundredths: 100, unitPriceCents: 1548, vatRate: 21 }] });
    expect(odd).toMatchObject({ subtotalCents: 1548, vatCents: 325, totalCents: 1873 });
    expect(Number.isInteger(odd.totalCents)).toBe(true);
  });
});
