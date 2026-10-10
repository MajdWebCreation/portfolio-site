import { adminDb, failed } from "@/lib/admin/db";
import { paymentFromRow, prenotificationFromRow, recurringServiceFromRow } from "@/lib/payments/mapper";
import { listPriceChangesForCustomer, listPriceChangesForServices } from "@/lib/payments/price-change";
import type { ServiceAgreementRevision } from "@/lib/payments/service-agreement";
import { listAgreementRevisionsForCustomer, listAgreementRevisionsForService } from "@/lib/payments/service-agreement-revisions";
import type { DebitPrenotification, Payment, PriceChange, RecurringService } from "@/lib/payments/types";

/** Read access to payments and recurring services; admins only, as elsewhere. */
const paymentColumns =
  "id, invoice_id, customer_id, amount_cents, currency, status, source, provider_payment_id, method, paid_at, description, created_at, updated_at";

const recurringColumns =
  "id, customer_id, name, description, amount_cents, currency, vat_rate, billing_interval, starts_on, status, project_id, activation_invoice_id, mollie_subscription_id, subscription_canceled_at, ends_on, cancellation_requested_at, cancellation_notice_months, cancellation_minimum_term_months, cancellation_minimum_term_ends_on, cancellation_deviation_source_kind, cancellation_deviation_source_label, cancellation_deviation_agreed_on, cancellation_deviation_reason, cancellation_contractual_ends_on, cancellation_agreement_revision_id, cancellation_source, cancellation_proration_rule, last_term_amount_cents, last_term_synced_at, lifecycle_problem, created_at, updated_at";

export async function listPayments(): Promise<Payment[]> {
  const db = await adminDb();
  const { data, error } = await db.from("payments").select(paymentColumns).order("created_at", { ascending: false });
  failed("Betalingen laden", error);
  return (data ?? []).map(paymentFromRow);
}

export async function listPaymentsForCustomer(customerId: string): Promise<Payment[]> {
  const db = await adminDb();
  const { data, error } = await db
    .from("payments")
    .select(paymentColumns)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  failed("Betalingen van klant laden", error);
  return (data ?? []).map(paymentFromRow);
}

export async function listPaymentsForInvoice(invoiceId: string): Promise<Payment[]> {
  const db = await adminDb();
  const { data, error } = await db
    .from("payments")
    .select(paymentColumns)
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: false });
  failed("Betalingen van factuur laden", error);
  return (data ?? []).map(paymentFromRow);
}

export async function listRecurringServices(): Promise<RecurringService[]> {
  const db = await adminDb();
  const { data, error } = await db.from("recurring_services").select(recurringColumns).order("created_at");
  failed("Terugkerende diensten laden", error);
  return (data ?? []).map(recurringServiceFromRow);
}

export async function listRecurringServicesForCustomer(customerId: string): Promise<RecurringService[]> {
  const db = await adminDb();
  const { data, error } = await db
    .from("recurring_services")
    .select(recurringColumns)
    .eq("customer_id", customerId)
    .order("created_at");
  failed("Terugkerende diensten van klant laden", error);
  return (data ?? []).map(recurringServiceFromRow);
}

/**
 * The monthly services that belong to one project.
 *
 * Read by the project link itself rather than by filtering the customer's
 * services on a name, so a customer with two projects sees each project's own
 * services on its own page.
 */
export async function listRecurringServicesForProject(projectId: string): Promise<RecurringService[]> {
  const db = await adminDb();
  const { data, error } = await db
    .from("recurring_services")
    .select(recurringColumns)
    .eq("project_id", projectId)
    .order("created_at");
  failed("Terugkerende diensten van project laden", error);
  return (data ?? []).map(recurringServiceFromRow);
}

export async function getRecurringService(id: string): Promise<RecurringService | undefined> {
  const db = await adminDb();
  const { data, error } = await db.from("recurring_services").select(recurringColumns).eq("id", id).maybeSingle();
  failed("Terugkerende dienst laden", error);
  return data ? recurringServiceFromRow(data) : undefined;
}

/** Announcements already made, so the admin can see what was told and when. */
const prenotificationColumns =
  "id, recurring_service_id, customer_id, invoice_id, billing_period_start, billing_period_end, scheduled_debit_on, amount_cents, currency, recipient_email, status, provider_message_id, error, claimed_at, sent_at, created_at, updated_at";

export async function listPrenotifications(): Promise<DebitPrenotification[]> {
  const db = await adminDb();
  const { data, error } = await db
    .from("debit_prenotifications")
    .select(prenotificationColumns)
    .order("scheduled_debit_on", { ascending: false });
  failed("Vooraankondigingen laden", error);
  return (data ?? []).map(prenotificationFromRow);
}

export async function listPrenotificationsForCustomer(customerId: string): Promise<DebitPrenotification[]> {
  const db = await adminDb();
  const { data, error } = await db
    .from("debit_prenotifications")
    .select(prenotificationColumns)
    .eq("customer_id", customerId)
    .order("scheduled_debit_on", { ascending: false });
  failed("Vooraankondigingen van klant laden", error);
  return (data ?? []).map(prenotificationFromRow);
}

/** The price history of a customer's services, oldest effective date first. */
export async function listPriceChangesOfCustomer(customerId: string): Promise<PriceChange[]> {
  return listPriceChangesForCustomer(await adminDb(), customerId);
}

/** The price history of a set of services, for the overview screens. */
export async function listPriceChangesOfServices(serviceIds: readonly string[]): Promise<PriceChange[]> {
  return listPriceChangesForServices(await adminDb(), serviceIds);
}

/** The agreement revisions of one service, oldest first. */
export async function listAgreementRevisionsOfService(serviceId: string): Promise<ServiceAgreementRevision[]> {
  return listAgreementRevisionsForService(await adminDb(), serviceId);
}

/** The agreement revisions of a customer's services, oldest first. */
export async function listAgreementRevisionsOfCustomer(customerId: string): Promise<ServiceAgreementRevision[]> {
  return listAgreementRevisionsForCustomer(await adminDb(), customerId);
}
