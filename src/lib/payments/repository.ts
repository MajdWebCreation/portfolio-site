import { adminDb, failed } from "@/lib/admin/db";
import { paymentFromRow, recurringServiceFromRow } from "@/lib/payments/mapper";
import type { Payment, RecurringService } from "@/lib/payments/types";

/** Read access to payments and recurring services; admins only, as elsewhere. */
const paymentColumns =
  "id, invoice_id, customer_id, amount_cents, currency, status, source, provider_payment_id, method, paid_at, description, created_at, updated_at";

const recurringColumns =
  "id, customer_id, name, description, amount_cents, currency, vat_rate, billing_interval, starts_on, status, mollie_subscription_id, created_at, updated_at";

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

export async function getRecurringService(id: string): Promise<RecurringService | undefined> {
  const db = await adminDb();
  const { data, error } = await db.from("recurring_services").select(recurringColumns).eq("id", id).maybeSingle();
  failed("Terugkerende dienst laden", error);
  return data ? recurringServiceFromRow(data) : undefined;
}
