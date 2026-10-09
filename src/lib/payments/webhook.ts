import { calculateTotals } from "@/lib/money";
import type { Invoice, InvoiceStatus } from "@/lib/admin/invoices/types";
import { centsFromMollie, paymentStatusFromMollie, type MolliePayment } from "@/lib/mollie/client";
import { periodForCharge, type BillingPeriod } from "@/lib/payments/billing-period";
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
 *   no invoice from a mandate   a payment on a direct debit activation link
 *                               is recognised first and handed to its own
 *                               flow; it never reaches the invoice routing,
 *                               so the EUR 0.01 can never settle anything.
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
  /**
   * A payment on a direct debit activation link, handled by its own flow
   * (`mandate-activation.ts`) and never as an invoice payment. Returns
   * nothing when the payment is not an activation payment. The activation id
   * from the webhook URL is only a hint, confirmed with Mollie first.
   */
  handleMandateActivation: (payment: MolliePayment, activationIdHint?: string) => Promise<WebhookOutcome | undefined>;
  /**
   * The YM invoice for one billing period. Returns the existing one when the
   * period was already billed; the unique index is what decides, not a check
   * in application code.
   */
  ensureRecurringInvoice: (service: RecurringService, period: BillingPeriod) => Promise<Invoice>;
  /** The invoice an already recorded provider payment belongs to. */
  findInvoiceIdForProviderPayment: (molliePaymentId: string) => Promise<string | undefined>;
  /** The invoice we recorded a Mollie payment link for. */
  findInvoiceIdForPaymentLink: (providerPaymentLinkId: string) => Promise<string | undefined>;
  /** The direct debit activation a Mollie payment link was made for. */
  findActivationIdForPaymentLink: (providerPaymentLinkId: string) => Promise<string | undefined>;
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
  /**
   * Ask Mollie to deliver this webhook again: the route answers non-2xx.
   * Only for a state that will resolve by itself -- a mandate Mollie still
   * calls pending -- so a redelivery has something new to find. Everything
   * written before is idempotent, so the redelivery only finishes the job.
   */
  retry?: boolean;
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
  /** The activation named in the webhook URL of an activation link; a hint too. */
  activationIdHint?: string;
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

  /*
    Next, a direct debit activation. Its EUR 0.01 buys a mandate, not a term,
    so it is handled by its own flow and returns before any invoice could be
    looked up -- whatever the payment does or does not carry.
  */
  const activation = await store.handleMandateActivation(payment, context.activationIdHint);
  if (activation) return activation;

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
