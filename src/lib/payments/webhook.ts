import { calculateTotals } from "@/lib/money";
import type { Invoice, InvoiceStatus } from "@/lib/admin/invoices/types";
import { centsFromMollie, paymentStatusFromMollie, type MolliePayment } from "@/lib/mollie/client";
import { billingPeriod, firstPeriodStart, nextPeriodStart, periodForCharge, type BillingPeriod } from "@/lib/payments/billing-period";
import { settleInvoice } from "@/lib/payments/settlement";
import type { Payment, PaymentStatus, RecurringService } from "@/lib/payments/types";

/**
 * Turning a Mollie payment into our own administration, idempotently.
 *
 * The guarantees, and where each one actually comes from:
 *
 *   no duplicate payments       one row per (source, provider_payment_id),
 *                               enforced by a unique index, not by a check in
 *                               this file. A retry updates that row.
 *
 *   no duplicate subscriptions  `mollie_subscription_id` is unique, and the
 *                               service is only asked to create one when it
 *                               has none.
 *
 *   no wrong statuses           a row that already says `paid` is never
 *                               written back to something worse, and the
 *                               invoice is re-evaluated from all its payments
 *                               rather than from the message that arrived.
 *
 * Nothing here trusts the webhook body: the caller fetches the payment from
 * Mollie first and hands in that resource. The webhook only says which id to
 * look at.
 */
export type PaymentRecord = {
  invoiceId: string;
  customerId: string;
  amountCents: number;
  status: PaymentStatus;
  source: "mollie";
  providerPaymentId: string;
  method?: string;
  paidAt?: string;
  description: string;
};

export type WebhookStore = {
  /** One row per provider payment; returns the row as it now stands. */
  upsertPayment: (record: PaymentRecord) => Promise<Payment>;
  getInvoice: (invoiceId: string) => Promise<Invoice | undefined>;
  listPaymentsForInvoice: (invoiceId: string) => Promise<Payment[]>;
  setInvoiceStatus: (invoiceId: string, status: InvoiceStatus) => Promise<void>;
  /** The activation this first payment belongs to, if it is one. */
  findActivationByPaymentId: (molliePaymentId: string) => Promise<{ id: string; recurringServiceId: string; usedAt?: string } | undefined>;
  getRecurringService: (id: string) => Promise<RecurringService | undefined>;
  /** The customer's identity and mandate at the provider; one per customer. */
  storeProviderMandate: (input: {
    customerId: string;
    providerCustomerId: string;
    providerMandateId: string;
  }) => Promise<void>;
  /** Turns the service on and fixes the billing anchor if it had none. */
  activateService: (serviceId: string, startsOn: string) => Promise<RecurringService | undefined>;
  markActivationUsed: (activationId: string) => Promise<void>;
  /**
   * The YM invoice for one billing period. Returns the existing one when the
   * period was already billed; the unique index is what decides, not a check
   * in application code.
   */
  ensureRecurringInvoice: (service: RecurringService, period: BillingPeriod) => Promise<Invoice>;
  /** Creates the provider subscription and stores its id; skipped when one exists. */
  createSubscription: (service: RecurringService, startDate: string) => Promise<void>;
  /** The invoice an already recorded provider payment belongs to. */
  findInvoiceIdForProviderPayment: (molliePaymentId: string) => Promise<string | undefined>;
  findServiceBySubscriptionId: (subscriptionId: string) => Promise<RecurringService | undefined>;
};

export type WebhookOutcome = {
  handled: boolean;
  /** Short, non-sensitive summary for the log line. */
  note: string;
  invoiceStatus?: InvoiceStatus;
};

/** Never move a payment backwards from money-arrived to anything else. */
export function nextPaymentStatus(previous: PaymentStatus | undefined, incoming: PaymentStatus): PaymentStatus {
  return previous === "paid" ? "paid" : incoming;
}

/**
 * What an invoice's status should be, given what has actually been paid.
 * Existing statuses only; no parallel set is introduced.
 */
export function nextInvoiceStatus(
  invoice: Pick<Invoice, "status" | "dueDate">,
  settled: boolean,
  todayKey: string,
): InvoiceStatus {
  // A cancelled invoice is not revived by money arriving, and a draft is not
  // a claim yet. Both are left exactly as they are.
  if (invoice.status === "cancelled" || invoice.status === "draft") return invoice.status;
  if (settled) return "paid";
  // Not settled. An invoice already marked paid keeps that: it may have been
  // settled by something this administration does not know about, and a
  // failed extra attempt must not undo it.
  if (invoice.status === "paid") return "paid";
  return invoice.dueDate < todayKey ? "overdue" : "sent";
}

function recordFrom(payment: MolliePayment, invoiceId: string, customerId: string): PaymentRecord {
  const status = paymentStatusFromMollie(payment.status);
  return {
    invoiceId,
    customerId,
    amountCents: centsFromMollie(payment.amount.value),
    status,
    source: "mollie",
    providerPaymentId: payment.id,
    description: payment.description,
    ...(payment.method ? { method: payment.method } : {}),
    // The database requires a date exactly when the status is paid.
    ...(status === "paid" ? { paidAt: payment.paidAt ?? new Date().toISOString() } : {}),
  };
}

function metadataString(payment: MolliePayment, key: string): string | undefined {
  const value = payment.metadata?.[key];
  return typeof value === "string" && value ? value : undefined;
}

/**
 * The whole of webhook handling. Safe to run a hundred times for the same
 * payment: every step is either an upsert keyed on the provider id, or a
 * recomputation from stored facts.
 */
export async function processMolliePayment(
  payment: MolliePayment,
  store: WebhookStore,
  todayKey: string,
): Promise<WebhookOutcome> {
  const activation = await store.findActivationByPaymentId(payment.id);
  if (activation) return processActivation(payment, activation, store, todayKey);

  const invoiceId = metadataString(payment, "invoiceId") ?? (await recurringChargeInvoiceId(payment, store));
  if (!invoiceId) return { handled: false, note: "payment has no invoice metadata" };

  const invoice = await store.getInvoice(invoiceId);
  if (!invoice) return { handled: false, note: "invoice no longer exists" };

  const customerId = metadataString(payment, "customerId");
  /*
    The metadata is attacker-visible in the sense that it came back from a
    third party, so the customer is taken from the invoice, and a mismatch is
    refused rather than written. The database would refuse it too -- the
    composite key ties a payment's invoice and customer together -- but
    failing here says why.
  */
  if (customerId && customerId !== invoice.customer.customerId) {
    return { handled: false, note: "payment metadata does not match the invoice customer" };
  }

  await store.upsertPayment(recordFrom(payment, invoice.id, invoice.customer.customerId));

  const payments = await store.listPaymentsForInvoice(invoice.id);
  const total = calculateTotals(invoice.lines).totalCents;
  const { settled } = settleInvoice(total, payments);
  const status = nextInvoiceStatus(invoice, settled, todayKey);

  if (status !== invoice.status) await store.setInvoiceStatus(invoice.id, status);

  return { handled: true, note: `invoice ${settled ? "settled" : "not settled"}`, invoiceStatus: status };
}

/**
 * A monthly charge arrives without an invoice of its own: Mollie collected on
 * a subscription, and the YM invoice for that month does not exist yet. It is
 * created here, so the chain recurring service -> invoice -> payment is
 * complete for every charge.
 *
 * Idempotent because the provider payment id is the key: if a row for this
 * payment already exists, its invoice is the answer and nothing is created.
 */
async function recurringChargeInvoiceId(payment: MolliePayment, store: WebhookStore): Promise<string | undefined> {
  if (!payment.subscriptionId) return undefined;

  const known = await store.findInvoiceIdForProviderPayment(payment.id);
  if (known) return known;

  const service = await store.findServiceBySubscriptionId(payment.subscriptionId);
  if (!service) return undefined;

  /*
    Which month this collection is for. Counted forward from the service's
    own anchor rather than from the day the money happened to arrive, so a
    collection that lands a few days late still belongs to its own period --
    which is what keeps one charge to one invoice.
  */
  const anchor = service.startsOn ?? chargeDate(payment);
  const invoice = await store.ensureRecurringInvoice(service, periodForCharge(anchor, chargeDate(payment)));
  return invoice.id;
}

function chargeDate(payment: MolliePayment): string {
  return (payment.paidAt ?? new Date().toISOString()).slice(0, 10);
}

/**
 * The first payment of a direct debit mandate.
 *
 * That payment is the first billing period, so it produces a normal YM
 * invoice like any other charge and is attached to it through the ordinary
 * payments table. The subscription is created afterwards and starts at the
 * *next* period, so the month just paid is never collected a second time.
 *
 * Every step is separately idempotent -- the mandate is an upsert, the invoice
 * is decided by a unique index, the payment by its provider id, the
 * subscription by the service already having one -- so a repeat delivery, or
 * one that resumes after a crash halfway, finishes the job instead of
 * doubling it.
 */
async function processActivation(
  payment: MolliePayment,
  activation: { id: string; recurringServiceId: string; usedAt?: string },
  store: WebhookStore,
  todayKey: string,
): Promise<WebhookOutcome> {
  const status = paymentStatusFromMollie(payment.status);
  if (status !== "paid") return { handled: true, note: `activation payment ${status}` };

  if (!payment.customerId || !payment.mandateId) {
    return { handled: false, note: "activation payment carries no mandate yet" };
  }

  const service = await store.getRecurringService(activation.recurringServiceId);
  if (!service) return { handled: false, note: "recurring service no longer exists" };

  await store.storeProviderMandate({
    customerId: service.customerId,
    providerCustomerId: payment.customerId,
    providerMandateId: payment.mandateId,
  });

  // Period one starts on the agreed date, or on the day this was paid.
  const periodStart = firstPeriodStart(service, chargeDate(payment));
  const period = billingPeriod(periodStart);

  const active = (await store.activateService(service.id, periodStart)) ?? service;
  const invoice = await store.ensureRecurringInvoice(active, period);

  await store.upsertPayment(recordFrom(payment, invoice.id, invoice.customer.customerId));

  const payments = await store.listPaymentsForInvoice(invoice.id);
  const total = calculateTotals(invoice.lines).totalCents;
  const { settled } = settleInvoice(total, payments);
  const invoiceStatus = nextInvoiceStatus(invoice, settled, todayKey);
  if (invoiceStatus !== invoice.status) await store.setInvoiceStatus(invoice.id, invoiceStatus);

  await store.markActivationUsed(activation.id);

  if (active.mollie.subscriptionId) {
    return { handled: true, note: "subscription already active", invoiceStatus };
  }

  // The first automatic collection is the second period: the first is paid.
  await store.createSubscription(active, nextPeriodStart(periodStart));
  return { handled: true, note: "subscription created", invoiceStatus };
}
