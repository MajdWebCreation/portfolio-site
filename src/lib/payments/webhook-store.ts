import { companyProfile } from "@/lib/admin/documents/company";
import { addDays } from "@/lib/admin/documents/validation";
import { invoiceColumns, invoiceFromRow, type InvoiceRow } from "@/lib/admin/invoices/mapper";
import type { Invoice, InvoiceStatus } from "@/lib/admin/invoices/types";
import { createSubscription as createMollieSubscription } from "@/lib/mollie/client";
import { getMollieConfig, mollieWebhookUrl } from "@/lib/mollie/config";
import { paymentFromRow, recurringServiceFromRow } from "@/lib/payments/mapper";
import { paymentsAdminClient } from "@/lib/payments/admin-client";
import type { BillingPeriod } from "@/lib/payments/billing-period";
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
  "id, customer_id, name, description, amount_cents, currency, vat_rate, billing_interval, starts_on, status, mollie_subscription_id, created_at, updated_at";

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
      const { error: anchorError } = await db
        .from("recurring_services")
        .update({ starts_on: startsOn })
        .eq("id", serviceId)
        .is("starts_on", null);
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

    async findInvoiceIdForProviderPayment(molliePaymentId: string): Promise<string | undefined> {
      const existing = await findByProviderId(molliePaymentId);
      return existing?.invoiceId;
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
      The invoice for one billing period. YM's own administration stays the
      document of record: Mollie moved the money, this is the bill for it. The
      number comes from the same yearly sequence every other invoice uses.

      Idempotency is the unique index on (recurring_service_id,
      billing_period_start), not a check here: a concurrent second writer gets
      23505 and reads the invoice the first one made. That is what makes this
      safe under genuinely parallel webhook deliveries and not only retries.
    */
    async ensureRecurringInvoice(service: RecurringService, period: BillingPeriod): Promise<Invoice> {
      const readExisting = async () => {
        const { data, error } = await db
          .from("invoices")
          .select(invoiceColumns)
          .eq("recurring_service_id", service.id)
          .eq("billing_period_start", period.start)
          .maybeSingle();
        fail("Bestaande periodefactuur laden", error);
        return data ? invoiceFromRow(data as unknown as InvoiceRow) : undefined;
      };

      const already = await readExisting();
      if (already) return already;

      const { data: customer, error: customerError } = await db
        .from("customers")
        .select("company_name, contact_name, email, street, postal_code, city, country, kvk_number, vat_number")
        .eq("id", service.customerId)
        .single();
      fail("Klant laden", customerError);

      const { data: created, error } = await db
        .from("invoices")
        .insert({
          number_value: `FAC-CONCEPT-${service.id.slice(-4).toUpperCase()}-${period.start}`,
          number_provisional: true,
          status: "sent",
          customer_id: service.customerId,
          customer_company_name: customer!.company_name,
          customer_contact_name: customer!.contact_name,
          customer_email: customer!.email,
          customer_street: customer!.street,
          customer_postal_code: customer!.postal_code,
          customer_city: customer!.city,
          customer_country: customer!.country,
          customer_kvk_number: customer!.kvk_number,
          customer_vat_number: customer!.vat_number,
          recurring_service_id: service.id,
          billing_period_start: period.start,
          billing_period_end: period.end,
          issue_date: period.start,
          due_date: addDays(period.start, companyProfile.paymentTermDays),
          payment_reference: "",
          notes: "Automatische incasso via Mollie.",
        })
        .select("id")
        .maybeSingle();

      if (error || !created) {
        // The index refused a second invoice for this period; the first one is
        // the answer.
        if (error?.code === "23505") {
          const raced = await readExisting();
          if (raced) return raced;
        }
        fail("Factuur voor incasso aanmaken", error);
        throw new Error("Factuur voor incasso aanmaken: geen rij teruggekregen.");
      }

      const { error: linesError } = await db.rpc("save_invoice_lines", {
        p_invoice_id: created.id,
        p_lines: [
          {
            description: service.name,
            quantityHundredths: 100,
            unitPriceCents: service.amountCents,
            vatRate: service.vatRate,
          },
        ] as never,
      });
      fail("Factuurregel aanmaken", linesError);

      // The definitive YM-F number, from the same sequence as every other
      // invoice; a charge is a real invoice, not a note.
      const { data: number, error: numberError } = await db.rpc("assign_invoice_number", {
        p_invoice_id: created.id,
      });
      fail("Factuurnummer toekennen", numberError);

      const { error: referenceError } = await db
        .from("invoices")
        .update({ payment_reference: number ?? "" })
        .eq("id", created.id);
      fail("Betalingskenmerk bijwerken", referenceError);

      const { data, error: readError } = await db
        .from("invoices")
        .select(invoiceColumns)
        .eq("id", created.id)
        .single();
      fail("Factuur herlezen", readError);
      return invoiceFromRow(data as unknown as InvoiceRow);
    },
  };
}
