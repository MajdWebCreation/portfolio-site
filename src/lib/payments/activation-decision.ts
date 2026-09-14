import type { InvoiceActivation } from "@/lib/admin/documents/types";
import type { Invoice } from "@/lib/admin/invoices/types";
import { recurringChargeCents, type RecurringService } from "@/lib/payments/types";

/**
 * One-off or first: what kind of payment an invoice should ask for.
 *
 * A payment with `sequenceType: "first"` does two things at once -- it
 * collects the invoice and it establishes a mandate for later collections.
 * That is worth asking of a customer exactly once, and only when there is
 * something to authorise:
 *
 *   oneoff   the ordinary case. No service hangs off this invoice, or the
 *            service is already switched on, or the customer has already
 *            given a mandate we can use. Asking again would be asking for
 *            permission we already have.
 *
 *   first    this invoice is meant to switch on a service, that service has
 *            no subscription yet, and there is no usable mandate. The customer
 *            pays and authorises in one step.
 *
 * The amount is the invoice's own gross total in both cases. The monthly
 * price is never added: it is collected later, by the subscription.
 */
export type PaymentSequence = "oneoff" | "first";

export type SequenceDecision = {
  sequence: PaymentSequence;
  /** The service this invoice switches on, when it does. */
  service?: RecurringService;
  /**
   * Why, in one word, for the log line and the admin. Never shown to a
   * customer.
   */
  reason:
    | "no-recurring-service"
    | "already-subscribed"
    | "mandate-already-given"
    | "needs-mandate";
};

export function decidePaymentSequence(input: {
  invoice: Pick<Invoice, "id">;
  /** The service whose `activationInvoiceId` is this invoice, if any. */
  service?: RecurringService;
  /** Whether the customer already has a mandate that may be collected against. */
  hasUsableMandate: boolean;
}): SequenceDecision {
  const { service, hasUsableMandate } = input;

  if (!service) return { sequence: "oneoff", reason: "no-recurring-service" };
  if (service.mollie.subscriptionId) return { sequence: "oneoff", service, reason: "already-subscribed" };
  if (hasUsableMandate) return { sequence: "oneoff", service, reason: "mandate-already-given" };

  return { sequence: "first", service, reason: "needs-mandate" };
}

/**
 * What the admin sees about switching a service on, without a word of Mollie
 * in it. `subscription` means money will be collected monthly from here on.
 */
export type ActivationStatus =
  | "not_applicable"
  | "awaiting_first_payment"
  | "mandate_active"
  | "subscription_active"
  | "problem";

export function activationStatus(input: {
  service?: RecurringService;
  hasUsableMandate: boolean;
  /** Whether the invoice meant to establish the mandate has been paid. */
  activationInvoicePaid?: boolean;
}): ActivationStatus {
  const { service, hasUsableMandate, activationInvoicePaid } = input;

  if (!service) return "not_applicable";
  if (service.status === "canceled") return "problem";
  if (service.mollie.subscriptionId) return "subscription_active";
  if (hasUsableMandate) return "mandate_active";
  /*
    Paid but still no mandate is the case worth flagging: the money arrived and
    the authorisation did not, so nothing will be collected next month.
  */
  if (activationInvoicePaid) return "problem";
  return "awaiting_first_payment";
}

export const activationStatusLabels: Record<ActivationStatus, string> = {
  not_applicable: "Geen maandelijkse service",
  awaiting_first_payment: "Wacht op eerste betaling",
  mandate_active: "Machtiging actief",
  subscription_active: "Abonnement actief",
  problem: "Probleem",
};

export const activationStatusTone: Record<ActivationStatus, "neutral" | "accent" | "success" | "danger"> = {
  not_applicable: "neutral",
  awaiting_first_payment: "accent",
  mandate_active: "accent",
  subscription_active: "success",
  problem: "danger",
};

/**
 * The activation note a document may carry, from what the admin screen knows.
 *
 * The send flow derives the same three figures from the payment link it just
 * made, which is the authoritative moment. This is the screen's version of
 * that question, and it is deliberately the same rule: the note only appears
 * while paying this invoice is still what establishes the mandate. A customer
 * who already authorised us gets an ordinary invoice, and the preview has to
 * show that ordinary invoice rather than a promise that will not be made.
 */
export function documentActivation(input: {
  service?: RecurringService;
  status: ActivationStatus;
}): InvoiceActivation | undefined {
  const { service, status } = input;
  if (!service?.startsOn || status !== "awaiting_first_payment") return undefined;
  return {
    serviceName: service.name,
    monthlyGrossCents: recurringChargeCents(service),
    firstDebitOn: service.startsOn,
  };
}
