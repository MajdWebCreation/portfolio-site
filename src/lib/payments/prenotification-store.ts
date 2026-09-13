import { toDateKey } from "@/lib/admin/format";
import { invoiceColumns, invoiceFromRow, type InvoiceRow } from "@/lib/admin/invoices/mapper";
import type { Invoice } from "@/lib/admin/invoices/types";
import { paymentsAdminClient } from "@/lib/payments/admin-client";
import type { BillingPeriod } from "@/lib/payments/billing-period";
import { recurringServiceFromRow } from "@/lib/payments/mapper";
import type { ServiceSchedule } from "@/lib/payments/prenotification";
import type {
  ClaimKey,
  PendingInvoice,
  PrenotificationClaim,
  PrenotificationStore,
} from "@/lib/payments/prenotification-runner";
import { ensureRecurringInvoice, markInvoiceMailed } from "@/lib/payments/recurring-invoice";
import type { RecurringService } from "@/lib/payments/types";

/**
 * The runner's store against Supabase, through the elevated client: the daily
 * job carries no admin session, the same way the Mollie webhook does not.
 *
 * The uniqueness that makes the job idempotent belongs to the database: one
 * invoice per (service, period), and one announcement per (invoice, date,
 * amount). This file inserts and reads back what the database says; it
 * re-checks nothing.
 */
const recurringColumns =
  "id, customer_id, name, description, amount_cents, currency, vat_rate, billing_interval, starts_on, status, project_id, activation_invoice_id, mollie_subscription_id, created_at, updated_at";

function fail(operation: string, error: { message: string } | null): void {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

export function createPrenotificationStore(): PrenotificationStore {
  const db = paymentsAdminClient();

  async function collectingServices(): Promise<RecurringService[]> {
    const { data, error } = await db
      .from("recurring_services")
      .select(recurringColumns)
      .eq("status", "active")
      .not("mollie_subscription_id", "is", null);
    fail("Diensten laden", error);
    return (data ?? []).map(recurringServiceFromRow);
  }

  return {
    /*
      Only services that could possibly collect: active, with a subscription.
      The periods already billed come along, because those are what says which
      collection is next.
    */
    async listSchedules(): Promise<ServiceSchedule[]> {
      const services = await collectingServices();
      if (services.length === 0) return [];

      const { data: invoices, error } = await db
        .from("invoices")
        .select("recurring_service_id, billing_period_start")
        .in("recurring_service_id", services.map((service) => service.id))
        .not("billing_period_start", "is", null);
      fail("Gefactureerde perioden laden", error);

      const billed = new Map<string, string[]>();
      for (const row of invoices ?? []) {
        if (!row.recurring_service_id || !row.billing_period_start) continue;
        const list = billed.get(row.recurring_service_id) ?? [];
        list.push(row.billing_period_start);
        billed.set(row.recurring_service_id, list);
      }

      return services.map((service) => ({
        service,
        billedPeriodStarts: billed.get(service.id) ?? [],
      }));
    },

    async ensureInvoice(service: RecurringService, period: BillingPeriod): Promise<Invoice> {
      return ensureRecurringInvoice(db, service, period, toDateKey(new Date()));
    },

    /*
      `invoices.sent_at` is already the record of "this document was mailed",
      the same field a manual send writes. An unsent, unpaid recurring invoice
      is therefore exactly the work left to do. A paid one is excluded here as
      well as in the runner: the first term is settled by the customer during
      activation and mailed there, and it is not something to announce.
    */
    async listUnsentInvoices(): Promise<PendingInvoice[]> {
      const services = await collectingServices();
      if (services.length === 0) return [];
      const byId = new Map(services.map((service) => [service.id, service]));

      const { data, error } = await db
        .from("invoices")
        .select(invoiceColumns)
        .in("recurring_service_id", [...byId.keys()])
        .is("sent_at", null)
        .neq("status", "paid")
        .order("billing_period_start", { ascending: true });
      fail("Onverzonden periodefacturen laden", error);

      return ((data ?? []) as unknown as InvoiceRow[])
        .map(invoiceFromRow)
        .flatMap((invoice) => {
          const service = invoice.recurringServiceId ? byId.get(invoice.recurringServiceId) : undefined;
          return service ? [{ invoice, service }] : [];
        });
    },

    async customerContact(customerId: string) {
      const { data, error } = await db
        .from("customers")
        .select("contact_name, email")
        .eq("id", customerId)
        .maybeSingle();
      fail("Klant laden", error);
      return data ? { contactName: data.contact_name, email: data.email } : undefined;
    },

    /*
      Insert first and let the index decide. A second cron instance, a retry,
      or two workers at the same moment all end here: one inserts, the others
      get 23505 and read the row that exists.
    */
    async claim(key: ClaimKey) {
      const { data, error } = await db
        .from("debit_prenotifications")
        .insert({
          recurring_service_id: key.serviceId,
          customer_id: key.customerId,
          invoice_id: key.invoiceId,
          billing_period_start: key.periodStart,
          billing_period_end: key.periodEnd,
          scheduled_debit_on: key.debitOn,
          amount_cents: key.amountCents,
          recipient_email: key.recipientEmail,
          status: "pending",
          claimed_at: new Date().toISOString(),
        })
        .select("id")
        .maybeSingle();

      if (!error && data) return { claimed: true as const, id: data.id };
      if (error && error.code !== "23505") fail("Vooraankondiging claimen", error);

      const { data: existing, error: readError } = await db
        .from("debit_prenotifications")
        .select("id, status, claimed_at")
        .eq("invoice_id", key.invoiceId)
        .eq("scheduled_debit_on", key.debitOn)
        .eq("amount_cents", key.amountCents)
        .maybeSingle();
      fail("Bestaande vooraankondiging laden", readError);
      if (!existing) throw new Error("Vooraankondiging claimen: geen rij gevonden na een dubbele sleutel.");

      const claim: PrenotificationClaim = {
        id: existing.id,
        status: existing.status as PrenotificationClaim["status"],
        claimedAt: existing.claimed_at,
      };
      return { claimed: false as const, existing: claim };
    },

    /*
      The announcement and the document are marked together: the invoice's own
      `sent_at` is what keeps it out of tomorrow's list, and the announcement
      row is the audit trail with Resend's id on it.
    */
    async markSent({ claimId, invoiceId, recipientEmail, sentAt, messageId }): Promise<void> {
      const { error } = await db
        .from("debit_prenotifications")
        .update({ status: "sent", sent_at: sentAt, provider_message_id: messageId ?? null, error: null })
        .eq("id", claimId);
      fail("Vooraankondiging vastleggen", error);

      await markInvoiceMailed(db, invoiceId, recipientEmail, sentAt);
    },

    async markFailed(id: string, reason: string): Promise<void> {
      const { error } = await db
        .from("debit_prenotifications")
        // The reason is the provider's own message; it carries no customer data.
        .update({ status: "failed", sent_at: null, error: reason.slice(0, 500) })
        .eq("id", id);
      fail("Mislukte vooraankondiging vastleggen", error);
    },
  };
}
