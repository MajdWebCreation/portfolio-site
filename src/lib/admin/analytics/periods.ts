import { toDateKey } from "@/lib/admin/format";
import { shiftDate } from "@/lib/analytics-admin/runner";
import { periods, type DateRange, type Period, type PeriodRanges } from "@/lib/admin/analytics/types";

/**
 * The period the page shows and the one before it.
 *
 * Full days only: the current period ends yesterday (Amsterdam time),
 * because today's aggregates are still moving and would make every
 * comparison look like a drop. Seven days compare with the seven before,
 * and so on, so a delta is always like against like.
 */
export function resolvePeriod(value: string | string[] | undefined): Period {
  const raw = Array.isArray(value) ? value[0] : value;
  const number = Number(raw);
  return (periods as readonly number[]).includes(number) ? (number as Period) : 30;
}

export function periodRanges(period: Period, now: Date = new Date()): PeriodRanges {
  const end = shiftDate(toDateKey(now), -1);
  const start = shiftDate(end, -(period - 1));
  const previousEnd = shiftDate(start, -1);
  const previousStart = shiftDate(previousEnd, -(period - 1));
  return { period, current: { start, end }, previous: { start: previousStart, end: previousEnd } };
}

export function inRange(date: string, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

/** Every day of a range, in order, so a chart has a point for a day without data. */
export function daysOf(range: DateRange): string[] {
  const days: string[] = [];
  for (let day = range.start; day <= range.end; day = shiftDate(day, 1)) days.push(day);
  return days;
}
