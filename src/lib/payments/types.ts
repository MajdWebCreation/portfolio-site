import { calculateTotals, type Cents } from "@/lib/money";
import type { ProrationRule } from "@/lib/payments/pricing";

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
   * History only: the one-off invoice whose payment used to establish the
   * mandate for this service, before direct debit got its own EUR 0.01
   * activation link. Nothing reads it to decide anything any more.
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
    /** When the subscription was cancelled at Mollie, or found cancelled. */
    subscriptionCanceledAt?: string;
  };
  /**
   * The last day the service runs, once a cancellation is planned: the end
   * of the last billing period that is still collected. Nothing is billed,
   * announced or collected for a period that starts after it. Present
   * exactly when `cancellationRequestedAt` is.
   */
  endsOn?: string;
  cancellationRequestedAt?: string;
  /**
   * What the cancellation was decided on, fixed with the request and never
   * derived again: the notice applied, the last day that notice gives (which
   * `endsOn` differs from only by an agreed deviation), the agreement
   * revision and source it was read from, and how the partial last term is
   * billed. Present exactly when `cancellationRequestedAt` is, for a
   * cancellation planned since the agreement layer exists.
   */
  cancellation?: {
    noticeMonths: number;
    /** The minimum term that applied, when one was agreed, and its last day. */
    minimumTermMonths?: number;
    minimumTermEndsOn?: string;
    contractualEndsOn: string;
    source: string;
    prorationRule: ProrationRule;
    agreementRevisionId?: string;
    /** On whose agreement `endsOn` deviates from `contractualEndsOn`; always present when it lies inside the minimum term. */
    deviation?: { sourceKind: "accepted_offer" | "later_written_amendment"; sourceLabel: string; agreedOn: string; reason: string };
  };
  /**
   * The partial last period, once Mollie was checked for it: the net amount
   * it is billed and collected at (pro rata, or the full amount when Mollie
   * had already created that payment) and when that was settled.
   */
  lastTerm?: { amountCents: Cents; syncedAt: string };
  /** What the daily job could not resolve and an admin has to look at. */
  lifecycleProblem?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * One change to what a service costs per month, kept for good.
 *
 * The amount a period costs is read off these rows (`amountForPeriod` in
 * pricing.ts): the latest change effective by the period's start decides,
 * and before any change the first change's old amount. So the history is
 * the truth and `RecurringService.amountCents` is merely "the price in effect
 * today", switched over by the daily job on the effective date.
 */
export type PriceChange = {
  id: string;
  recurringServiceId: string;
  customerId: string;
  oldAmountCents: Cents;
  newAmountCents: Cents;
  /** First day of the first billing period at the new amount. */
  effectiveFrom: string;
  requestedAt: string;
  requestedBy?: string;
  /** Mollie holds the new amount for future payments. */
  providerUpdatedAt?: string;
  /** `amountCents` on the service was switched over. */
  appliedAt?: string;
  canceledAt?: string;
  canceledReason?: "withdrawn" | "service_ended";
  /** The effective date it was planned for, when Mollie had already created that period's payment. */
  rescheduledFrom?: string;
  rescheduleReason?: string;
  /** Mollie could not be given the new amount for any period; waits for an admin. */
  blockedAt?: string;
  blockedReason?: string;
};

/** A change still to be carried out, in full or in part. */
export function isPendingPriceChange(change: Pick<PriceChange, "appliedAt" | "canceledAt">): boolean {
  return !change.appliedAt && !change.canceledAt;
}

/** A change that applies to no period at all until an admin resolves it. */
export function isBlockedPriceChange(change: Pick<PriceChange, "appliedAt" | "canceledAt" | "blockedAt">): boolean {
  return isPendingPriceChange(change) && Boolean(change.blockedAt);
}

/**
 * Where a service stands in its life, read off its dates rather than off a
 * fourth status value:
 *
 *   active                  collects, and nothing is planned to end it;
 *   cancellation_scheduled  collects until `endsOn`, which is still ahead;
 *   ended                   `endsOn` has passed, or the status says stopped.
 *
 * `other` is everything before collection starts (draft, awaiting mandate,
 * paused), for which neither changing the price through Mollie nor ending
 * the collection applies.
 */
export type RecurringLifecycle = "active" | "cancellation_scheduled" | "ended" | "other";

export function recurringLifecycle(
  service: Pick<RecurringService, "status" | "endsOn">,
  todayKey: string,
): RecurringLifecycle {
  if (service.status === "canceled") return "ended";
  if (service.endsOn && service.endsOn < todayKey) return "ended";
  if (service.status !== "active") return "other";
  return service.endsOn ? "cancellation_scheduled" : "active";
}

/** "Actief", "Opgezegd — eindigt op 3 dec 2026", "Beëindigd op 3 dec 2026". */
export function recurringLifecycleLabel(
  service: Pick<RecurringService, "status" | "endsOn">,
  todayKey: string,
  formatDay: (dateKey: string) => string,
): string {
  const lifecycle = recurringLifecycle(service, todayKey);
  if (lifecycle === "cancellation_scheduled") return `Opgezegd — eindigt op ${formatDay(service.endsOn!)}`;
  if (lifecycle === "ended") return service.endsOn ? `Beëindigd op ${formatDay(service.endsOn)}` : recurringStatusLabels.canceled;
  return recurringStatusLabels[service.status];
}

export function recurringLifecycleTone(
  service: Pick<RecurringService, "status" | "endsOn">,
  todayKey: string,
): "neutral" | "accent" | "success" | "danger" {
  const lifecycle = recurringLifecycle(service, todayKey);
  if (lifecycle === "cancellation_scheduled") return "accent";
  if (lifecycle === "ended") return "danger";
  return recurringStatusTone[service.status];
}

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

/**
 * A service that collects money by direct debit right now. One with an end
 * date still ahead counts: its remaining periods are collected as agreed.
 */
export function isCollecting(service: Pick<RecurringService, "status">): boolean {
  return service.status === "active";
}
