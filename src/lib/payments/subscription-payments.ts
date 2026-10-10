import type { MolliePayment } from "@/lib/mollie/client";
import { periodForCharge } from "@/lib/payments/billing-period";

/**
 * Reading what Mollie has already created for a subscription.
 *
 * Mollie does not document how far ahead of a collection date it creates a
 * subscription payment. So before the lifecycle flows change a subscription
 * -- a new amount, a cancellation -- they list its payments and look, rather
 * than assume. Pure helpers over that listing; the client fetches it.
 *
 * A payment is placed on the service's calendar by one field only:
 * `details.dueDate`, documented for SEPA direct debit as the "Estimated
 * date the payment is debited from the customer's bank account". The day the
 * payment object was created says nothing about the period it pays for --
 * Mollie may create it days before -- so `createdAt` is never used for that.
 * A payment that can still move money and has no due date has an unknown
 * period, and every flow that depends on the period stops and says so.
 */

/** Statuses after which a payment will never move money. */
const finalWithoutMoney: readonly MolliePayment["status"][] = ["canceled", "expired", "failed"];

/** A payment that moved, or may still move, money. */
export function isLivePayment(payment: Pick<MolliePayment, "status">): boolean {
  return !finalWithoutMoney.includes(payment.status);
}

/** A payment Mollie may still collect and has not yet. */
export function isOpenPayment(payment: Pick<MolliePayment, "status">): boolean {
  return payment.status === "open" || payment.status === "pending" || payment.status === "authorized";
}

/** The day a subscription payment collects, as Mollie reports it; nothing else counts. */
export function paymentChargeDate(payment: Pick<MolliePayment, "details">): string | undefined {
  const due = payment.details?.dueDate;
  return typeof due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : undefined;
}

export type PlacedPayment = { payment: MolliePayment; chargeDate: string; periodStart: string };

export type PlacedPayments = {
  /** Live payments with a due date, each on its period. */
  placed: PlacedPayment[];
  /**
   * Live payments without a due date: still able to move money, for a
   * period nobody can name. Their presence blocks every decision that
   * depends on which periods Mollie has created payments for.
   */
  unknown: MolliePayment[];
};

/** Every live payment of the listing, placed on the calendar from `anchor` -- or set aside as unknown. */
export function placePayments(anchor: string, payments: readonly MolliePayment[]): PlacedPayments {
  const placed: PlacedPayment[] = [];
  const unknown: MolliePayment[] = [];
  for (const payment of payments) {
    if (!isLivePayment(payment)) continue;
    const chargeDate = paymentChargeDate(payment);
    if (!chargeDate) {
      unknown.push(payment);
      continue;
    }
    placed.push({ payment, chargeDate, periodStart: periodForCharge(anchor, chargeDate).start });
  }
  return { placed, unknown };
}

/** The live payment Mollie created for the period starting on `periodStart`, if any. */
export function paymentForPeriod(anchor: string, payments: readonly MolliePayment[], periodStart: string): PlacedPayment | undefined {
  return placePayments(anchor, payments).placed.find((placed) => placed.periodStart === periodStart);
}

/** Live payments for periods that start after the service's last day. */
export function paymentsAfter(anchor: string, payments: readonly MolliePayment[], endsOn: string): PlacedPayment[] {
  return placePayments(anchor, payments).placed.filter((placed) => placed.periodStart > endsOn);
}

/** Live payments whose period cannot be known. */
export function unknownPayments(payments: readonly MolliePayment[]): MolliePayment[] {
  return payments.filter((payment) => isLivePayment(payment) && !paymentChargeDate(payment));
}

/** The marker every unknown-period problem starts with, so a later run can tell its own message apart. */
export const unknownPeriodMarker = "Mollie heeft een lopende incasso zonder incassodatum";

/**
 * For the log and the admin: which payments, in which state, created when.
 * The creation day is audit information here and nothing more.
 */
export function describeUnknownPayments(payments: readonly MolliePayment[]): string {
  const list = payments
    .map((payment) => `${payment.id} (${payment.status}, EUR ${payment.amount.value}, aangemaakt ${payment.createdAt?.slice(0, 10) ?? "onbekend"})`)
    .join(", ");
  return `${unknownPeriodMarker}: ${list}. De periode ervan is niet te bepalen; er wordt niets gewijzigd totdat die incasso is afgerond of in Mollie is opgehelderd.`;
}
