import type { CreditNoteState } from "@/lib/admin/credit-notes/settlement";
import { billingPeriod, nextPeriodStart, periodForCharge, type BillingPeriod } from "@/lib/payments/billing-period";
import { lastTermCredit } from "@/lib/payments/cancellation-credit";
import { cancellationOptions, type CancellationPlan } from "@/lib/payments/cancellation-plan";
import type { RecurringOverview } from "@/lib/payments/prenotification";
import {
  amountForPeriod,
  grossOf,
  lastTermOf,
  pendingPriceChange,
  priceChangeOptions,
  proratedNetCents,
  providerUpdateDay,
  standardProrationRule,
  type LastTerm,
  type PriceChangeOption,
  type ProrationRule,
} from "@/lib/payments/pricing";
import { resolveAgreementAt, type ResolvedAgreement } from "@/lib/payments/service-agreement";
import { recurringLifecycle, type PriceChange, type RecurringLifecycle, type RecurringService } from "@/lib/payments/types";

/**
 * Everything the admin screen says and offers about one monthly service,
 * worked out on the server from the service, its price history and its
 * invoices. The client component only renders this; it computes nothing, so
 * what it promises is exactly what the actions will do.
 */
export type ScheduledPriceChange = {
  changeId: string;
  newNetCents: number;
  newGrossCents: number;
  effectiveFrom: string;
  /** The day Mollie is updated and the first period at the new price is invoiced. */
  announceFrom: string;
  /** Mollie already holds the new amount. */
  providerUpdated: boolean;
  /** Only before Mollie was told. */
  withdrawable: boolean;
  /** Moved on from an earlier date because Mollie had created that period's payment. */
  rescheduledFrom?: string;
  /** Mollie could not be given the amount for any period; waits for the admin. */
  blockedReason?: string;
};

export type PriceChangeHistoryEntry = {
  oldNetCents: number;
  newNetCents: number;
  effectiveFrom: string;
  requestedAt: string;
  appliedAt?: string;
  providerUpdatedAt?: string;
  canceledAt?: string;
  canceledReason?: PriceChange["canceledReason"];
  rescheduledFrom?: string;
  blockedReason?: string;
};

export type ServiceEnding = {
  endsOn: string;
  requestedAt?: string;
  /**
   * Why this last day: the notice the cancellation was decided on, the day
   * that notice gives, and where the notice came from. Off the snapshot
   * the request wrote, so a later amendment of the agreement changes
   * nothing here. Absent for a cancellation planned before that snapshot
   * existed.
   */
  notice?: {
    months: number;
    minimumTermMonths?: number;
    minimumTermEndsOn?: string;
    contractualEndsOn: string;
    source: string;
    deviates: boolean;
    prorationRule: ProrationRule;
    /** The later agreement the deviation rests on, when recorded; always when the end lies inside the minimum term. */
    deviation?: NonNullable<RecurringService["cancellation"]>["deviation"];
  };
  /** The last period still collected, pro rata when partial. */
  lastTerm: LastTerm;
  lastDebitOn: string;
  /** What the last term is billed and collected at. */
  lastTermNetCents: number;
  lastTermGrossCents: number;
  /** Mollie was checked and, if needed, patched for the last term. */
  lastTermSynced: boolean;
  /**
   * Owed back: the full term was announced or created before the end was
   * known. Settled by a credit note -- `creditNote` once one exists -- and,
   * when the term was paid, by the refund against it. Until the note's
   * state says processed it is an open task the screen keeps in view.
   */
  creditDue?: { days: number; netCents: number; grossCents: number; creditNote?: CancellationCreditNote };
  /** Collections from today up to and including the last one. */
  collectionsAhead: string[];
  /** The day the daily job cancels the subscription at Mollie. */
  providerCancelFrom: string;
  subscriptionCanceledAt?: string;
};

/** The credit note that settles a cancellation credit, as the screen needs it. */
export type CancellationCreditNote = {
  id: string;
  number: string;
  /** Where the money side stands, from the ledger; see credit-notes/settlement. */
  state: CreditNoteState;
  remainingCents: number;
};

export type RecurringManagement = {
  lifecycle: RecurringLifecycle;
  /** The terms in force today: notice, proration, source, applicable set of general terms. */
  agreement: ResolvedAgreement;
  /** The price in effect for the period running today. */
  currentNetCents: number;
  currentGrossCents: number;
  vatRate: number;
  scheduled?: ScheduledPriceChange;
  /** Every change ever planned, newest first. */
  history: PriceChangeHistoryEntry[];
  /** The period starts a new price may begin on; empty when none can. */
  priceOptions: PriceChangeOption[];
  /** The ends offered: the contractual one first, then period ends after it. */
  cancellationOptions: CancellationPlan[];
  /** What the form needs to preview any other date the admin types. */
  planInput?: {
    startsOn: string;
    amountCents: number;
    vatRate: number;
    priceChanges: PriceChange[];
    billedPeriodStarts: string[];
    todayKey: string;
    noticeMonths: number;
    prorationRule: ProrationRule;
    minimumTermMonths?: number;
  };
  canChangePrice: boolean;
  canCancel: boolean;
  canWithdrawCancellation: boolean;
  ending?: ServiceEnding;
  lastBilledPeriod?: BillingPeriod;
  /** Something the admin has to look at: our dates and Mollie disagree. */
  warning?: string;
};

export function recurringManagement(input: {
  service: RecurringService;
  priceChanges: readonly PriceChange[];
  billedPeriodStarts: readonly string[];
  overview: RecurringOverview;
  todayKey: string;
  /** The credit note already made for this service's cancellation credit, when there is one. */
  cancellationCreditNote?: CancellationCreditNote;
  /** The service's agreement in force on `todayKey`; the standard when not given. */
  agreement?: ResolvedAgreement;
}): RecurringManagement {
  const { service, priceChanges, billedPeriodStarts, todayKey } = input;
  const agreement = input.agreement ?? resolveAgreementAt([], todayKey);
  const lifecycle = recurringLifecycle(service, todayKey);
  const anchor = service.startsOn;
  const collecting = Boolean(service.mollie.subscriptionId && anchor);
  const anchorDay = anchor ? Number(anchor.slice(8, 10)) : undefined;

  // The price for the period running today, off the history; before the
  // first collection that is the first period.
  const runningPeriodStart = anchor ? periodForCharge(anchor, todayKey).start : todayKey;
  const currentNetCents = amountForPeriod(service, priceChanges, runningPeriodStart);

  const pending = pendingPriceChange(priceChanges);
  const scheduled: ScheduledPriceChange | undefined =
    pending && (pending.effectiveFrom > todayKey || pending.blockedAt)
      ? {
          changeId: pending.id,
          newNetCents: pending.newAmountCents,
          newGrossCents: grossOf(pending.newAmountCents, service.vatRate),
          effectiveFrom: pending.effectiveFrom,
          announceFrom: providerUpdateDay(pending.effectiveFrom),
          providerUpdated: Boolean(pending.providerUpdatedAt),
          withdrawable: !pending.providerUpdatedAt,
          ...(pending.rescheduledFrom ? { rescheduledFrom: pending.rescheduledFrom } : {}),
          ...(pending.blockedReason ? { blockedReason: pending.blockedReason } : {}),
        }
      : undefined;

  const latestBilled = [...billedPeriodStarts].sort().at(-1);
  const lastBilledPeriod = latestBilled && anchorDay !== undefined ? billingPeriod(latestBilled, anchorDay) : undefined;

  const active = lifecycle === "active" || lifecycle === "cancellation_scheduled";
  const priceOptions =
    collecting && active && !pending
      ? priceChangeOptions({
          startsOn: anchor!,
          ...(service.endsOn ? { endsOn: service.endsOn } : {}),
          billedPeriodStarts,
          todayKey,
        })
      : [];

  const planInput =
    collecting && lifecycle === "active"
      ? {
          startsOn: anchor!,
          amountCents: service.amountCents,
          vatRate: service.vatRate,
          priceChanges: [...priceChanges],
          billedPeriodStarts: [...billedPeriodStarts],
          todayKey,
          noticeMonths: agreement.noticeMonths,
          prorationRule: agreement.prorationRule,
          ...(agreement.minimumTermMonths !== undefined ? { minimumTermMonths: agreement.minimumTermMonths } : {}),
        }
      : undefined;
  const options = planInput ? cancellationOptions(planInput) : [];

  const ending: ServiceEnding | undefined =
    service.endsOn && anchor && anchorDay !== undefined
      ? (() => {
          const lastPeriod = periodForCharge(anchor, service.endsOn!);
          const lastTerm = lastTermOf(lastPeriod, service.endsOn!);
          const fullNet = amountForPeriod(service, priceChanges, lastPeriod.start);
          // The rule this cancellation was decided on, off its snapshot.
          const proratedNet = proratedNetCents(fullNet, lastTerm, service.cancellation?.prorationRule ?? standardProrationRule);
          const synced = Boolean(service.lastTerm);
          const netCents = service.lastTerm?.amountCents ?? proratedNet;
          /*
            Credit is owed when the full term was announced or created before
            the end was known; one computation, shared with the credit note
            itself (cancellation-credit.ts).
          */
          const credit = lastTermCredit({ service, priceChanges, billedPeriodStarts });
          const collectsFull = Boolean(credit);
          const collectionsAhead: string[] = [];
          for (let start = anchor, guard = 0; start <= lastPeriod.start && guard < 1200; start = nextPeriodStart(start, anchorDay), guard += 1) {
            if (start >= todayKey) collectionsAhead.push(start);
          }
          return {
            endsOn: service.endsOn!,
            ...(service.cancellationRequestedAt ? { requestedAt: service.cancellationRequestedAt } : {}),
            ...(service.cancellation
              ? {
                  notice: {
                    months: service.cancellation.noticeMonths,
                    ...(service.cancellation.minimumTermMonths !== undefined ? { minimumTermMonths: service.cancellation.minimumTermMonths } : {}),
                    ...(service.cancellation.minimumTermEndsOn ? { minimumTermEndsOn: service.cancellation.minimumTermEndsOn } : {}),
                    ...(service.cancellation.deviation ? { deviation: service.cancellation.deviation } : {}),
                    contractualEndsOn: service.cancellation.contractualEndsOn,
                    source: service.cancellation.source,
                    deviates: service.cancellation.contractualEndsOn !== service.endsOn,
                    prorationRule: service.cancellation.prorationRule,
                  },
                }
              : {}),
            lastTerm,
            lastDebitOn: lastPeriod.start,
            lastTermNetCents: collectsFull ? fullNet : netCents,
            lastTermGrossCents: grossOf(collectsFull ? fullNet : netCents, service.vatRate),
            lastTermSynced: synced,
            ...(credit
              ? {
                  creditDue: {
                    days: credit.days,
                    netCents: credit.netCents,
                    grossCents: credit.grossCents,
                    ...(input.cancellationCreditNote ? { creditNote: input.cancellationCreditNote } : {}),
                  },
                }
              : {}),
            collectionsAhead,
            providerCancelFrom: lastPeriod.start >= todayKey ? nextDay(lastPeriod.start) : todayKey,
            ...(service.mollie.subscriptionCanceledAt ? { subscriptionCanceledAt: service.mollie.subscriptionCanceledAt } : {}),
          };
        })()
      : undefined;

  // The most urgent thing first: what the job could not do, then what the
  // admin still has to do. The credit also has its own row in the ending.
  const warning = (() => {
    if (service.lifecycleProblem) return service.lifecycleProblem;
    if (lifecycle === "ended" && service.mollie.subscriptionId && !service.mollie.subscriptionCanceledAt) {
      return "De dienst is beëindigd, maar het abonnement bij Mollie is nog niet geannuleerd. De dagelijkse taak probeert het opnieuw; controleer anders Mollie.";
    }
    if (ending?.creditDue && !ending.creditDue.creditNote) {
      return `Te crediteren: ${ending.creditDue.days} dagen na ${ending.endsOn} zijn te veel geïncasseerd. Maak de creditnota aan; daarna kun je terugbetalen.`;
    }
    if (ending?.creditDue?.creditNote && ending.creditDue.creditNote.state === "refund_due") {
      return `Creditnota ${ending.creditDue.creditNote.number} is aangemaakt; er moet nog worden terugbetaald.`;
    }
    if (input.overview.reason === "missing_anchor") return "Geen startdatum vastgelegd; de incassodatum is niet te bepalen.";
    return undefined;
  })();

  return {
    lifecycle,
    agreement,
    currentNetCents,
    currentGrossCents: grossOf(currentNetCents, service.vatRate),
    vatRate: service.vatRate,
    ...(scheduled ? { scheduled } : {}),
    history: [...priceChanges]
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
      .map((change) => ({
        oldNetCents: change.oldAmountCents,
        newNetCents: change.newAmountCents,
        effectiveFrom: change.effectiveFrom,
        requestedAt: change.requestedAt,
        ...(change.appliedAt ? { appliedAt: change.appliedAt } : {}),
        ...(change.providerUpdatedAt ? { providerUpdatedAt: change.providerUpdatedAt } : {}),
        ...(change.canceledAt ? { canceledAt: change.canceledAt } : {}),
        ...(change.canceledReason ? { canceledReason: change.canceledReason } : {}),
        ...(change.rescheduledFrom ? { rescheduledFrom: change.rescheduledFrom } : {}),
        ...(change.blockedReason ? { blockedReason: change.blockedReason } : {}),
      })),
    priceOptions,
    cancellationOptions: options,
    ...(planInput ? { planInput } : {}),
    canChangePrice: priceOptions.length > 0,
    canCancel: options.length > 0,
    canWithdrawCancellation: lifecycle === "cancellation_scheduled" && !service.mollie.subscriptionCanceledAt,
    ...(ending ? { ending } : {}),
    ...(lastBilledPeriod ? { lastBilledPeriod } : {}),
    ...(warning ? { warning } : {}),
  };
}

function nextDay(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
