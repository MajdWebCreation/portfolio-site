import { calculateTotals, type Cents } from "@/lib/money";

/**
 * Three separate ideas, deliberately not merged:
 *
 *   Invoice           what YM Creations charges. The document of record.
 *   Payment           money that actually moved.
 *   RecurringService  a periodic service, billed monthly.
 *
 * A provider such as Mollie moves the money; it is not the domain. `source`
 * says where a payment came from, so a bank transfer entered by hand later is
 * this same shape with `source: "manual_bank_transfer"` and no provider id.
 */
export type PaymentSource = "mollie" | "manual_bank_transfer";

/** Providers this integration knows. One for now; the column is a check list. */
export type PaymentProvider = "mollie";

/**
 * A customer's identity at a payment provider. One per customer per provider,
 * however many recurring services that customer buys -- and the mandate hangs
 * here for the same reason: it authorises collection from the customer, not
 * from one service.
 */
export type CustomerPaymentProvider = {
  id: string;
  customerId: string;
  provider: PaymentProvider;
  providerCustomerId: string;
  providerMandateId?: string;
  createdAt: string;
  updatedAt: string;
};

export type PaymentStatus = "open" | "pending" | "paid" | "failed" | "expired" | "canceled";

export type Payment = {
  id: string;
  invoiceId: string;
  customerId: string;
  amountCents: Cents;
  currency: "EUR";
  status: PaymentStatus;
  source: PaymentSource;
  /** The id at the provider; absent for a payment recorded by hand. */
  providerPaymentId?: string;
  /** ideal, creditcard, directdebit, ... when the provider reported one. */
  method?: string;
  /** ISO timestamp; present exactly when the status is "paid". */
  paidAt?: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export const paymentStatusOrder: readonly PaymentStatus[] = [
  "open",
  "pending",
  "paid",
  "failed",
  "expired",
  "canceled",
];

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  open: "Open",
  pending: "In behandeling",
  paid: "Betaald",
  failed: "Mislukt",
  expired: "Verlopen",
  canceled: "Geannuleerd",
};

export const paymentStatusTone: Record<PaymentStatus, "neutral" | "accent" | "success" | "danger"> = {
  open: "accent",
  pending: "accent",
  paid: "success",
  failed: "danger",
  expired: "neutral",
  canceled: "neutral",
};

export const paymentSourceLabels: Record<PaymentSource, string> = {
  mollie: "Mollie",
  manual_bank_transfer: "Bankoverschrijving",
};

export function isPaymentStatus(value: string): value is PaymentStatus {
  return (paymentStatusOrder as readonly string[]).includes(value);
}

/** Money arrived. The only status that counts towards settling an invoice. */
export function isSuccessful(payment: Pick<Payment, "status">): boolean {
  return payment.status === "paid";
}

/** An attempt that is still running, so the invoice may yet be settled. */
export function isInFlight(payment: Pick<Payment, "status">): boolean {
  return payment.status === "open" || payment.status === "pending";
}

// ------------------------------------------------------------ recurring

/**
 * The record that a SEPA pre-notification went out for one collection. What
 * was announced is stored, not what is planned: the plan is derived.
 */
export type PrenotificationStatus = "pending" | "sent" | "failed";

export type DebitPrenotification = {
  id: string;
  recurringServiceId: string;
  customerId: string;
  /** The invoice that was sent as the announcement. */
  invoiceId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  scheduledDebitOn: string;
  amountCents: Cents;
  /** The address it went to, as it was at the time. */
  recipientEmail: string;
  status: PrenotificationStatus;
  providerMessageId?: string;
  error?: string;
  sentAt?: string;
  createdAt: string;
};

export type RecurringStatus = "draft" | "awaiting_mandate" | "active" | "paused" | "canceled";

export type RecurringService = {
  id: string;
  customerId: string;
  name: string;
  description: string;
  amountCents: Cents;
  currency: "EUR";
  vatRate: number;
  interval: "monthly";
  /** ISO date (YYYY-MM-DD): the day the first monthly collection is due. */
  startsOn?: string;
  /** The project this service is part of, when it belongs to one. */
  projectId?: string;
  /**
   * The one-off invoice whose payment establishes the mandate for this
   * service. Stored rather than remembered, so a webhook retry hours later
   * still knows which service that payment was meant to switch on.
   */
  activationInvoiceId?: string;
  status: RecurringStatus;
  /**
   * Only what belongs to this service. The provider's customer and the
   * mandate belong to the customer, not to one service, and live in
   * `CustomerPaymentProvider`.
   */
  mollie: {
    subscriptionId?: string;
  };
  createdAt: string;
  updatedAt: string;
};

export const recurringStatusOrder: readonly RecurringStatus[] = [
  "draft",
  "awaiting_mandate",
  "active",
  "paused",
  "canceled",
];

export const recurringStatusLabels: Record<RecurringStatus, string> = {
  draft: "Concept",
  awaiting_mandate: "Wacht op machtiging",
  active: "Actief",
  paused: "Gepauzeerd",
  canceled: "Gestopt",
};

export const recurringStatusTone: Record<RecurringStatus, "neutral" | "accent" | "success" | "danger"> = {
  draft: "neutral",
  awaiting_mandate: "accent",
  active: "success",
  paused: "neutral",
  canceled: "danger",
};

/**
 * What the customer is actually charged each month.
 *
 * `amountCents` on a service is the price excluding VAT, the same as a line on
 * any document, because that is what the invoice is built from. The provider
 * collects money from a bank account, which is a gross amount -- so the two
 * must be converted, and through `calculateTotals` rather than a second
 * multiplication here, or the invoice and the collection would disagree by a
 * rounded cent and the invoice would never settle.
 */
export function recurringChargeCents(service: Pick<RecurringService, "amountCents" | "vatRate">): Cents {
  return calculateTotals([
    { quantityHundredths: 100, unitPriceCents: service.amountCents, vatRate: service.vatRate },
  ]).totalCents;
}

export function isRecurringStatus(value: string): value is RecurringStatus {
  return (recurringStatusOrder as readonly string[]).includes(value);
}

/** A service that collects money by direct debit right now. */
export function isCollecting(service: Pick<RecurringService, "status">): boolean {
  return service.status === "active";
}
