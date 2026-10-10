import { isDateKey } from "@/lib/admin/format";
import { termsDocument } from "@/lib/content/terms";
import { prorationRules, type ProrationRule } from "@/lib/payments/pricing";

/**
 * The contract terms of a recurring service: what applies, where it comes
 * from, and since when.
 *
 * Pure. The rows are `recurring_service_agreements`, a chain of immutable
 * revisions per service; this module reads a chain and answers "which terms
 * applied on day X", the way `amountForPeriod` answers it for the price.
 * Only what the general terms leave open is a term here -- the notice
 * period, a minimum term, how a partial last term is billed, a specific
 * arrangement -- plus the provenance: the source of the terms and the set
 * of general terms that applies. Price, VAT, start and calendar are not
 * terms here, because each already has its one owner elsewhere.
 *
 * Standard versus deviation: a revision's term is `undefined` when it is
 * simply what the general terms say, and that standard is known per edition
 * of the terms (`standardTermsFor`). A deviation carries its source, so the
 * admin screen can say "Afwijkend: 2 kalendermaanden -- offerte YM-O-...,
 * geaccepteerd 12 september 2026" without the standard ever having been
 * copied in as if it were an arrangement of its own.
 */
export type AgreementSourceKind = "standard_terms" | "accepted_offer" | "later_written_amendment";

export const agreementSourceKinds: readonly AgreementSourceKind[] = ["standard_terms", "accepted_offer", "later_written_amendment"];

export const agreementSourceKindLabels: Record<AgreementSourceKind, string> = {
  standard_terms: "Algemene voorwaarden",
  accepted_offer: "Geaccepteerde offerte",
  later_written_amendment: "Latere schriftelijke afspraak",
};

export function isAgreementSourceKind(value: string): value is AgreementSourceKind {
  return (agreementSourceKinds as readonly string[]).includes(value);
}

/** A set of the general terms, identified as the register in docs/legal/voorwaarden does. */
export type TermsSet = { edition: string; publishedOn: string };

/**
 * What the screen says when no set is recorded. A set is never assumed: a
 * set published later does not apply to an existing agreement by itself
 * (art. 29.1), and which set an older agreement was made under is not in
 * the data. The standard rules still apply through `standardTermsFor`;
 * only the claim about *which* set is withheld.
 */
export const unknownTermsLabel = "Voorwaardenversie niet historisch vastgesteld";

/** The set published now: the default for a new revision, never applied to an old one. */
export function currentTermsSet(): TermsSet {
  return { edition: termsDocument.edition, publishedOn: termsDocument.dateIso };
}

/** "B2B 2026", as the agreement block shows it. */
export function termsSetLabel(set: TermsSet): string {
  return `B2B ${set.edition}`;
}

/** How a revision based on the general terms alone names its source. */
export function standardTermsSourceLabel(set: Pick<TermsSet, "edition"> | undefined): string {
  return set ? `Algemene Voorwaarden B2B ${set.edition}` : "Algemene voorwaarden, versie niet historisch vastgesteld";
}

export type ServiceAgreementRevision = {
  id: string;
  recurringServiceId: string;
  customerId: string;
  /** Position in the service's chain, from 1. */
  sequence: number;
  supersedesId?: string;
  /** The first day these terms apply. */
  effectiveFrom: string;
  sourceKind: AgreementSourceKind;
  /** The offer named as source, while it exists. */
  sourceQuoteId?: string;
  /** How the source reads, fixed when the revision was made. */
  sourceLabel: string;
  /** The day the offer or the amendment was accepted; absent for the general terms. */
  acceptedOn?: string;
  /** Deviations from the standard; absent means the general terms' standard. */
  noticeMonths?: number;
  minimumTermMonths?: number;
  prorationRule?: ProrationRule;
  specialTerms: string;
  /** The set of general terms this revision was made under; absent when not historically established. */
  terms?: TermsSet;
  note: string;
  createdBy?: string;
  createdAt: string;
};

/**
 * What the general terms give a continuing hosting or management service
 * when the offer says nothing else. Edition 2026: one calendar month's
 * notice (art. 25.1, A4.2), the fee stops at the actual end (A4.3) so a
 * partial last term is billed pro rata by days, monthly in advance (art.
 * 12), and no minimum term. Keyed by edition so a later edition with
 * other defaults is a new entry here, not a changed one.
 */
export type StandardTerms = {
  noticeMonths: number;
  prorationRule: ProrationRule;
  billing: { frequency: "monthly"; inAdvance: true };
};

const standardTermsByEdition: Record<string, StandardTerms> = {
  "2026": { noticeMonths: 1, prorationRule: "pro_rata_days", billing: { frequency: "monthly", inAdvance: true } },
};

export function standardTermsFor(edition: string | undefined): StandardTerms {
  // An edition this code does not know yet keeps the latest known standard;
  // adding the edition here is part of publishing it. No edition at all --
  // the set is not historically established -- gets the same rules: they
  // are what the lifecycle has always applied, and saying so claims
  // nothing about which set was made available with the agreement.
  return (edition !== undefined ? standardTermsByEdition[edition] : undefined) ?? standardTermsByEdition["2026"]!;
}

/** The terms that apply on one day, with for each one whether it is the standard or a deviation. */
export type ResolvedAgreement = {
  /** The revision these terms were read from; absent when the service has none and the standard applies. */
  revision?: Pick<ServiceAgreementRevision, "id" | "sequence" | "effectiveFrom" | "note" | "createdAt">;
  source: { kind: AgreementSourceKind; label: string; acceptedOn?: string };
  /** Absent when the applicable set is not historically established. */
  terms?: TermsSet;
  noticeMonths: number;
  noticeIsStandard: boolean;
  /** Absent when there is none. */
  minimumTermMonths?: number;
  prorationRule: ProrationRule;
  prorationIsStandard: boolean;
  specialTerms: string;
  billing: StandardTerms["billing"];
};

/**
 * The revision in force on `dateKey`: the highest sequence whose
 * effective_from is on or before that day. A revision taking effect on the
 * day itself counts from that day -- so a request on 1 February uses a
 * revision effective 1 February, and one on 31 January does not.
 */
export function revisionAt(revisions: readonly ServiceAgreementRevision[], dateKey: string): ServiceAgreementRevision | undefined {
  return revisions
    .filter((revision) => revision.effectiveFrom <= dateKey)
    .reduce<ServiceAgreementRevision | undefined>((best, revision) => (!best || revision.sequence > best.sequence ? revision : best), undefined);
}

/** The latest revision of a chain, which a new one must supersede. */
export function headRevision(revisions: readonly ServiceAgreementRevision[]): ServiceAgreementRevision | undefined {
  return revisions.reduce<ServiceAgreementRevision | undefined>((best, revision) => (!best || revision.sequence > best.sequence ? revision : best), undefined);
}

export function resolveAgreementAt(revisions: readonly ServiceAgreementRevision[], dateKey: string): ResolvedAgreement {
  const revision = revisionAt(revisions, dateKey);
  const terms = revision?.terms;
  const standard = standardTermsFor(terms?.edition);
  if (!revision) {
    // Nothing recorded for this day: the standard rules, and no claim about
    // which set of terms. A service made through the application always
    // has a first revision; this is the legacy or incomplete case.
    return {
      source: { kind: "standard_terms", label: standardTermsSourceLabel(undefined) },
      noticeMonths: standard.noticeMonths,
      noticeIsStandard: true,
      prorationRule: standard.prorationRule,
      prorationIsStandard: true,
      specialTerms: "",
      billing: standard.billing,
    };
  }
  return {
    revision: { id: revision.id, sequence: revision.sequence, effectiveFrom: revision.effectiveFrom, note: revision.note, createdAt: revision.createdAt },
    source: { kind: revision.sourceKind, label: revision.sourceLabel, ...(revision.acceptedOn ? { acceptedOn: revision.acceptedOn } : {}) },
    ...(terms ? { terms } : {}),
    noticeMonths: revision.noticeMonths ?? standard.noticeMonths,
    noticeIsStandard: revision.noticeMonths === undefined,
    ...(revision.minimumTermMonths !== undefined ? { minimumTermMonths: revision.minimumTermMonths } : {}),
    prorationRule: revision.prorationRule ?? standard.prorationRule,
    prorationIsStandard: revision.prorationRule === undefined,
    specialTerms: revision.specialTerms,
    billing: standard.billing,
  };
}

/** Whether a revision deviates from the standard in anything. */
export function hasDeviation(
  revision: Pick<ServiceAgreementRevision, "noticeMonths" | "minimumTermMonths" | "prorationRule" | "specialTerms">,
): boolean {
  return (
    revision.noticeMonths !== undefined ||
    revision.minimumTermMonths !== undefined ||
    revision.prorationRule !== undefined ||
    revision.specialTerms.trim() !== ""
  );
}

// ------------------------------------------------------------------ labels

/** "1 kalendermaand", "2 kalendermaanden". */
export function noticeLabel(months: number): string {
  return `${months} ${months === 1 ? "kalendermaand" : "kalendermaanden"}`;
}

export function minimumTermLabel(months: number | undefined): string {
  if (months === undefined) return "Geen";
  return `${months} ${months === 1 ? "maand" : "maanden"}`;
}

export const prorationRuleLabels: Record<ProrationRule, string> = {
  pro_rata_days: "Laatste termijn naar rato van de dagen",
  none: "Laatste termijn volledig",
};

export function billingLabel(billing: StandardTerms["billing"]): string {
  return billing.frequency === "monthly" && billing.inAdvance ? "Maandelijks vooraf" : "Maandelijks";
}

// ----------------------------------------------------------------- history

export type AgreementChange = { label: string; from: string; to: string };

export type AgreementHistoryEntry = {
  revision: ServiceAgreementRevision;
  /** What this revision changed against its predecessor; empty for a first revision that only restates the standard. */
  changes: AgreementChange[];
  first: boolean;
};

function describe(revision: ServiceAgreementRevision | undefined, standard: StandardTerms) {
  return {
    notice: noticeLabel(revision?.noticeMonths ?? standard.noticeMonths) + (revision?.noticeMonths === undefined ? " (standaard)" : ""),
    minimumTerm: minimumTermLabel(revision?.minimumTermMonths),
    proration: prorationRuleLabels[revision?.prorationRule ?? standard.prorationRule] + (revision?.prorationRule === undefined ? " (standaard)" : ""),
    specialTerms: revision?.specialTerms.trim() || "Geen",
    terms: revision ? (revision.terms ? `${termsSetLabel(revision.terms)}, gepubliceerd ${revision.terms.publishedOn}` : unknownTermsLabel) : "—",
    source: revision ? `${agreementSourceKindLabels[revision.sourceKind]}: ${revision.sourceLabel}` : "—",
  };
}

/** Every revision, newest first, each with what it changed. */
export function agreementHistory(revisions: readonly ServiceAgreementRevision[]): AgreementHistoryEntry[] {
  const ordered = [...revisions].sort((a, b) => a.sequence - b.sequence);
  return ordered
    .map((revision, index) => {
      const previous = ordered[index - 1];
      const standard = standardTermsFor(revision.terms?.edition);
      const before = describe(previous, standardTermsFor(previous?.terms?.edition ?? revision.terms?.edition));
      const after = describe(revision, standard);
      const changes: AgreementChange[] = [];
      if (previous) {
        const compare = (label: string, from: string, to: string) => {
          if (from !== to) changes.push({ label, from, to });
        };
        compare("Opzegtermijn", before.notice, after.notice);
        compare("Minimale looptijd", before.minimumTerm, after.minimumTerm);
        compare("Proratering", before.proration, after.proration);
        compare("Bijzondere afspraak", before.specialTerms, after.specialTerms);
        compare("Voorwaarden", before.terms, after.terms);
        compare("Bron", before.source, after.source);
      }
      return { revision, changes, first: !previous };
    })
    .reverse();
}

// -------------------------------------------------------------- validation

/** What the admin records; the server validates it again before writing. */
export type ServiceAgreementInput = {
  effectiveFrom: string;
  sourceKind: AgreementSourceKind;
  /** The offer the terms come from; its number becomes the label. */
  sourceQuoteId?: string;
  /** How the source reads when it is not an offer in this system. */
  sourceLabel?: string;
  acceptedOn?: string;
  /** Absent means the standard. */
  noticeMonths?: number;
  minimumTermMonths?: number;
  prorationRule?: ProrationRule;
  specialTerms: string;
  /** The set of general terms; absent when it is not historically established. */
  terms?: TermsSet;
  note: string;
  /** The revision the admin edited from: the chain's head, or absent when the service has none yet. */
  supersedesId?: string;
};

export const deviationNeedsSourceReason =
  "Een afwijkende afspraak heeft een bron: de geaccepteerde offerte of een latere schriftelijke afspraak, niet de algemene voorwaarden zelf.";
export const staleAgreementReason = "De afspraken zijn intussen gewijzigd. Ververs de pagina en probeer het opnieuw.";

function isWholeMonths(value: number, max: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= max;
}

/** The rules the database also enforces, in the words the form shows. */
export function validateAgreementInput(input: ServiceAgreementInput): string | null {
  if (!isDateKey(input.effectiveFrom)) return "De ingangsdatum is geen geldige datum.";
  if (!isAgreementSourceKind(input.sourceKind)) return "Kies een geldige bron.";
  if (input.noticeMonths !== undefined && !isWholeMonths(input.noticeMonths, 24)) return "De opzegtermijn is een geheel aantal kalendermaanden, van 1 tot 24.";
  if (input.minimumTermMonths !== undefined && !isWholeMonths(input.minimumTermMonths, 60)) return "De minimale looptijd is een geheel aantal maanden, van 1 tot 60.";
  if (input.prorationRule !== undefined && !(prorationRules as readonly string[]).includes(input.prorationRule)) return "Kies een geldige prorateringsregel.";
  if (input.terms) {
    if (!/^\d{4}$/.test(input.terms.edition)) return "De editie van de voorwaarden is een jaartal.";
    if (!isDateKey(input.terms.publishedOn)) return "De publicatiedatum van de voorwaarden is geen geldige datum.";
  }

  const deviates = hasDeviation(input);
  if (input.sourceKind === "standard_terms") {
    if (deviates) return deviationNeedsSourceReason;
    if (input.acceptedOn) return "De algemene voorwaarden hebben geen eigen acceptatiedatum; kies een offerte of afspraak als bron.";
    if (input.sourceQuoteId) return "Een offerte als bron is een geaccepteerde offerte; kies die bronsoort.";
    return null;
  }
  if (!input.acceptedOn || !isDateKey(input.acceptedOn)) return "Vul de datum in waarop de klant de afspraak heeft geaccepteerd.";
  if (input.acceptedOn > input.effectiveFrom) return "De afspraak kan niet eerder ingaan dan ze is geaccepteerd.";
  if (input.sourceKind === "later_written_amendment") {
    if (input.sourceQuoteId) return "Een latere schriftelijke afspraak verwijst niet naar een offerte; kies dan de offerte als bron.";
    if (!input.sourceLabel?.trim()) return "Omschrijf de bron van de afspraak, bijvoorbeeld de e-mail of brief waarin ze is bevestigd.";
  }
  if (input.sourceKind === "accepted_offer" && !input.sourceQuoteId && !input.sourceLabel?.trim()) {
    return "Kies de geaccepteerde offerte, of vermeld het offertenummer wanneer die niet in dit systeem staat.";
  }
  return null;
}
