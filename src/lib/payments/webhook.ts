import { calculateTotals } from "@/lib/money";
import type { Invoice, InvoiceStatus } from "@/lib/admin/invoices/types";
import { centsFromMollie, paymentStatusFromMollie, type MolliePayment } from "@/lib/mollie/client";
import { billingPeriod, firstPeriodStart, nextPeriodStart, periodForCharge, type BillingPeriod } from "@/lib/payments/billing-period";
import { announceableStart } from "@/lib/payments/prenotification";
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
  /**
   * Mails the invoice for a term the customer already paid, PDF attached, and
   * marks the document as sent. Not a pre-notification: nothing is going to
   * be collected, so there is nothing to announce.
   */
  sendSettledInvoice: (invoice: Invoice, service: RecurringService) => Promise<{ sent: boolean; reason?: string }>;
  /** The service a paid invoice is meant to switch on, if it is meant to. */
  findServiceActivatedByInvoice: (invoiceId: string) => Promise<RecurringService | undefined>;
  /**
   * The mandate that may be collected against, asked of the provider rather
   * than of our own column. Absent when there is none yet.
   */
  findUsableMandate: (customerId: string) => Promise<{ providerCustomerId: string; mandateId: string } | undefined>;
  /** The invoice an already recorded provider payment belongs to. */
  findInvoiceIdForProviderPayment: (molliePaymentId: string) => Promise<string | undefined>;
  /** The invoice we recorded a Mollie payment link for. */
  findInvoiceIdForPaymentLink: (providerPaymentLinkId: string) => Promise<string | undefined>;
  /**
   * Confirms that a payment really came from the payment link of this
   * invoice, by asking Mollie which payments that link produced.
   *
   * The Payment Links API has no metadata field, so a link payment reaches us
   * with nothing on it that names an invoice. The webhook URL carries the
   * invoice as a hint -- and a hint from a third party is not a fact, so it is
   * checked against the provider before a cent is written.
   */
  confirmLinkPayment: (molliePaymentId: string, invoiceId: string) => Promise<boolean>;
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
  /*
    A cancelled invoice is not revived by money arriving, and neither a
    concept nor a document that has not been sent is a claim yet -- an issued
    invoice the customer never received cannot be overdue. All three are left
    exactly as they are.
  */
  if (invoice.status === "cancelled" || invoice.status === "draft" || invoice.status === "issued") {
    return invoice.status;
  }
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
 * The marker the admin integration check puts on the payments it creates.
 *
 * Such a payment exists only to prove that the API key works. It belongs to no
 * customer, no invoice and no service, and must never become part of the
 * financial administration -- so it is recognised by name and dropped before
 * anything is read or written.
 */
export const integrationTestMarker = "integration_test";

export function isIntegrationTestPayment(payment: Pick<MolliePayment, "metadata">): boolean {
  const marked = payment.metadata?.[integrationTestMarker];
  return marked === true || marked === "true" || payment.metadata?.kind === "integration_test";
}

/**
 * The whole of webhook handling. Safe to run a hundred times for the same
 * payment: every step is either an upsert keyed on the provider id, or a
 * recomputation from stored facts.
 */
export type WebhookContext = {
  /**
   * The invoice named in the webhook URL of a payment link. Only a hint: it is
   * verified against Mollie before it routes anything.
   */
  invoiceIdHint?: string;
};

export async function processMolliePayment(
  payment: MolliePayment,
  store: WebhookStore,
  todayKey: string,
  context: WebhookContext = {},
): Promise<WebhookOutcome> {
  /*
    First, before the store is touched at all. A payment from the integration
    check is not administration and never becomes any: no read, no write, no
    invoice, no customer status. Returning `handled` keeps Mollie from
    retrying something we have deliberately decided about.
  */
  if (isIntegrationTestPayment(payment)) {
    return { handled: true, note: "integration test payment ignored" };
  }

  const activation = await store.findActivationByPaymentId(payment.id);
  if (activation) return processActivation(payment, activation, store, todayKey);

  /*
    Which invoice this payment is for, in order of how much it is worth
    trusting: the payment's own metadata (a Payments-API payment we made), the
    subscription it belongs to, a payment we have already recorded, and
    finally a payment link -- where the invoice is a hint from the webhook URL
    that Mollie itself has to confirm.
  */
  const invoiceId =
    metadataString(payment, "invoiceId") ??
    (await recurringChargeInvoiceId(payment, store)) ??
    (await store.findInvoiceIdForProviderPayment(payment.id)) ??
    (await linkPaymentInvoiceId(payment, store, context));
  if (!invoiceId) return { handled: false, note: "payment cannot be traced to an invoice" };

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

  /*
    A paid one-off invoice may be the one that switches a monthly service on.
    Whether the mandate came from this very payment (`sequenceType: first`) or
    already existed, the same central step decides -- and it is only reached
    once the invoice is actually settled.
  */
  if (settled) {
    const activation = await activateServiceForInvoice(invoice, payment, store, todayKey);
    if (activation) return { handled: activation.handled, note: activation.note, invoiceStatus: status };
  }

  return { handled: true, note: `invoice ${settled ? "settled" : "not settled"}`, invoiceStatus: status };
}

/**
 * The invoice behind a payment link payment.
 *
 * The link says nothing about our administration -- the API has no metadata
 * field -- so the invoice comes from our own row, reached through the hint in
 * the webhook URL, and Mollie is then asked to confirm that this payment is
 * one the link actually produced. A forged callback naming someone else's
 * invoice fails that check and writes nothing.
 */
async function linkPaymentInvoiceId(
  payment: MolliePayment,
  store: WebhookStore,
  context: WebhookContext,
): Promise<string | undefined> {
  const invoiceId = context.invoiceIdHint;
  if (!invoiceId) return undefined;
  return (await store.confirmLinkPayment(payment.id, invoiceId)) ? invoiceId : undefined;
}

/**
 * Switching on the service a paid invoice was meant to switch on.
 *
 * The one place a subscription is created from an invoice, so the ordinary
 * flow and the standalone activation link cannot drift apart. Returns nothing
 * when this invoice was not meant to switch anything on.
 *
 * Exactly once, guaranteed three ways over: the service is only asked to
 * subscribe when it has no subscription id, the provider call carries an
 * idempotency key derived from the service, and a unique index refuses a
 * second subscription id. A repeated webhook therefore finds the work done.
 */
async function activateServiceForInvoice(
  invoice: Invoice,
  payment: MolliePayment,
  store: WebhookStore,
  todayKey: string,
): Promise<WebhookOutcome | undefined> {
  const service = await store.findServiceActivatedByInvoice(invoice.id);
  if (!service) return undefined;
  if (service.mollie.subscriptionId) return { handled: true, note: "subscription already active" };
  if (service.status === "canceled") return { handled: true, note: "service cancelled; not activating" };

  /*
    Which mandate to collect against. The provider's own list of mandates
    decides, because that is the only answer that reflects a mandate revoked
    at the bank; what the payment says is the fallback for the moment just
    after a first payment, when the payment already names the mandate it
    established.
  */
  const fromPayment =
    payment.customerId && payment.mandateId
      ? { providerCustomerId: payment.customerId, mandateId: payment.mandateId }
      : undefined;
  const mandate = (await store.findUsableMandate(invoice.customer.customerId)) ?? fromPayment;

  if (!mandate) {
    // The money arrived but the authorisation did not. Reported rather than
    // retried forever: nothing here will produce a mandate on its own.
    return { handled: true, note: "invoice paid but no usable mandate yet" };
  }

  await store.storeProviderMandate({
    customerId: invoice.customer.customerId,
    providerCustomerId: mandate.providerCustomerId,
    providerMandateId: mandate.mandateId,
  });

  /*
    The start date the admin chose is the first monthly collection, and the
    invoice mail announced it. Nothing monthly has been billed yet, so it is
    not shifted by a period -- except when the customer paid so late that the
    date has come too close or gone by. Collecting then would be collecting
    without the fourteen days' notice YM Creations promises, so the date moves
    on by whole months to the first one that can still be announced, and the
    ordinary monthly invoice announces it.
  */
  if (!service.startsOn) return { handled: true, note: "service has no start date; not activating" };
  const startDate = announceableStart(service.startsOn, todayKey);
  const moved = startDate !== service.startsOn;

  const active = (await store.activateService(service.id, startDate)) ?? service;
  if (active.mollie.subscriptionId) return { handled: true, note: "subscription already active" };

  await store.createSubscription(active, startDate);
  return {
    handled: true,
    note: moved ? "subscription created from invoice payment, start date moved forward" : "subscription created from invoice payment",
  };
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
 * The customer paid this term themselves, in the checkout they just left, so
 * it is not a SEPA pre-notification and gets no announcement row. It gets
 * what a paid invoice gets: the document, by mail, straight away.
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

  if (!active.mollie.subscriptionId) {
    // The first automatic collection is the second period: the first is paid.
    await store.createSubscription(active, nextPeriodStart(periodStart));
  }

  /*
    The invoice goes out now, not tomorrow. Idempotent on the document's own
    `sent_at`, so a repeated delivery of this webhook mails nothing twice.

    A mail that fails is reported as unhandled, which makes the route answer
    non-2xx and Mollie deliver again. Everything above it is idempotent, so a
    redelivery reuses this invoice and this number and only retries the mail.
  */
  if (!invoice.sentAt) {
    const mailed = await store.sendSettledInvoice({ ...invoice, status: invoiceStatus }, active);
    if (!mailed.sent) {
      return { handled: false, note: `first term invoice mail failed: ${mailed.reason ?? "unknown"}`, invoiceStatus };
    }
  }

  return { handled: true, note: "first term invoiced and mailed", invoiceStatus };
}
