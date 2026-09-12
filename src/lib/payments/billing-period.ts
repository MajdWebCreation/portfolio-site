/**
 * When a recurring service is billed.
 *
 * The rule, in one place because two places would drift:
 *
 *   period 1 starts on the service's `starts_on`, or on the day the first
 *   payment succeeded when no start date was set;
 *
 *   every period is one calendar month, so period n+1 starts on the same day
 *   of the next month, and a period ends on the day before the next one
 *   begins;
 *
 *   a start day that the next month does not have (the 29th, 30th or 31st)
 *   falls back to that month's last day. The anchor is not moved by that, so
 *   a service starting on the 31st is billed on the 31st again in March.
 *
 * The first payment of an activation pays period 1. The provider subscription
 * is therefore given `nextPeriodStart(period 1)` as its start date: the first
 * automatic collection happens when period 2 begins, and the customer is
 * never charged twice for the month they just paid.
 */
export type BillingPeriod = { start: string; end: string };

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function parse(dateKey: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year: year!, month: month!, day: day! };
}

function format(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * The same day of the month, `months` months on, clamped to the length of the
 * target month. `anchorDay` keeps the original day so a run of additions does
 * not creep backwards: 31 Jan -> 28 Feb -> 31 Mar, not 28 Mar.
 */
export function addMonths(dateKey: string, months: number, anchorDay?: number): string {
  const { year, month, day } = parse(dateKey);
  const wanted = anchorDay ?? day;
  const zeroBased = month - 1 + months;
  const targetYear = year + Math.floor(zeroBased / 12);
  const targetMonth = ((zeroBased % 12) + 12) % 12;
  return format(targetYear, targetMonth + 1, Math.min(wanted, daysInMonth(targetYear, targetMonth)));
}

/** The day period 1 begins: the agreed start date, else the day it was paid. */
export function firstPeriodStart(
  service: { startsOn?: string },
  paidOnDateKey: string,
): string {
  return service.startsOn ?? paidOnDateKey;
}

/** The day after a monthly period, which is the day the next one starts. */
export function nextPeriodStart(periodStart: string, anchorDay?: number): string {
  return addMonths(periodStart, 1, anchorDay);
}

/** The last day covered by a monthly period. */
export function periodEnd(periodStart: string, anchorDay?: number): string {
  const next = nextPeriodStart(periodStart, anchorDay);
  const { year, month, day } = parse(next);
  if (day > 1) return format(year, month, day - 1);
  const previousMonth = month - 1 === 0 ? 12 : month - 1;
  const previousYear = month - 1 === 0 ? year - 1 : year;
  return format(previousYear, previousMonth, daysInMonth(previousYear, previousMonth - 1));
}

export function billingPeriod(periodStart: string, anchorDay?: number): BillingPeriod {
  return { start: periodStart, end: periodEnd(periodStart, anchorDay) };
}

/**
 * Which period a charge on `chargeDateKey` belongs to, counted forward from
 * the anchor. A collection that arrives a few days late still belongs to the
 * period it was for, which is what keeps one charge to one invoice.
 */
export function periodForCharge(anchorStart: string, chargeDateKey: string): BillingPeriod {
  const anchorDay = parse(anchorStart).day;
  let start = anchorStart;
  // Monthly periods, so this walks at most as many steps as there are months
  // between the start of the service and the charge.
  for (let guard = 0; guard < 600; guard += 1) {
    const next = nextPeriodStart(start, anchorDay);
    if (chargeDateKey < next) break;
    start = next;
  }
  return billingPeriod(start, anchorDay);
}
