import { addDays, daysBetween } from "@/lib/admin/documents/validation";
import { calculateTotals, roundHalfUp, type Cents } from "@/lib/money";
import { nextPeriodStart, type BillingPeriod } from "@/lib/payments/billing-period";
import { prenotificationDays } from "@/lib/payments/collection-policy";
import { isPendingPriceChange, type PriceChange, type RecurringService } from "@/lib/payments/types";

/**
 * What a service costs in a given period, and when a new price may start.
 *
 * Pure. The price history (`recurring_price_changes`) is the truth about
 * amounts: the latest change effective by a period's start says what that
 * period costs, and before any change the first change's old amount does.
 * `RecurringService.amountCents` is only "the price in effect today", kept
 * that way by the daily job -- so this module is what the invoice, the
 * announcement and the admin screen all read, and none of them can disagree
 * about a period by a cent.
 */

/**
 * Changes that count: carried out or still to come. Never one that was
 * withdrawn or lapsed, and never one that is blocked -- Mollie could not be
 * given its amount, so no period may be billed at it.
 */
function effective(changes: readonly PriceChange[]): PriceChange[] {
  return changes
    .filter((change) => !change.canceledAt && !(change.blockedAt && !change.appliedAt))
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

/** The net amount (excl. VAT) for the period starting on `periodStart`. */
export function amountForPeriod(
  service: Pick<RecurringService, "amountCents">,
  changes: readonly PriceChange[],
  periodStart: string,
): Cents {
  const history = effective(changes);
  const latest = [...history].reverse().find((change) => change.effectiveFrom <= periodStart);
  if (latest) return latest.newAmountCents;
  const first = history[0];
  return first ? first.oldAmountCents : service.amountCents;
}

/**
 * The gross amount (incl. VAT) for a period: what Mollie collects and what
 * the term invoice totals. Through `calculateTotals`, the one VAT
 * arithmetic, so the two cannot differ by a rounded cent.
 */
export function chargeForPeriod(
  service: Pick<RecurringService, "amountCents" | "vatRate">,
  changes: readonly PriceChange[],
  periodStart: string,
): Cents {
  return grossOf(amountForPeriod(service, changes, periodStart), service.vatRate);
}

export function grossOf(netCents: Cents, vatRate: number): Cents {
  return calculateTotals([{ quantityHundredths: 100, unitPriceCents: netCents, vatRate }]).totalCents;
}

/** The one change still in flight for a service, if any. */
export function pendingPriceChange(changes: readonly PriceChange[]): PriceChange | undefined {
  return changes.find(isPendingPriceChange);
}

/**
 * The first period a new price can apply to.
 *
 * The same rule as the first collection of a new subscription, for the same
 * reason: the period after everything already billed, and never one whose
 * collection is less than fourteen days from tomorrow. A period whose term
 * invoice exists was announced at its price and keeps it; a period inside
 * the announcement window cannot be announced at a new price in time. The
 * months in between simply stay at the old price.
 */
export function firstAnnounceablePeriodStart(input: {
  anchor: string;
  billedPeriodStarts: readonly string[];
  todayKey: string;
}): string {
  // Fourteen days, counted from tomorrow: today's announcement run may have gone.
  const earliest = addDays(addDays(input.todayKey, 1), prenotificationDays);
  const anchorDay = Number(input.anchor.slice(8, 10));
  const latestBilled = [...input.billedPeriodStarts].sort().at(-1);

  let date = latestBilled ? nextPeriodStart(latestBilled, anchorDay) : input.anchor;
  // Monthly steps; the guard is a decade, far past any real case.
  for (let guard = 0; date < earliest && guard < 120; guard += 1) {
    date = nextPeriodStart(date, anchorDay);
  }
  return date;
}

export type PriceChangeOption = {
  /** The period start the new price would first apply to. */
  effectiveFrom: string;
  /** The day Mollie is updated and that period's invoice is announced. */
  announceFrom: string;
};

/**
 * The period starts an admin may pick as the effective date: the earliest
 * one and the months after it, on the service's own calendar, and never past
 * the service's end once one is planned.
 */
export function priceChangeOptions(
  input: { startsOn: string; endsOn?: string; billedPeriodStarts: readonly string[]; todayKey: string },
  count = 6,
): PriceChangeOption[] {
  const anchorDay = Number(input.startsOn.slice(8, 10));
  const options: PriceChangeOption[] = [];
  let date = firstAnnounceablePeriodStart({
    anchor: input.startsOn,
    billedPeriodStarts: input.billedPeriodStarts,
    todayKey: input.todayKey,
  });
  for (let guard = 0; options.length < count && guard < 120; guard += 1) {
    if (input.endsOn && date > input.endsOn) break;
    options.push({ effectiveFrom: date, announceFrom: providerUpdateDay(date) });
    date = nextPeriodStart(date, anchorDay);
  }
  return options;
}

/**
 * The day Mollie is given the new amount: fourteen days before the first
 * collection at that amount, the same day that collection is announced.
 *
 * Chosen for the two things that have to be true at the provider, and both
 * are true by a wide margin on that day. The previous collection, at the old
 * amount, is a month earlier and long final -- a failed direct debit is
 * reported within days, so Mollie is not retrying it at a new amount. And
 * the next collection has not been created: Mollie creates subscription
 * payments shortly before their date, and "the amount for future payments"
 * (update-subscription reference) only reaches payments not yet created.
 */
export function providerUpdateDay(effectiveFrom: string): string {
  return addDays(effectiveFrom, -prenotificationDays);
}

export function isProviderUpdateDue(change: Pick<PriceChange, "effectiveFrom">, todayKey: string): boolean {
  return todayKey >= providerUpdateDay(change.effectiveFrom);
}

/**
 * Whether the price on the service itself may be switched over: Mollie has
 * the new amount and the first period at that amount has begun.
 */
export function isLocalApplyDue(
  change: Pick<PriceChange, "effectiveFrom" | "providerUpdatedAt">,
  todayKey: string,
): boolean {
  return Boolean(change.providerUpdatedAt) && todayKey >= change.effectiveFrom;
}

// ------------------------------------------------------------ pro rata

/**
 * A period that is only partly delivered because the service ends inside
 * it: the general terms give one month's notice and "na daadwerkelijke
 * beëindiging stopt het maandbedrag" (A4.3), so the days after the last day
 * are not owed. Whole days, counted inclusively, against the whole period.
 */
export type LastTerm = {
  period: BillingPeriod;
  /** The last day of service; the billed range runs from `period.start` to here. */
  endsOn: string;
  daysUsed: number;
  periodDays: number;
  /** True when `endsOn` is before the period's end. */
  partial: boolean;
};

export function lastTermOf(period: BillingPeriod, endsOn: string): LastTerm {
  const periodDays = daysBetween(period.start, period.end) + 1;
  const daysUsed = Math.min(periodDays, Math.max(0, daysBetween(period.start, endsOn) + 1));
  return { period, endsOn, daysUsed, periodDays, partial: endsOn < period.end };
}

/** The net amount for the days delivered, rounded once to whole cents. */
export function proratedNetCents(fullNetCents: Cents, term: Pick<LastTerm, "daysUsed" | "periodDays">): Cents {
  if (term.daysUsed >= term.periodDays) return fullNetCents;
  return roundHalfUp((fullNetCents * term.daysUsed) / term.periodDays);
}

/** Whether `endsOn` falls inside this period without being its last day. */
export function endsInside(period: BillingPeriod, endsOn: string | undefined): boolean {
  return Boolean(endsOn && period.start <= endsOn && endsOn < period.end);
}
