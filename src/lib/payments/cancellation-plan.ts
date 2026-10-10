import { addDays } from "@/lib/admin/documents/validation";
import { isDateKey } from "@/lib/admin/format";
import { addMonths, nextPeriodStart, periodForCharge, type BillingPeriod } from "@/lib/payments/billing-period";
import { amountForPeriod, grossOf, lastTermOf, proratedNetCents, type LastTerm } from "@/lib/payments/pricing";
import type { PriceChange } from "@/lib/payments/types";

/**
 * The dates and amounts of ending a service: pure, so the admin form can
 * preview any date the admin types with exactly the rule the action applies.
 *
 * The general terms (art. 25.1, A4.2) give a continuing hosting or
 * management service one month's notice, and nothing more: the fee stays
 * due while the service runs, and "na daadwerkelijke beëindiging stopt het
 * maandbedrag" (A4.3). So the agreement ends exactly one month after the
 * request; the last day of service is the day before. The billing period
 * that day falls in is delivered in part and is billed pro rata by days.
 * Rounding the end up to the period's end would add up to a month the terms
 * do not provide for, so it is never done on the system's own authority: a
 * different last day is an agreement with the customer, and the admin says
 * so when choosing one.
 */
export type CancellationPlan = {
  requestedOn: string;
  /** One month after the request: the day the agreement no longer runs. */
  noticeEndsOn: string;
  /** The last day of service the terms give: the day before `noticeEndsOn`. */
  contractualEndsOn: string;
  /** The chosen last day of service. */
  endsOn: string;
  /** The chosen end differs from the contractual one; needs an agreed deviation. */
  deviates: boolean;
  belowNotice: boolean;
  /** The last period still billed and collected, pro rata when partial. */
  lastTerm: LastTerm;
  lastDebitOn: string;
  /** Net amount of the last term as the terms give it: pro rata of the period's price. */
  lastTermNetCents: number;
  lastTermGrossCents: number;
  /** The period's full price, for the record. */
  lastTermFullNetCents: number;
  /** The last period already has its invoice, at the full amount. */
  lastTermBilled: boolean;
  /** Owed back when the full term was already announced or collected. */
  creditDue?: { days: number; netCents: number; grossCents: number };
  /** Collections still ahead (today or later), up to and including the last one. */
  collectionsAhead: string[];
  /** The first collection that must not happen. */
  firstForbiddenDebitOn: string;
  /** The day the daily job cancels the subscription at Mollie. */
  providerCancelFrom: string;
  lastBilledPeriod?: BillingPeriod;
};

export type CancellationInput = {
  startsOn: string;
  amountCents: number;
  vatRate: number;
  priceChanges: readonly PriceChange[];
  billedPeriodStarts: readonly string[];
  todayKey: string;
  /** A last day the admin chose instead of the contractual one. */
  requestedEndsOn?: string;
};

function anchorDayOf(dateKey: string): number {
  return Number(dateKey.slice(8, 10));
}

/** The last day of service for a request on `requestedOn`: one month's notice. */
export function contractualLastDay(requestedOn: string): string {
  return addDays(addMonths(requestedOn, 1), -1);
}

export function cancellationPlan(input: CancellationInput): CancellationPlan | { error: string } {
  const { startsOn, todayKey } = input;
  const anchorDay = anchorDayOf(startsOn);

  const noticeEndsOn = addMonths(todayKey, 1);
  const contractualEndsOn = contractualLastDay(todayKey);
  const endsOn = input.requestedEndsOn ?? contractualEndsOn;
  if (!isDateKey(endsOn)) return { error: "De einddatum is geen geldige datum." };
  if (endsOn < todayKey) return { error: "De einddatum kan niet in het verleden liggen." };
  if (endsOn < startsOn) return { error: `De dienst begint pas op ${startsOn}.` };

  const lastPeriod = periodForCharge(startsOn, endsOn);
  const lastTerm = lastTermOf(lastPeriod, endsOn);
  const fullNet = amountForPeriod({ amountCents: input.amountCents }, input.priceChanges, lastPeriod.start);
  const proratedNet = proratedNetCents(fullNet, lastTerm);

  const sortedBilled = [...input.billedPeriodStarts].sort();
  const latestBilled = sortedBilled.at(-1);
  const lastBilledPeriod = latestBilled ? periodForCharge(latestBilled, latestBilled) : undefined;
  const lastTermBilled = sortedBilled.includes(lastPeriod.start);

  const creditNet = lastTermBilled && lastTerm.partial ? fullNet - proratedNet : 0;
  const creditDue =
    creditNet > 0
      ? /* VAT over the credited net, as the credit note will compute it: the figure shown is the figure the document says. */
        { days: lastTerm.periodDays - lastTerm.daysUsed, netCents: creditNet, grossCents: grossOf(creditNet, input.vatRate) }
      : undefined;

  const collectionsAhead: string[] = [];
  for (let start = startsOn, guard = 0; start <= lastPeriod.start && guard < 1200; start = nextPeriodStart(start, anchorDay), guard += 1) {
    if (start >= todayKey) collectionsAhead.push(start);
  }

  const firstForbiddenDebitOn = nextPeriodStart(lastPeriod.start, anchorDay);
  const providerCancelFrom = lastPeriod.start >= todayKey ? addDays(lastPeriod.start, 1) : todayKey;

  return {
    requestedOn: todayKey,
    noticeEndsOn,
    contractualEndsOn,
    endsOn,
    deviates: endsOn !== contractualEndsOn,
    belowNotice: endsOn < contractualEndsOn,
    lastTerm,
    lastDebitOn: lastPeriod.start,
    lastTermNetCents: proratedNet,
    lastTermGrossCents: grossOf(proratedNet, input.vatRate),
    lastTermFullNetCents: fullNet,
    lastTermBilled,
    ...(creditDue ? { creditDue } : {}),
    collectionsAhead,
    firstForbiddenDebitOn,
    providerCancelFrom,
    ...(lastBilledPeriod ? { lastBilledPeriod } : {}),
  };
}

/**
 * The ends an admin is offered: the contractual day first, then the end of
 * the period it falls in (a few days to weeks later; with the customer's
 * agreement it avoids a partial last term) and the period end after that.
 */
export function cancellationOptions(input: Omit<CancellationInput, "requestedEndsOn">): CancellationPlan[] {
  const contractual = cancellationPlan(input);
  if ("error" in contractual) return [];
  const anchorDay = anchorDayOf(input.startsOn);
  const plans = [contractual];
  let end = contractual.lastTerm.period.end;
  for (let guard = 0; plans.length < 3 && guard < 3; guard += 1) {
    if (end > contractual.endsOn) {
      const plan = cancellationPlan({ ...input, requestedEndsOn: end });
      if (!("error" in plan)) plans.push(plan);
    }
    end = periodForCharge(input.startsOn, nextPeriodStart(periodForCharge(input.startsOn, end).start, anchorDay)).end;
  }
  return plans;
}

/** Whether the daily job may cancel the subscription at Mollie today: the last legitimate collection date has passed. */
export function isProviderCancelDue(service: { startsOn: string; endsOn: string }, todayKey: string): boolean {
  return todayKey > periodForCharge(service.startsOn, service.endsOn).start;
}
