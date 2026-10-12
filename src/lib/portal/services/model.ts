import type { BillingPeriod } from "@/lib/payments/billing-period";
import { minimumTermLastDay } from "@/lib/payments/cancellation-plan";
import { nextDebitSchedule, recurringOverview, type ServiceSchedule } from "@/lib/payments/prenotification";
import { grossOf, prorationRules, type PricedChange, type ProrationRule } from "@/lib/payments/pricing";
import { currentPeriodNetCents } from "@/lib/payments/recurring-management";
import {
  agreementSourceKindLabels,
  isAgreementSourceKind,
  resolveAgreementAt,
  revisionAt,
  standardTermsSourceLabel,
  type AgreementSourceKind,
  type ResolvedAgreement,
  type ServiceAgreementRevision,
} from "@/lib/payments/service-agreement";
import { recurringLifecycle, type RecurringLifecycle } from "@/lib/payments/types";
import { flag, integer, integerOrNull, records, text, textOrNull } from "@/lib/portal/json";
import type { Database } from "@/lib/supabase/database.types";

/**
 * A monthly service as the customer portal holds it: what portal_services
 * returns. No provider ids, no claims, no lifecycle problems, no notes on
 * the agreement, no provenance of a deviation.
 *
 * The figures are the admin's own, from the same helpers: the price of the
 * running period off the price history (currentPeriodNetCents), the next
 * collection off the billed periods (nextDebitSchedule, recurringOverview),
 * the terms in force off the agreement chain (resolveAgreementAt).
 */
type ServiceRow = Database["public"]["Functions"]["portal_services"]["Returns"][number];

export type PortalServiceStatus = "awaiting_mandate" | "active" | "paused" | "canceled";

export type PortalPriceChange = PricedChange & { applied: boolean };

export type PortalAgreement = {
  id: string;
  sequence: number;
  effectiveFrom: string;
  sourceKind: AgreementSourceKind;
  acceptedOn?: string;
  noticeMonths?: number;
  minimumTermMonths?: number;
  prorationRule?: ProrationRule;
  hasSpecialTerms: boolean;
  terms?: { edition: string; publishedOn: string };
};

export type PortalService = {
  id: string;
  name: string;
  status: PortalServiceStatus;
  /** The price in effect today, excl. VAT, as the service record holds it. */
  amountCents: number;
  vatRate: number;
  startsOn?: string;
  /** The last day of service, once the service was cancelled. */
  endsOn?: string;
  cancellationRequestedOn?: string;
  collectsByDirectDebit: boolean;
  /** The settled amount of a partial last term. */
  lastTermAmountCents?: number;
  billedPeriodStarts: string[];
  priceChanges: PortalPriceChange[];
  agreements: PortalAgreement[];
};

function serviceStatus(value: string): PortalServiceStatus {
  if (value === "awaiting_mandate" || value === "active" || value === "paused" || value === "canceled") return value;
  throw new Error(`dienststatus ${value}`);
}

function prorationRule(value: string | null): ProrationRule | undefined {
  if (value === null) return undefined;
  if ((prorationRules as readonly string[]).includes(value)) return value as ProrationRule;
  throw new Error(`prorateringsregel ${value}`);
}

export function serviceFromPortalRow(row: ServiceRow): PortalService {
  return {
    id: row.id,
    name: row.name,
    status: serviceStatus(row.status),
    amountCents: row.amount_cents,
    vatRate: row.vat_rate,
    ...(row.starts_on ? { startsOn: row.starts_on } : {}),
    ...(row.ends_on ? { endsOn: row.ends_on } : {}),
    ...(row.cancellation_requested_on ? { cancellationRequestedOn: row.cancellation_requested_on } : {}),
    collectsByDirectDebit: row.collects_by_direct_debit,
    ...(row.last_term_amount_cents !== null ? { lastTermAmountCents: row.last_term_amount_cents } : {}),
    billedPeriodStarts: [...row.billed_period_starts].sort(),
    priceChanges: records(row.price_changes, "prijswijzigingen").map((item) => {
      const applied = flag(item, "applied");
      const effectiveFrom = text(item, "effective_from");
      return {
        effectiveFrom,
        oldAmountCents: integer(item, "old_amount_cents"),
        newAmountCents: integer(item, "new_amount_cents"),
        applied,
        /* The portal receives only changes that are firm (applied, or held by the provider); applied is all pricing.ts needs to know of the rest. */
        ...(applied ? { appliedAt: effectiveFrom } : {}),
      };
    }),
    agreements: records(row.agreements, "afspraken").map((item) => {
      const kind = text(item, "source_kind");
      if (!isAgreementSourceKind(kind)) throw new Error(`bron ${kind}`);
      const acceptedOn = textOrNull(item, "accepted_on");
      const noticeMonths = integerOrNull(item, "notice_months");
      const minimumTermMonths = integerOrNull(item, "minimum_term_months");
      const rule = prorationRule(textOrNull(item, "proration_rule"));
      const edition = textOrNull(item, "terms_edition");
      const publishedOn = textOrNull(item, "terms_published_on");
      return {
        id: text(item, "id"),
        sequence: integer(item, "sequence"),
        effectiveFrom: text(item, "effective_from"),
        sourceKind: kind,
        ...(acceptedOn ? { acceptedOn } : {}),
        ...(noticeMonths !== null ? { noticeMonths } : {}),
        ...(minimumTermMonths !== null ? { minimumTermMonths } : {}),
        ...(rule ? { prorationRule: rule } : {}),
        hasSpecialTerms: flag(item, "has_special_terms"),
        ...(edition && publishedOn ? { terms: { edition, publishedOn } } : {}),
      };
    }),
  };
}

/**
 * The chain as the resolver reads it. What the portal does not receive --
 * the admin's note, the source label, the wording of a special arrangement
 * -- is left empty; the resolver only passes those through, it decides
 * nothing on them.
 */
function revisionsOf(service: PortalService): ServiceAgreementRevision[] {
  return service.agreements.map((agreement) => ({
    id: agreement.id,
    recurringServiceId: service.id,
    customerId: "",
    sequence: agreement.sequence,
    effectiveFrom: agreement.effectiveFrom,
    sourceKind: agreement.sourceKind,
    sourceLabel: agreement.sourceKind === "standard_terms" ? standardTermsSourceLabel(agreement.terms) : agreementSourceKindLabels[agreement.sourceKind],
    ...(agreement.acceptedOn ? { acceptedOn: agreement.acceptedOn } : {}),
    ...(agreement.noticeMonths !== undefined ? { noticeMonths: agreement.noticeMonths } : {}),
    ...(agreement.minimumTermMonths !== undefined ? { minimumTermMonths: agreement.minimumTermMonths } : {}),
    ...(agreement.prorationRule ? { prorationRule: agreement.prorationRule } : {}),
    specialTerms: "",
    ...(agreement.terms ? { terms: agreement.terms } : {}),
    note: "",
    createdAt: "",
  }));
}

/** The service as the collection schedule reads it; whether it collects is all it learns of the provider. */
function scheduleOf(service: PortalService): ServiceSchedule<PortalPriceChange> {
  return {
    service: {
      id: service.id,
      customerId: "",
      name: service.name,
      amountCents: service.amountCents,
      vatRate: service.vatRate,
      status: service.status,
      ...(service.startsOn ? { startsOn: service.startsOn } : {}),
      ...(service.endsOn ? { endsOn: service.endsOn } : {}),
      ...(service.lastTermAmountCents !== undefined ? { lastTerm: { amountCents: service.lastTermAmountCents, syncedAt: "" } } : {}),
      mollie: service.collectsByDirectDebit ? { subscriptionId: collectingAtProvider } : {},
    },
    billedPeriodStarts: service.billedPeriodStarts,
    priceChanges: service.priceChanges,
  };
}

/* Stands in for the provider's id, which the portal never receives; only its presence is read. */
const collectingAtProvider = "collecting";

export type PortalServiceState = "awaiting_mandate" | "paused" | "active" | "cancellation_scheduled" | "ended";

export const portalServiceStateLabels: Record<PortalServiceState, string> = {
  awaiting_mandate: "Wacht op machtiging",
  paused: "Gepauzeerd",
  active: "Actief",
  cancellation_scheduled: "Opgezegd",
  ended: "Beëindigd",
};

export const portalServiceStateTone: Record<PortalServiceState, "neutral" | "accent" | "success" | "danger"> = {
  awaiting_mandate: "accent",
  paused: "neutral",
  active: "success",
  cancellation_scheduled: "accent",
  ended: "neutral",
};

export type PortalServiceView = {
  service: PortalService;
  lifecycle: RecurringLifecycle;
  state: PortalServiceState;
  currentNetCents: number;
  currentGrossCents: number;
  /** The next direct debit, when one is scheduled. */
  next?: { debitOn: string; grossCents: number; period: BillingPeriod };
  /** A new price that is firm -- the provider holds it -- and not in effect yet. */
  scheduledChange?: { effectiveFrom: string; newNetCents: number; newGrossCents: number };
  /** Prices that took effect, newest first. */
  priceHistory: { effectiveFrom: string; oldNetCents: number; newNetCents: number }[];
  agreement: ResolvedAgreement;
  /** Whether the revision in force records a special arrangement; its wording is in the source document. */
  hasSpecialTerms: boolean;
  /** Last day of an agreed minimum term, when there is one. */
  minimumTermEndsOn?: string;
};

export function portalServiceView(service: PortalService, todayKey: string): PortalServiceView {
  const lifecycle = recurringLifecycle(service, todayKey);
  const state: PortalServiceState =
    lifecycle === "other" ? (service.status === "paused" ? "paused" : "awaiting_mandate") : lifecycle;

  const currentNetCents = currentPeriodNetCents(service, service.priceChanges, todayKey);
  const schedule = scheduleOf(service);
  const plan = nextDebitSchedule(schedule);
  const overview = recurringOverview(schedule, [], todayKey);
  /* A collection date already behind us is not "next" to a customer, whatever the schedule still expects. */
  const next =
    "reason" in plan || !overview.debitOn || overview.amountCents === undefined || overview.debitOn < todayKey
      ? undefined
      : { debitOn: overview.debitOn, grossCents: overview.amountCents, period: plan.period };

  const pending = service.priceChanges.find((change) => !change.applied && change.effectiveFrom > todayKey);
  const revisions = revisionsOf(service);
  const agreement = resolveAgreementAt(revisions, todayKey);
  const inForce = revisionAt(revisions, todayKey);

  return {
    service,
    lifecycle,
    state,
    currentNetCents,
    currentGrossCents: grossOf(currentNetCents, service.vatRate),
    ...(next ? { next } : {}),
    ...(pending
      ? { scheduledChange: { effectiveFrom: pending.effectiveFrom, newNetCents: pending.newAmountCents, newGrossCents: grossOf(pending.newAmountCents, service.vatRate) } }
      : {}),
    priceHistory: service.priceChanges
      .filter((change) => change.applied || change.effectiveFrom <= todayKey)
      .map((change) => ({ effectiveFrom: change.effectiveFrom, oldNetCents: change.oldAmountCents, newNetCents: change.newAmountCents }))
      .reverse(),
    agreement,
    hasSpecialTerms: Boolean(inForce && service.agreements.find((item) => item.id === inForce.id)?.hasSpecialTerms),
    ...(agreement.minimumTermMonths !== undefined && service.startsOn
      ? { minimumTermEndsOn: minimumTermLastDay(service.startsOn, agreement.minimumTermMonths) }
      : {}),
  };
}

/** The soonest scheduled collection across services, for the overview. */
export function nextCollection(views: readonly PortalServiceView[]): (PortalServiceView & { next: NonNullable<PortalServiceView["next"]> }) | undefined {
  return views
    .filter((view): view is PortalServiceView & { next: NonNullable<PortalServiceView["next"]> } => Boolean(view.next))
    .sort((a, b) => a.next.debitOn.localeCompare(b.next.debitOn))[0];
}
