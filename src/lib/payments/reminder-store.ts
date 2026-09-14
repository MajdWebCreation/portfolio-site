import { invoiceColumns, invoiceFromRow, type InvoiceRow } from "@/lib/admin/invoices/mapper";
import { paymentsAdminClient } from "@/lib/payments/admin-client";
import {
  collectionEventColumns,
  collectionEventFromRow,
  type CollectionEventRow,
} from "@/lib/payments/collection-mapper";
import type { CollectionEvent, CollectionState } from "@/lib/payments/collection-state";
import { paymentFromRow } from "@/lib/payments/mapper";
import type { ClaimKey, ReminderCandidate, ReminderClaim, ReminderStore } from "@/lib/payments/reminder-runner";
import type { Payment } from "@/lib/payments/types";

/**
 * The reminder runner's store against Supabase, through the elevated client:
 * the daily job carries no admin session, the same way the Mollie webhook and
 * the pre-notification job do not.
 *
 * Reads are batched rather than per invoice. A run with forty open invoices
 * is six queries, not two hundred -- and every one of them is filtered on the
 * invoice ids the first query returned, so nothing about another customer is
 * ever loaded, let alone matched.
 *
 * The idempotency that matters is the database's: one row per (invoice,
 * stage). This file inserts and reads back what the database says; it
 * re-checks nothing.
 */
const paymentColumns =
  "id, invoice_id, customer_id, amount_cents, currency, status, source, provider_payment_id, method, paid_at, description, created_at, updated_at";

function fail(operation: string, error: { message: string } | null): void {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

export function createReminderStore(): ReminderStore {
  const db = paymentsAdminClient();

  return {
    /*
      "Sent or overdue, and actually mailed" is the widest net worth casting:
      a draft was never charged, a cancelled invoice is not owed, and a paid
      one is done. Everything finer -- what is still outstanding, whether a
      collection is in flight, whether a human paused it -- is decided by
      `invoiceCollectionView`, the same function the admin screen asks.
    */
    async listCandidates(): Promise<ReminderCandidate[]> {
      const { data: invoiceRows, error } = await db
        .from("invoices")
        .select(invoiceColumns)
        .in("status", ["sent", "overdue"])
        .not("sent_at", "is", null)
        .order("due_date", { ascending: true });
      fail("Openstaande facturen laden", error);

      const invoices = ((invoiceRows ?? []) as unknown as InvoiceRow[]).map(invoiceFromRow);
      if (invoices.length === 0) return [];

      const invoiceIds = invoices.map((invoice) => invoice.id);
      const customerIds = [...new Set(invoices.map((invoice) => invoice.customer.customerId))];
      const serviceIds = [...new Set(invoices.flatMap((invoice) => (invoice.recurringServiceId ? [invoice.recurringServiceId] : [])))];

      const [paymentsResult, eventsResult, holdsResult, customersResult, servicesResult] = await Promise.all([
        db.from("payments").select(paymentColumns).in("invoice_id", invoiceIds),
        db.from("invoice_collection_events").select(collectionEventColumns).in("invoice_id", invoiceIds),
        db.from("invoice_collections").select("invoice_id, state").in("invoice_id", invoiceIds),
        db.from("customers").select("id, contact_name, email").in("id", customerIds),
        serviceIds.length > 0
          ? db.from("recurring_services").select("id, status").in("id", serviceIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      fail("Betalingen laden", paymentsResult.error);
      fail("Herinneringen laden", eventsResult.error);
      fail("Opvolgstatus laden", holdsResult.error);
      fail("Klanten laden", customersResult.error);
      fail("Diensten laden", servicesResult.error);

      const paymentsByInvoice = new Map<string, Payment[]>();
      for (const row of paymentsResult.data ?? []) {
        const payment = paymentFromRow(row);
        paymentsByInvoice.set(payment.invoiceId, [...(paymentsByInvoice.get(payment.invoiceId) ?? []), payment]);
      }

      const eventsByInvoice = new Map<string, CollectionEvent[]>();
      for (const row of (eventsResult.data ?? []) as CollectionEventRow[]) {
        const event = collectionEventFromRow(row);
        eventsByInvoice.set(event.invoiceId, [...(eventsByInvoice.get(event.invoiceId) ?? []), event]);
      }

      const stateByInvoice = new Map<string, CollectionState>(
        (holdsResult.data ?? []).map((row) => [row.invoice_id, row.state as CollectionState]),
      );
      const contactByCustomer = new Map(
        (customersResult.data ?? []).map((row) => [row.id, { contactName: row.contact_name, email: row.email }]),
      );
      /* Only a service that is actually collecting makes an invoice a direct
         debit one; a paused or cancelled service collects nothing. */
      const collectingServices = new Set(
        (servicesResult.data ?? []).filter((row) => row.status === "active").map((row) => row.id),
      );

      return invoices.map((invoice) => {
        const contact = contactByCustomer.get(invoice.customer.customerId);
        const state = stateByInvoice.get(invoice.id);
        return {
          invoice,
          payments: paymentsByInvoice.get(invoice.id) ?? [],
          events: eventsByInvoice.get(invoice.id) ?? [],
          ...(state ? { state } : {}),
          directDebit: Boolean(invoice.recurringServiceId && collectingServices.has(invoice.recurringServiceId)),
          /* Where the invoice actually went, falling back to the snapshot the
             document carries. Never guessed from anywhere else. */
          recipientEmail: invoice.recipientEmail ?? contact?.email ?? invoice.customer.email,
          contactName: contact?.contactName ?? invoice.customer.contactName,
        };
      });
    },

    /*
      Insert first and let the index decide. A second cron instance, a retry,
      or two workers at the same moment all end here: one inserts, the others
      get 23505 and read the row that exists.
    */
    async claim(key: ClaimKey) {
      const { data, error } = await db
        .from("invoice_collection_events")
        .insert({
          invoice_id: key.invoiceId,
          customer_id: key.customerId,
          stage: key.stage,
          eligible_on: key.eligibleOn,
          days_overdue: key.daysOverdue,
          recipient: key.recipientEmail,
          subject: key.subject,
          status: "pending",
          claimed_at: new Date().toISOString(),
        })
        .select("id")
        .maybeSingle();

      if (!error && data) return { claimed: true as const, id: data.id };
      if (error && error.code !== "23505") fail("Herinnering claimen", error);

      const { data: existing, error: readError } = await db
        .from("invoice_collection_events")
        .select("id, status, claimed_at")
        .eq("invoice_id", key.invoiceId)
        .eq("stage", key.stage)
        .maybeSingle();
      fail("Bestaande herinnering laden", readError);
      if (!existing) throw new Error("Herinnering claimen: geen rij gevonden na een dubbele sleutel.");

      const claim: ReminderClaim = {
        id: existing.id,
        status: existing.status as ReminderClaim["status"],
        claimedAt: existing.claimed_at,
      };
      return { claimed: false as const, existing: claim };
    },

    async markSent({ claimId, sentAt, messageId, communicationId }): Promise<void> {
      const { error } = await db
        .from("invoice_collection_events")
        .update({
          status: "sent",
          sent_at: sentAt,
          provider_message_id: messageId ?? null,
          communication_id: communicationId ?? null,
          error: null,
        })
        .eq("id", claimId);
      fail("Herinnering vastleggen", error);
    },

    async markFailed(id: string, reason: string): Promise<void> {
      const { error } = await db
        .from("invoice_collection_events")
        // The reason is the provider's own message; it carries no customer data.
        .update({ status: "failed", sent_at: null, error: reason.slice(0, 500) })
        .eq("id", id);
      fail("Mislukte herinnering vastleggen", error);
    },
  };
}
