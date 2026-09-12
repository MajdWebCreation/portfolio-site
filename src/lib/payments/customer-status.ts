import type { Cents } from "@/lib/money";
import { calculateTotals } from "@/lib/money";
import type { Invoice } from "@/lib/admin/invoices/types";
import { settleInvoice } from "@/lib/payments/settlement";
import type { Payment } from "@/lib/payments/types";

/**
 * How a customer stands financially, derived every time it is asked.
 *
 * Deliberately not a column on `customers`: a stored status would be a second
 * source of truth that can disagree with the invoices and payments it claims
 * to summarise. The invoices and the money are the truth; this reads them.
 *
 * Which invoices count: `sent` and `overdue` are outstanding, `paid` is done,
 * and `draft` and `cancelled` are nothing at all -- a concept has not been
 * charged and a cancelled invoice is not owed. That reuses the existing
 * invoice statuses rather than inventing a parallel set.
 */
export type CustomerPaymentStatus = "up_to_date" | "open" | "overdue" | "payment_failed";

export const customerPaymentStatusLabels: Record<CustomerPaymentStatus, string> = {
  up_to_date: "Bij",
  open: "Openstaand",
  overdue: "Achterstallig",
  payment_failed: "Betaling mislukt",
};

export const customerPaymentStatusTone: Record<CustomerPaymentStatus, "neutral" | "accent" | "success" | "danger"> = {
  up_to_date: "success",
  open: "accent",
  overdue: "danger",
  payment_failed: "danger",
};

export type CustomerFinancials = {
  status: CustomerPaymentStatus;
  /** Still owed across every unsettled invoice. */
  outstandingCents: Cents;
  /** The part of that which is past its due date. */
  overdueCents: Cents;
  /** How many invoices are not settled. */
  openInvoiceCount: number;
  /** The most recent payment that succeeded, across all invoices. */
  lastSuccessfulPayment?: Payment;
};

/** Invoices that represent a claim on the customer. */
export function isChargeable(invoice: Pick<Invoice, "status">): boolean {
  return invoice.status === "sent" || invoice.status === "overdue" || invoice.status === "paid";
}

export function customerFinancials(
  invoices: readonly Invoice[],
  payments: readonly Payment[],
  todayKey: string,
): CustomerFinancials {
  let outstandingCents = 0;
  let overdueCents = 0;
  let openInvoiceCount = 0;
  let anyFailed = false;
  const successful: Payment[] = [];

  for (const invoice of invoices) {
    if (!isChargeable(invoice)) continue;

    const invoicePayments = payments.filter((payment) => payment.invoiceId === invoice.id);
    const total = calculateTotals(invoice.lines).totalCents;
    const settlement = settleInvoice(total, invoicePayments);

    if (settlement.lastSuccessful) successful.push(settlement.lastSuccessful);

    /*
      A paid invoice owes nothing even when no payment row exists: invoices
      settled before this module existed, or by a bank transfer nobody entered
      yet, are still paid. The status is the document's own word on that.
    */
    if (invoice.status === "paid") continue;

    if (settlement.outstandingCents > 0) {
      outstandingCents += settlement.outstandingCents;
      openInvoiceCount += 1;
      if (invoice.dueDate < todayKey) overdueCents += settlement.outstandingCents;
      if (settlement.failedWithoutRecovery) anyFailed = true;
    }
  }

  const lastSuccessfulPayment = successful
    .sort((a, b) => (a.paidAt ?? a.updatedAt).localeCompare(b.paidAt ?? b.updatedAt))
    .at(-1);

  // A failed attempt is the most actionable thing to say, then lateness, then
  // a plain open balance.
  const status: CustomerPaymentStatus = anyFailed
    ? "payment_failed"
    : overdueCents > 0
      ? "overdue"
      : outstandingCents > 0
        ? "open"
        : "up_to_date";

  return {
    status,
    outstandingCents,
    overdueCents,
    openInvoiceCount,
    ...(lastSuccessfulPayment ? { lastSuccessfulPayment } : {}),
  };
}
