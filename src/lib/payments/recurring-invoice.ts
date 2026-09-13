import type { SupabaseClient } from "@supabase/supabase-js";
import { invoiceColumns, invoiceFromRow, type InvoiceRow } from "@/lib/admin/invoices/mapper";
import type { Invoice } from "@/lib/admin/invoices/types";
import type { BillingPeriod } from "@/lib/payments/billing-period";
import type { RecurringService } from "@/lib/payments/types";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The one invoice for one billing period of one recurring service.
 *
 * Two callers reach this: the daily pass, fourteen days before a collection,
 * and the Mollie webhook when a charge arrives. Whichever gets there first
 * creates it; the other reads it back. There is never a second invoice for a
 * period, and never a second YM-F number, because the unique index on
 * (recurring_service_id, billing_period_start) decides that and not this
 * code.
 *
 * Dates, deliberately: the invoice is dated the day it is actually issued,
 * and falls due on the day the money is collected -- which for a monthly
 * service is the first day of the period. An invoice issued in advance
 * therefore reads "dated today, collected on the first". When a charge got
 * here before the announcement did, the collection day has already passed, so
 * the due date is today and the document is a receipt rather than a notice.
 */
export type RecurringInvoiceDates = { issueDate: string; dueDate: string };

export function recurringInvoiceDates(period: BillingPeriod, todayKey: string): RecurringInvoiceDates {
  return {
    issueDate: todayKey,
    // Never before the issue date; the invoice constraint says so too.
    dueDate: period.start > todayKey ? period.start : todayKey,
  };
}

/** The single line: the service, once, at its own price and VAT rate. */
function invoiceLine(service: RecurringService, period: BillingPeriod) {
  return {
    description: `${service.name} — ${period.start} t/m ${period.end}`,
    quantityHundredths: 100,
    unitPriceCents: service.amountCents,
    vatRate: service.vatRate,
  };
}

function fail(operation: string, error: { message: string } | null): void {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

export async function findRecurringInvoice(
  db: SupabaseClient<Database>,
  serviceId: string,
  periodStart: string,
): Promise<Invoice | undefined> {
  const { data, error } = await db
    .from("invoices")
    .select(invoiceColumns)
    .eq("recurring_service_id", serviceId)
    .eq("billing_period_start", periodStart)
    .maybeSingle();
  fail("Bestaande periodefactuur laden", error);
  return data ? invoiceFromRow(data as unknown as InvoiceRow) : undefined;
}

export async function ensureRecurringInvoice(
  db: SupabaseClient<Database>,
  service: RecurringService,
  period: BillingPeriod,
  todayKey: string,
): Promise<Invoice> {
  const already = await findRecurringInvoice(db, service.id, period.start);
  if (already) return already;

  const { data: customer, error: customerError } = await db
    .from("customers")
    .select("company_name, contact_name, email, street, postal_code, city, country, kvk_number, vat_number")
    .eq("id", service.customerId)
    .single();
  fail("Klant laden", customerError);

  const { issueDate, dueDate } = recurringInvoiceDates(period, todayKey);

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
      issue_date: issueDate,
      due_date: dueDate,
      payment_reference: "",
      notes: `Dit bedrag wordt automatisch geïncasseerd op ${dueDate}. U hoeft zelf niets over te maken.`,
    })
    .select("id")
    .maybeSingle();

  if (error || !created) {
    // The index refused a second invoice for this period; the first one is
    // the answer.
    if (error?.code === "23505") {
      const raced = await findRecurringInvoice(db, service.id, period.start);
      if (raced) return raced;
    }
    fail("Factuur voor incasso aanmaken", error);
    throw new Error("Factuur voor incasso aanmaken: geen rij teruggekregen.");
  }

  const { error: linesError } = await db.rpc("save_invoice_lines", {
    p_invoice_id: created.id,
    p_lines: [invoiceLine(service, period)] as never,
  });
  fail("Factuurregel aanmaken", linesError);

  // The definitive YM-F number, from the same yearly sequence as every other
  // invoice; a monthly term is a real invoice, not a note.
  const { data: number, error: numberError } = await db.rpc("assign_invoice_number", {
    p_invoice_id: created.id,
  });
  fail("Factuurnummer toekennen", numberError);

  const { error: referenceError } = await db
    .from("invoices")
    .update({ payment_reference: number ?? "" })
    .eq("id", created.id);
  fail("Betalingskenmerk bijwerken", referenceError);

  const invoice = await findRecurringInvoice(db, service.id, period.start);
  if (!invoice) throw new Error("Factuur voor incasso aanmaken: niet terug te lezen.");
  return invoice;
}

/** Marks the document as mailed, the same fields a manual send writes. */
export async function markInvoiceMailed(
  db: SupabaseClient<Database>,
  invoiceId: string,
  recipientEmail: string,
  sentAt: string,
): Promise<void> {
  const { error } = await db
    .from("invoices")
    .update({ sent_at: sentAt, recipient_email: recipientEmail })
    .eq("id", invoiceId);
  fail("Factuur als verzonden vastleggen", error);
}
