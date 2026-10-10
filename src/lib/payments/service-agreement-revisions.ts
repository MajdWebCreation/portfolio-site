import type { SupabaseClient } from "@supabase/supabase-js";
import { agreementRevisionFromRow, type ServiceAgreementRow } from "@/lib/payments/mapper";
import {
  currentTermsSet,
  headRevision,
  resolveAgreementAt,
  staleAgreementReason,
  standardTermsSourceLabel,
  validateAgreementInput,
  type ResolvedAgreement,
  type ServiceAgreementInput,
  type ServiceAgreementRevision,
  type TermsSet,
} from "@/lib/payments/service-agreement";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Reading and extending a service's chain of agreement revisions.
 *
 * A revision is written once and never changed: a correction is a new
 * revision that supersedes the current head. The head the admin edited
 * from is passed back as `supersedesId`, and the database allows one
 * successor per revision, so of two admins saving at once the second is
 * told the terms changed under them -- the rule lives in the unique index,
 * and this module only turns its 23505 into a sentence.
 */
type Db = SupabaseClient<Database>;

export const agreementColumns =
  "id, recurring_service_id, customer_id, sequence, supersedes_id, effective_from, source_kind, source_quote_id, source_label, accepted_on, notice_months, minimum_term_months, proration_rule, special_terms, terms_edition, terms_published_on, note, created_by, created_at";

function fail(operation: string, error: { message: string } | null): void {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

export async function listAgreementRevisionsForService(db: Db, serviceId: string): Promise<ServiceAgreementRevision[]> {
  const { data, error } = await db
    .from("recurring_service_agreements")
    .select(agreementColumns)
    .eq("recurring_service_id", serviceId)
    .order("sequence", { ascending: true });
  fail("Dienstafspraken laden", error);
  return ((data ?? []) as ServiceAgreementRow[]).map(agreementRevisionFromRow);
}

export async function listAgreementRevisionsForCustomer(db: Db, customerId: string): Promise<ServiceAgreementRevision[]> {
  const { data, error } = await db
    .from("recurring_service_agreements")
    .select(agreementColumns)
    .eq("customer_id", customerId)
    .order("sequence", { ascending: true });
  fail("Dienstafspraken laden", error);
  return ((data ?? []) as ServiceAgreementRow[]).map(agreementRevisionFromRow);
}

/** The terms in force for one service on one day. */
export async function resolveServiceAgreement(db: Db, serviceId: string, dateKey: string): Promise<ResolvedAgreement> {
  return resolveAgreementAt(await listAgreementRevisionsForService(db, serviceId), dateKey);
}

export type RecordAgreementResult = { ok: true; revision: ServiceAgreementRevision } | { ok: false; reason: string };

/**
 * Appends a revision to a service's chain.
 *
 * Validated here in the same words the form shows, and again by the
 * database's own constraints: a deviation without a non-standard source,
 * an acceptance date missing or after the effective date, an offer of
 * another customer, a date before the predecessor's -- each is refused
 * whichever path reaches the table. The offer's number is read now and
 * kept on the revision as its label, so the revision keeps saying which
 * offer it meant after the offer is edited or gone.
 */
export async function recordAgreementRevision(
  db: Db,
  serviceId: string,
  input: ServiceAgreementInput,
  createdBy?: string,
): Promise<RecordAgreementResult> {
  const invalid = validateAgreementInput(input);
  if (invalid) return { ok: false, reason: invalid };

  const { data: service, error: serviceError } = await db.from("recurring_services").select("id, customer_id").eq("id", serviceId).maybeSingle();
  fail("Dienst laden", serviceError);
  if (!service) return { ok: false, reason: "Deze dienst bestaat niet (meer)." };

  const revisions = await listAgreementRevisionsForService(db, serviceId);
  const head = headRevision(revisions);
  if ((head?.id ?? undefined) !== (input.supersedesId ?? undefined)) return { ok: false, reason: staleAgreementReason };
  if (head && input.effectiveFrom < head.effectiveFrom) {
    return { ok: false, reason: `De ingangsdatum kan niet vóór die van de huidige afspraken liggen (${head.effectiveFrom}).` };
  }

  let sourceLabel = input.sourceLabel?.trim() ?? "";
  let sourceQuoteId: string | null = null;
  if (input.sourceKind === "standard_terms") {
    sourceLabel = standardTermsSourceLabel(input.terms);
  } else if (input.sourceKind === "accepted_offer" && input.sourceQuoteId) {
    const { data: quote, error: quoteError } = await db
      .from("quotes")
      .select("id, customer_id, number_value, number_provisional, status")
      .eq("id", input.sourceQuoteId)
      .maybeSingle();
    fail("Offerte laden", quoteError);
    if (!quote || quote.customer_id !== service.customer_id) return { ok: false, reason: "Deze offerte hoort niet bij de klant van deze dienst." };
    if (quote.number_provisional) return { ok: false, reason: `Offerte ${quote.number_value} is nog een concept en kan geen contractbron zijn.` };
    if (quote.status !== "accepted") return { ok: false, reason: `Offerte ${quote.number_value} staat niet op geaccepteerd; alleen de geaccepteerde offerte is bindend.` };
    sourceQuoteId = quote.id;
    sourceLabel = `Offerte ${quote.number_value}`;
  }

  const { data, error } = await db
    .from("recurring_service_agreements")
    .insert({
      recurring_service_id: service.id,
      customer_id: service.customer_id,
      supersedes_id: head?.id ?? null,
      effective_from: input.effectiveFrom,
      source_kind: input.sourceKind,
      source_quote_id: sourceQuoteId,
      source_label: sourceLabel,
      accepted_on: input.sourceKind === "standard_terms" ? null : (input.acceptedOn ?? null),
      notice_months: input.noticeMonths ?? null,
      minimum_term_months: input.minimumTermMonths ?? null,
      proration_rule: input.prorationRule ?? null,
      special_terms: input.specialTerms.trim(),
      terms_edition: input.terms?.edition ?? null,
      terms_published_on: input.terms?.publishedOn ?? null,
      note: input.note.trim(),
      created_by: createdBy ?? null,
    })
    .select(agreementColumns)
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, reason: staleAgreementReason };
    if (error.code === "23503") return { ok: false, reason: "De offerte of de dienst bestaat niet (meer), of hoort bij een andere klant." };
    return { ok: false, reason: error.message };
  }
  return { ok: true, revision: agreementRevisionFromRow(data as ServiceAgreementRow) };
}

/**
 * The first revision of a new service: the general terms as published
 * today, no deviation. Recorded when the service is made, so every service
 * carries which set of terms it started under; a deviation agreed in the
 * offer is the admin's to add, with its source.
 */
export function standardBaselineInput(effectiveFrom: string, terms: TermsSet, note: string): ServiceAgreementInput {
  return {
    effectiveFrom,
    sourceKind: "standard_terms",
    specialTerms: "",
    terms,
    note,
  };
}

export const newServiceBaselineNote = "Vastgelegd bij het aanmaken van de dienst: de standaard uit de algemene voorwaarden.";

export type NewRecurringService = {
  customerId: string;
  name: string;
  description: string;
  amountCents: number;
  vatRate: number;
  startsOn?: string;
  status: string;
  /** Today, in the administration's calendar: the baseline's effective date when the service has no start yet. */
  todayKey: string;
  /** The set of general terms the service is sold under today. */
  terms?: TermsSet;
};

export type CreateRecurringServiceResult = { ok: true; id: string } | { ok: false; error: { code?: string; message: string } };

/**
 * A service and its first agreement revision, in one database transaction
 * (`create_recurring_service`): either both exist afterwards or neither
 * does. The first revision is the standard under the set published today,
 * effective from the service's start, or from today when it has no start
 * yet; a service made through here is therefore never without the record
 * of which terms it began under.
 */
export async function createRecurringServiceWithAgreement(db: Db, input: NewRecurringService, createdBy?: string): Promise<CreateRecurringServiceResult> {
  const terms = input.terms ?? currentTermsSet();
  const baseline = standardBaselineInput(input.startsOn ?? input.todayKey, terms, newServiceBaselineNote);
  const invalid = validateAgreementInput(baseline);
  if (invalid) return { ok: false, error: { message: invalid } };

  const { data, error } = await db.rpc("create_recurring_service", {
    p_customer_id: input.customerId,
    p_name: input.name.trim(),
    p_description: input.description,
    p_amount_cents: input.amountCents,
    p_vat_rate: input.vatRate,
    p_starts_on: input.startsOn ?? null,
    p_status: input.status,
    p_effective_from: baseline.effectiveFrom,
    p_terms_edition: terms.edition,
    p_terms_published_on: terms.publishedOn,
    p_note: baseline.note,
    p_created_by: createdBy ?? null,
  });
  if (error) return { ok: false, error: { ...(error.code ? { code: error.code } : {}), message: error.message } };
  if (typeof data !== "string" || !data) return { ok: false, error: { message: "Dienst aanmaken mislukt." } };
  return { ok: true, id: data };
}
