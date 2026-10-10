import { isFinanciallyIssued, isLiveRefund, isSettledRefund, type CreditNote, type Refund } from "@/lib/admin/credit-notes/types";
import { invoiceAmounts, type Invoice } from "@/lib/admin/invoices/types";
import type { Cents } from "@/lib/money";
import { isSuccessful, type Payment } from "@/lib/payments/types";

/**
 * Where an invoice and its credit notes stand, money-wise. Pure, and the
 * single reading of these figures: the payments page, the invoice page, the
 * credit note page and the customer's summary all call this with the same
 * four inputs and therefore say the same thing.
 *
 * The rule, in one place:
 *
 *   due        = invoice total - every issued credit note
 *   outstanding = max(0, due - paid)            still to be collected
 *   overpaid    = max(0, paid - due)            owed back to the customer
 *
 * Overpayment is what the refunds have to return. It is attributed to the
 * credit notes in the order they were issued: the first note is refunded
 * before the second, and a note against an invoice that was never paid has
 * nothing to refund -- it is settled by lowering what is owed. So a credit
 * note is in one of four states, and none of them is a column:
 *
 *   offset       nothing to refund; the invoice simply owes less;
 *   refund_due   money has to go back and not all of it has;
 *   in_progress  the rest is on its way at Mollie;
 *   processed    every cent that had to go back, went back.
 */
export type CreditNoteState = "offset" | "refund_due" | "in_progress" | "processed";

export const creditNoteStateLabels: Record<CreditNoteState, string> = {
  offset: "Verrekend",
  refund_due: "Nog terug te betalen",
  in_progress: "Terugbetaling loopt",
  processed: "Volledig verwerkt",
};

export const creditNoteStateTone: Record<CreditNoteState, "neutral" | "accent" | "success" | "danger"> = {
  offset: "success",
  refund_due: "accent",
  in_progress: "accent",
  processed: "success",
};

export type CreditNoteLedger = {
  creditNoteId: string;
  totalCents: Cents;
  /** What of this note has to go back to the customer, given what was paid. */
  refundDueCents: Cents;
  /** Returned, status refunded. */
  refundedCents: Cents;
  /** At Mollie, not final yet. */
  inFlightCents: Cents;
  /** Still to be refunded: due minus returned minus on its way. */
  remainingCents: Cents;
  /** Has a refund that ended in failure and nothing later made good. */
  lastRefundFailed: boolean;
  state: CreditNoteState;
};

export type InvoiceLedger = {
  totalCents: Cents;
  creditedCents: Cents;
  dueCents: Cents;
  paidCents: Cents;
  outstandingCents: Cents;
  overpaidCents: Cents;
  refundedCents: Cents;
  refundInFlightCents: Cents;
  /** Across the invoice: what still has to go back. */
  refundDueCents: Cents;
  notes: CreditNoteLedger[];
};

/** Issue order: the date on the document, then the moment it was created. */
export function byIssueOrder(a: Pick<CreditNote, "issueDate" | "createdAt">, b: Pick<CreditNote, "issueDate" | "createdAt">): number {
  return a.issueDate.localeCompare(b.issueDate) || a.createdAt.localeCompare(b.createdAt);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function invoiceLedger(input: {
  invoice: Pick<Invoice, "lines" | "creditedCents">;
  payments: readonly Payment[];
  creditNotes: readonly CreditNote[];
  refunds: readonly Refund[];
}): InvoiceLedger {
  const { totalCents } = invoiceAmounts({ lines: input.invoice.lines });
  /* Only issued notes correct anything; one whose issue did not finish has a number but no document yet. */
  const notes = input.creditNotes.filter(isFinanciallyIssued).sort(byIssueOrder);
  const creditedCents = notes.reduce((sum, note) => sum + note.totalCents, 0);
  const dueCents = Math.max(0, totalCents - creditedCents);
  const paidCents = input.payments.filter(isSuccessful).reduce((sum, payment) => sum + payment.amountCents, 0);
  const outstandingCents = Math.max(0, dueCents - paidCents);
  const overpaidCents = Math.max(0, paidCents - dueCents);

  let attributed = 0;
  const ledgers = notes.map((note): CreditNoteLedger => {
    const refundDueCents = clamp(overpaidCents - attributed, 0, note.totalCents);
    attributed += note.totalCents;
    const own = input.refunds.filter((refund) => refund.creditNoteId === note.id);
    const live = own.filter(isLiveRefund);
    const refundedCents = live.filter(isSettledRefund).reduce((sum, refund) => sum + refund.amountCents, 0);
    const inFlightCents = live.filter((refund) => !isSettledRefund(refund)).reduce((sum, refund) => sum + refund.amountCents, 0);
    const remainingCents = Math.max(0, refundDueCents - refundedCents - inFlightCents);
    const last = [...own].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
    const lastRefundFailed = Boolean(last && last.status === "failed");
    const state: CreditNoteState =
      refundDueCents === 0 ? "offset" : remainingCents > 0 ? "refund_due" : inFlightCents > 0 ? "in_progress" : "processed";
    return { creditNoteId: note.id, totalCents: note.totalCents, refundDueCents, refundedCents, inFlightCents, remainingCents, lastRefundFailed, state };
  });

  const refundedCents = ledgers.reduce((sum, ledger) => sum + ledger.refundedCents, 0);
  const refundInFlightCents = ledgers.reduce((sum, ledger) => sum + ledger.inFlightCents, 0);
  return {
    totalCents,
    creditedCents,
    dueCents,
    paidCents,
    outstandingCents,
    overpaidCents,
    refundedCents,
    refundInFlightCents,
    refundDueCents: Math.max(0, overpaidCents - refundedCents - refundInFlightCents),
    notes: ledgers,
  };
}

/** The ledger of one credit note, out of its invoice's. */
export function creditNoteLedger(
  note: CreditNote,
  input: { invoice: Pick<Invoice, "lines" | "creditedCents">; payments: readonly Payment[]; creditNotes: readonly CreditNote[]; refunds: readonly Refund[] },
): CreditNoteLedger {
  const found = invoiceLedger(input).notes.find((ledger) => ledger.creditNoteId === note.id);
  if (found) return found;
  /* Not issued yet: nothing is owed back on a note that is not a document. */
  return { creditNoteId: note.id, totalCents: note.totalCents, refundDueCents: 0, refundedCents: 0, inFlightCents: 0, remainingCents: 0, lastRefundFailed: false, state: "offset" };
}

/** True when nothing is left to do on the money side. */
export function isCreditNoteProcessed(ledger: Pick<CreditNoteLedger, "state">): boolean {
  return ledger.state === "offset" || ledger.state === "processed";
}
