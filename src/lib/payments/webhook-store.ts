import { toDateKey } from "@/lib/admin/format";
import { invoiceColumns, invoiceFromRow, type InvoiceRow } from "@/lib/admin/invoices/mapper";
import type { Invoice, InvoiceStatus } from "@/lib/admin/invoices/types";
import { listPaymentLinkPayments } from "@/lib/mollie/client";
import { getMollieConfig } from "@/lib/mollie/config";
import { paymentFromRow, recurringServiceFromRow } from "@/lib/payments/mapper";
import { paymentsAdminClient } from "@/lib/payments/admin-client";
import type { BillingPeriod } from "@/lib/payments/billing-period";
import {
  activationForPayment,
  activationIdForPaymentLink,
  processActivationPayment,
} from "@/lib/payments/mandate-activation";
import { ensureRecurringInvoice } from "@/lib/payments/recurring-invoice";
import type { PaymentRecord, WebhookStore } from "@/lib/payments/webhook";
import { nextPaymentStatus } from "@/lib/payments/webhook";
import type { Payment, RecurringService } from "@/lib/payments/types";

/**
 * The `WebhookStore` against Supabase, used by the routes that have no admin
 * session. Every read and write here goes through the service client; see
 * service-db.ts for why that is the narrowest option available.
 */
const paymentColumns =
  "id, invoice_id, customer_id, amount_cents, currency, status, source, provider_payment_id, method, paid_at, description, created_at, updated_at";
const recurringColumns =
  "id, customer_id, name, description, amount_cents, currency, vat_rate, billing_interval, starts_on, status, project_id, activation_invoice_id, mollie_subscription_id, created_at, updated_at";

function fail(operation: string, error: { message: string } | null): void {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

function toRow(record: PaymentRecord) {
  return {
    invoice_id: record.invoiceId,
    customer_id: record.customerId,
    amount_cents: record.amountCents,
    currency: "EUR",
    status: record.status,
    source: record.source,
    provider_payment_id: record.providerPaymentId,
    method: record.method ?? null,
    paid_at: record.paidAt ?? null,
    description: record.description,
  };
}

export function createWebhookStore(): WebhookStore {
  const db = paymentsAdminClient();

  async function findByProviderId(providerPaymentId: string): Promise<Payment | undefined> {
    const { data, error } = await db
      .from("payments")
      .select(paymentColumns)
      .eq("source", "mollie")
      .eq("provider_payment_id", providerPaymentId)
      .maybeSingle();
    fail("Betaling zoeken", error);
    return data ? paymentFromRow(data) : undefined;
  }

  return {
    /*
      Insert, and on a duplicate fall through to update. The unique index on
      (source, provider_payment_id) is what makes this safe when two copies of
      the same webhook arrive at the same moment: one inserts, the other gets
      23505 and updates the row the first one made.
    */
    async upsertPayment(record: PaymentRecord): Promise<Payment> {
      const existing = await findByProviderId(record.providerPaymentId);

      if (!existing) {
        const { data, error } = await db.from("payments").insert(toRow(record)).select(paymentColumns).single();
        if (!error && data) return paymentFromRow(data);
        if (error && error.code !== "23505") fail("Betaling vastleggen", error);
      }

      const status = nextPaymentStatus(existing?.status, record.status);
      const { data, error } = await db
        .from("payments")
        .update({
          status,
          method: record.method ?? null,
          // The database requires a date exactly when the status is paid.
          paid_at: status === "paid" ? (record.paidAt ?? existing?.paidAt ?? new Date().toISOString()) : null,
          amount_cents: record.amountCents,
        })
        .eq("source", "mollie")
        .eq("provider_payment_id", record.providerPaymentId)
        .select(paymentColumns)
        .single();

      fail("Betaling bijwerken", error);
      return paymentFromRow(data!);
    },

    /* The same columns and the same mapper the admin repository uses; only the
       client differs, because a webhook has no session. */
    async getInvoice(invoiceId: string): Promise<Invoice | undefined> {
      const { data, error } = await db.from("invoices").select(invoiceColumns).eq("id", invoiceId).maybeSingle();
      fail("Factuur laden", error);
      return data ? invoiceFromRow(data as unknown as InvoiceRow) : undefined;
    },

    async listPaymentsForInvoice(invoiceId: string): Promise<Payment[]> {
      const { data, error } = await db.from("payments").select(paymentColumns).eq("invoice_id", invoiceId);
      fail("Betalingen laden", error);
      return (data ?? []).map(paymentFromRow);
    },

    async setInvoiceStatus(invoiceId: string, status: InvoiceStatus): Promise<void> {
      const { error } = await db.from("invoices").update({ status }).eq("id", invoiceId);
      fail("Factuurstatus bijwerken", error);
    },

    /*
      A payment on a direct debit activation link goes to its own flow, with
      this same elevated client. It never comes back here as an invoice
      payment.
    */
    async handleMandateActivation(payment, activationIdHint) {
      const activation = await activationForPayment(db, payment.id, activationIdHint);
      return activation ? processActivationPayment(db, payment, activation) : undefined;
    },

    async findActivationIdForPaymentLink(providerPaymentLinkId: string): Promise<string | undefined> {
      return activationIdForPaymentLink(db, providerPaymentLinkId);
    },

    async findInvoiceIdForProviderPayment(molliePaymentId: string): Promise<string | undefined> {
      const existing = await findByProviderId(molliePaymentId);
      return existing?.invoiceId;
    },

    async findInvoiceIdForPaymentLink(providerPaymentLinkId: string): Promise<string | undefined> {
      const { data, error } = await db
        .from("invoice_payment_links")
        .select("invoice_id")
        .eq("provider", "mollie")
        .eq("provider_payment_link_id", providerPaymentLinkId)
        .maybeSingle();
      fail("Betaallink opzoeken", error);
      return data?.invoice_id;
    },

    /*
      Our row says which link belongs to this invoice; Mollie says which
      payments that link produced. Only a payment that appears in both is
      allowed to settle the invoice, so the invoice id in the webhook URL can
      never be used to attach someone else's payment to it.
    */
    async confirmLinkPayment(molliePaymentId: string, invoiceId: string): Promise<boolean> {
      const { data, error } = await db
        .from("invoice_payment_links")
        .select("provider_payment_link_id")
        .eq("provider", "mollie")
        .eq("invoice_id", invoiceId)
        .maybeSingle();
      fail("Betaallink van factuur laden", error);
      if (!data) return false;

      const payments = await listPaymentLinkPayments(data.provider_payment_link_id, getMollieConfig());
      return payments.some((payment) => payment.id === molliePaymentId);
    },

    async findServiceBySubscriptionId(subscriptionId: string): Promise<RecurringService | undefined> {
      const { data, error } = await db
        .from("recurring_services")
        .select(recurringColumns)
        .eq("mollie_subscription_id", subscriptionId)
        .maybeSingle();
      fail("Dienst bij abonnement zoeken", error);
      return data ? recurringServiceFromRow(data) : undefined;
    },

    /*
      The invoice for one billing period, made by the same function the daily
      pass uses -- so a charge that arrives before the announcement, or after
      it, always lands on the same document and the same YM-F number.
    */
    async ensureRecurringInvoice(service: RecurringService, period: BillingPeriod): Promise<Invoice> {
      return ensureRecurringInvoice(db, service, period, toDateKey(new Date()));
    },
  };
}
