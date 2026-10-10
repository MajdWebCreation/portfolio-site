import type { SupabaseClient } from "@supabase/supabase-js";
import { issueInvoiceDocument } from "@/lib/admin/invoices/issue";
import { invoiceColumns, invoiceFromRow, type InvoiceRow } from "@/lib/admin/invoices/mapper";
import type { Invoice } from "@/lib/admin/invoices/types";
import type { BillingPeriod } from "@/lib/payments/billing-period";
import { listPriceChangesForService } from "@/lib/payments/price-change";
import { amountForPeriod, endsInside, grossOf, lastTermOf, proratedNetCents } from "@/lib/payments/pricing";
import { isPendingPriceChange, type PriceChange, type RecurringService } from "@/lib/payments/types";
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

/**
 * The single line: the service, once, at the price that applies to *this*
 * period and its VAT rate. The price comes from the service's history, not
 * from the row's current amount: a change that starts with this period is
 * invoiced at the new figure, and a period before it keeps the old one,
 * whichever day the invoice happens to be made.
 */
export function recurringInvoiceLine(service: RecurringService, changes: readonly PriceChange[], period: BillingPeriod) {
  const billed = billedRange(service, period);
  const fullNet = amountForPeriod(service, changes, period.start);
  if (!billed.term) {
    return {
      description: `${service.name} — ${period.start} t/m ${period.end}`,
      quantityHundredths: 100,
      unitPriceCents: fullNet,
      vatRate: service.vatRate,
    };
  }
  /*
    The service ends inside this period. Billed for the days delivered, at
    the amount Mollie collects: the one fixed when Mollie was checked for
    this term (pro rata, or the full amount when Mollie had created the
    payment already), else the pro-rata figure the terms give.
  */
  return {
    description: `${service.name} — ${billed.start} t/m ${billed.end} (${billed.term.daysUsed} van ${billed.term.periodDays} dagen)`,
    quantityHundredths: 100,
    unitPriceCents: service.lastTerm?.amountCents ?? proratedNetCents(fullNet, billed.term),
    vatRate: service.vatRate,
  };
}

/** The range an invoice for this period covers: up to the last day of service when that falls inside it. */
export function billedRange(service: Pick<RecurringService, "endsOn">, period: BillingPeriod): BillingPeriod & { term?: ReturnType<typeof lastTermOf> } {
  if (!endsInside(period, service.endsOn)) return { start: period.start, end: period.end };
  const term = lastTermOf(period, service.endsOn!);
  return { start: period.start, end: service.endsOn!, term };
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

export type EnsureInvoiceOptions = {
  /**
   * The gross amount Mollie actually collected, when the caller is the
   * webhook. The invoice is then built at the figure that matches it, and
   * refused when none does: a term invoice never says one amount while the
   * collection says another.
   */
  collectedGrossCents?: number;
};

export async function ensureRecurringInvoice(
  db: SupabaseClient<Database>,
  service: RecurringService,
  period: BillingPeriod,
  todayKey: string,
  options: EnsureInvoiceOptions = {},
): Promise<Invoice> {
  /*
    One of the two callers got here first. Usually it is finished and this is
    simply its invoice; if its finalization was interrupted -- numbered, no
    stored PDF -- it is completed now rather than left to be discovered by a
    mail that cannot attach anything.
  */
  const already = await findRecurringInvoice(db, service.id, period.start);
  if (already) return already.issuedAt && already.document ? already : await issue(db, already);

  const { data: customer, error: customerError } = await db
    .from("customers")
    .select("company_name, contact_name, email, street, postal_code, city, country, kvk_number, vat_number")
    .eq("id", service.customerId)
    .single();
  fail("Klant laden", customerError);

  const { issueDate, dueDate } = recurringInvoiceDates(period, todayKey);
  const changes = await listPriceChangesForService(db, service.id);
  const line =
    options.collectedGrossCents === undefined
      ? recurringInvoiceLine(service, changes, period)
      : await reconciledLine(db, service, changes, period, options.collectedGrossCents);
  const range = billedRange(service, period);

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
      // Inherited, so the one-off project invoice and every month after it
      // sit on the same project page.
      project_id: service.projectId ?? null,
      billing_period_start: period.start,
      billing_period_end: range.end,
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
    p_lines: [line] as never,
  });
  fail("Factuurregel aanmaken", linesError);

  /*
    The definitive YM-F number and the one PDF, through exactly the path the
    admin's own "Definitief maken" takes: numbered from the same yearly
    sequence, payment reference settled against that number, the document
    rendered once and stored. A monthly term is a real invoice, and nobody
    approves one by hand -- so it is issued the moment it is created, and the
    mails that follow attach the file that was stored here.
  */
  const invoice = await findRecurringInvoice(db, service.id, period.start);
  if (!invoice) throw new Error("Factuur voor incasso aanmaken: niet terug te lezen.");
  return issue(db, invoice);
}

/** Issues a term through the shared two-step flow, or says why it could not. */
async function issue(db: SupabaseClient<Database>, invoice: Invoice): Promise<Invoice> {
  const issued = await issueInvoiceDocument(db, invoice.id);
  if (!issued.ok) throw new Error(`Periodefactuur uitgeven: ${issued.error}`);

  const stored = await findRecurringInvoice(db, invoice.recurringServiceId!, invoice.billingPeriodStart!);
  if (!stored) throw new Error("Periodefactuur uitgeven: niet terug te lezen.");
  return stored;
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

/**
 * The line for a period Mollie has just collected, at the amount it
 * collected.
 *
 * Normally that is simply the line the price history gives. Two states can
 * make the history ahead of Mollie: a planned price change that has not
 * reached the subscription yet (the collection is still at the old amount),
 * and a partial last period whose amount was not settled with Mollie yet.
 * In both the collection decides, and the figure it matches is the one
 * billed -- and for a last period, written down as the settled amount, so
 * the announcement says the same. A collection that matches no figure is
 * refused: an invoice is never made up to fit money that cannot be placed.
 */
async function reconciledLine(
  db: SupabaseClient<Database>,
  service: RecurringService,
  changes: readonly PriceChange[],
  period: BillingPeriod,
  collectedGrossCents: number,
): Promise<ReturnType<typeof recurringInvoiceLine>> {
  const settledChanges = changes.filter((change) => !(isPendingPriceChange(change) && !change.providerUpdatedAt));
  const candidates = [recurringInvoiceLine(service, changes, period), recurringInvoiceLine(service, settledChanges, period)];
  const unsettledLastTerm = endsInside(period, service.endsOn) && !service.lastTerm;
  if (unsettledLastTerm) {
    const fullNet = amountForPeriod(service, settledChanges, period.start);
    candidates.push({ ...candidates[1]!, unitPriceCents: fullNet });
  }

  const match = candidates.find((candidate) => grossOf(candidate.unitPriceCents, candidate.vatRate) === collectedGrossCents);
  if (!match) {
    throw new Error(
      `Incasso van ${collectedGrossCents} cent voor ${service.name} (${period.start}) past bij geen termijnbedrag van die periode; de factuur is niet aangemaakt.`,
    );
  }

  if (unsettledLastTerm) {
    // Mollie decided the last term's amount by collecting it; recorded as such.
    const { error } = await db
      .from("recurring_services")
      .update({ last_term_amount_cents: match.unitPriceCents, last_term_synced_at: new Date().toISOString() })
      .eq("id", service.id)
      .is("last_term_synced_at", null);
    fail("Laatste termijn vastleggen", error);
  }
  return match;
}
