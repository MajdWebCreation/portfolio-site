import { documentDateLabel, sendDocumentMail } from "@/lib/admin/documents/email";
import { toDateKey } from "@/lib/admin/format";
import { documentFileName, renderInvoicePdf } from "@/lib/admin/pdf/to-buffer";
import { calculateTotals, formatCents } from "@/lib/money";
import { invoiceColumns, invoiceFromRow, type InvoiceRow } from "@/lib/admin/invoices/mapper";
import type { Invoice, InvoiceStatus } from "@/lib/admin/invoices/types";
import { createSubscription as createMollieSubscription, listPaymentLinkPayments } from "@/lib/mollie/client";
import { getMollieConfig, mollieWebhookUrl } from "@/lib/mollie/config";
import { paymentFromRow, recurringServiceFromRow } from "@/lib/payments/mapper";
import { paymentsAdminClient } from "@/lib/payments/admin-client";
import type { BillingPeriod } from "@/lib/payments/billing-period";
import { hasUsableMandate } from "@/lib/payments/provider-customer";
import { ensureRecurringInvoice, markInvoiceMailed } from "@/lib/payments/recurring-invoice";
import type { PaymentRecord, WebhookStore } from "@/lib/payments/webhook";
import { nextPaymentStatus } from "@/lib/payments/webhook";
import { recurringChargeCents, type Payment, type RecurringService } from "@/lib/payments/types";

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

    async findActivationByPaymentId(molliePaymentId: string) {
      const { data, error } = await db
        .from("recurring_activations")
        .select("id, recurring_service_id, used_at")
        .eq("mollie_payment_id", molliePaymentId)
        .maybeSingle();
      fail("Activatie zoeken", error);
      return data
        ? { id: data.id, recurringServiceId: data.recurring_service_id, ...(data.used_at ? { usedAt: data.used_at } : {}) }
        : undefined;
    },

    async getRecurringService(id: string): Promise<RecurringService | undefined> {
      const { data, error } = await db.from("recurring_services").select(recurringColumns).eq("id", id).maybeSingle();
      fail("Terugkerende dienst laden", error);
      return data ? recurringServiceFromRow(data) : undefined;
    },

    /*
      One identity per customer at the provider, and the mandate with it: a
      mandate authorises collection from the customer, not from one service,
      so a second service reuses this row rather than making another.
    */
    async storeProviderMandate({ customerId, providerCustomerId, providerMandateId }) {
      const { data: existing, error: readError } = await db
        .from("customer_payment_providers")
        .select("id")
        .eq("customer_id", customerId)
        .eq("provider", "mollie")
        .maybeSingle();
      fail("Providerkoppeling laden", readError);

      if (existing) {
        const { error } = await db
          .from("customer_payment_providers")
          .update({ provider_customer_id: providerCustomerId, provider_mandate_id: providerMandateId })
          .eq("id", existing.id);
        fail("Machtiging vastleggen", error);
        return;
      }

      const { error } = await db.from("customer_payment_providers").insert({
        customer_id: customerId,
        provider: "mollie",
        provider_customer_id: providerCustomerId,
        provider_mandate_id: providerMandateId,
      });
      // 23505 means a concurrent delivery wrote it first, which is the same
      // outcome by a different route.
      if (error && error.code !== "23505") fail("Machtiging vastleggen", error);
    },

    /* Fixes the billing anchor the first time, and never moves it after. */
    async activateService(serviceId: string, startsOn: string): Promise<RecurringService | undefined> {
      /*
        The anchor is what every later date is derived from, so it is the date
        the subscription is actually being created with -- which is the chosen
        one, unless a late payment moved it forward. Writing it unconditionally
        keeps the announcements and the collections on the same calendar.
      */
      const { error: anchorError } = await db
        .from("recurring_services")
        .update({ starts_on: startsOn })
        .eq("id", serviceId);
      fail("Startdatum vastleggen", anchorError);

      const { data, error } = await db
        .from("recurring_services")
        .update({ status: "active" })
        .eq("id", serviceId)
        .neq("status", "canceled")
        .select(recurringColumns)
        .maybeSingle();
      fail("Dienst activeren", error);
      return data ? recurringServiceFromRow(data) : undefined;
    },

    async markActivationUsed(activationId: string): Promise<void> {
      const { error } = await db
        .from("recurring_activations")
        .update({ used_at: new Date().toISOString() })
        .eq("id", activationId)
        .is("used_at", null);
      fail("Activatie afronden", error);
    },

    /*
      One subscription per service. The provider call carries an idempotency
      key derived from the service, so a retry returns the subscription the
      first call made instead of adding one; the unique index on
      `mollie_subscription_id` is the backstop, and the conditional update
      means a late second writer changes nothing.

      `startDate` is the second period: the first was paid by the activation.
    */
    async createSubscription(service: RecurringService, startDate: string): Promise<void> {
      if (service.mollie.subscriptionId) return;

      const { data: link, error: linkError } = await db
        .from("customer_payment_providers")
        .select("provider_customer_id, provider_mandate_id")
        .eq("customer_id", service.customerId)
        .eq("provider", "mollie")
        .maybeSingle();
      fail("Providerkoppeling laden", linkError);
      if (!link?.provider_customer_id || !link.provider_mandate_id) return;

      const config = getMollieConfig();
      const subscription = await createMollieSubscription({
        customerId: link.provider_customer_id,
        // The gross amount, matching the invoice the charge settles.
        amountCents: recurringChargeCents(service),
        interval: "1 month",
        description: service.name,
        webhookUrl: mollieWebhookUrl(config),
        mandateId: link.provider_mandate_id,
        startDate,
        metadata: { kind: "recurring", recurringServiceId: service.id, customerId: service.customerId },
        idempotencyKey: `recurring-${service.id}`,
        config,
      });

      const { error } = await db
        .from("recurring_services")
        .update({ mollie_subscription_id: subscription.id })
        .eq("id", service.id)
        .is("mollie_subscription_id", null);
      fail("Abonnement vastleggen", error);
    },

    /*
      The document for a term the customer already paid. Same renderer and
      same mailer as every other invoice; only the wording differs, because
      there is no collection coming. Marked as sent through the same field a
      manual send writes, which is what keeps the daily job away from it.
    */
    async sendSettledInvoice(invoice: Invoice, service: RecurringService) {
      const recipient = invoice.customer.email.trim();
      if (!recipient) return { sent: false, reason: "de klant heeft geen e-mailadres" };

      let pdf: Buffer;
      try {
        pdf = await renderInvoicePdf(invoice);
      } catch (error) {
        return { sent: false, reason: error instanceof Error ? error.message : "de PDF kon niet worden gemaakt" };
      }

      const mail = await sendDocumentMail({
        kind: "invoice",
        number: invoice.number.value,
        recipientEmail: recipient,
        contactName: invoice.customer.contactName,
        issueDateLabel: documentDateLabel(invoice.issueDate),
        deadlineLabel: documentDateLabel(invoice.dueDate),
        totalLabel: formatCents(calculateTotals(invoice.lines).totalCents),
        pdf,
        fileName: documentFileName(invoice.number.value),
        recurring: { serviceName: service.name, collection: { kind: "settled" } },
      });

      if (!mail.sent) return { sent: false, reason: mail.reason };

      await markInvoiceMailed(db, invoice.id, recipient, mail.sentAt);
      return { sent: true };
    },

    async findServiceActivatedByInvoice(invoiceId: string): Promise<RecurringService | undefined> {
      const { data, error } = await db
        .from("recurring_services")
        .select(recurringColumns)
        .eq("activation_invoice_id", invoiceId)
        .maybeSingle();
      fail("Gekoppelde dienst laden", error);
      return data ? recurringServiceFromRow(data) : undefined;
    },

    /* Asked of Mollie, so a mandate revoked at the bank is never used. */
    async findUsableMandate(customerId: string) {
      const found = await hasUsableMandate(db, customerId);
      return found.has && found.providerCustomerId && found.mandateId
        ? { providerCustomerId: found.providerCustomerId, mandateId: found.mandateId }
        : undefined;
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
