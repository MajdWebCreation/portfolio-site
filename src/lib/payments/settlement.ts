import type { Cents } from "@/lib/money";
import { isInFlight, isSuccessful, type Payment } from "@/lib/payments/types";

/**
 * Whether an invoice has been paid, worked out from the payments against it.
 *
 * The total is handed in rather than computed here: a document's total comes
 * from `calculateTotals` in lib/money and that stays the single implementation
 * of that arithmetic. This module only adds up what arrived.
 *
 * Several payments already add up, so partial payments need no redesign when
 * a UI for them is built later -- and a payment recorded by hand counts the
 * same as one from a provider, because only `status` is consulted, not
 * `source`.
 */
export type Settlement = {
  /** Sum of successful payments. */
  paidCents: Cents;
  /** What is still owed; never negative. */
  outstandingCents: Cents;
  /** Paid in full, so the invoice may be marked paid. */
  settled: boolean;
  /** An attempt is still running, so the outcome is not final yet. */
  inFlight: boolean;
  /** The most recent successful payment, when there is one. */
  lastSuccessful?: Payment;
  /**
   * A failed attempt that nothing later made good: the last word on this
   * invoice is a failure the admin should see.
   */
  failedWithoutRecovery: boolean;
};

function byTimeAscending(a: Payment, b: Payment): number {
  return (a.paidAt ?? a.updatedAt).localeCompare(b.paidAt ?? b.updatedAt);
}

export function settleInvoice(totalCents: Cents, payments: readonly Payment[]): Settlement {
  const successful = payments.filter(isSuccessful).sort(byTimeAscending);
  const paidCents = successful.reduce((sum, payment) => sum + payment.amountCents, 0);
  const inFlight = payments.some(isInFlight);

  /*
    A failure only matters while nothing has repaired it. A later successful
    payment, or an attempt that is still running, means the failure is history
    and must not overwrite the better news -- which is also why a failed
    webhook arriving after a successful one changes nothing here.
  */
  const lastFailure = payments
    .filter((payment) => payment.status === "failed")
    .sort(byTimeAscending)
    .at(-1);
  const lastSuccessful = successful.at(-1);
  const failedWithoutRecovery =
    Boolean(lastFailure) &&
    !inFlight &&
    paidCents < totalCents &&
    (!lastSuccessful || byTimeAscending(lastSuccessful, lastFailure!) < 0);

  return {
    paidCents,
    outstandingCents: Math.max(0, totalCents - paidCents),
    settled: paidCents >= totalCents,
    inFlight,
    ...(lastSuccessful ? { lastSuccessful } : {}),
    failedWithoutRecovery,
  };
}
