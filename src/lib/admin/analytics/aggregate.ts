import { daysOf } from "@/lib/admin/analytics/periods";
import type { Comparison, DailyPoint, FactRecord, PeriodRanges } from "@/lib/admin/analytics/types";

/** The small arithmetic every dashboard block shares. */
export function sum(rows: FactRecord[], metric: string): number {
  return rows.reduce((total, row) => total + (row.metrics[metric] ?? 0), 0);
}

export function compare(current: number, previous: number): Comparison {
  return { current, previous, delta: previous > 0 ? (current - previous) / previous : null };
}

/** A per-day value over a range; a day the facts do not mention counts as zero. */
export function daily(rows: FactRecord[], ranges: PeriodRanges, which: "current" | "previous", metric = "sessions"): DailyPoint[] {
  const byDay = new Map<string, number>();
  for (const row of rows) byDay.set(row.date, (byDay.get(row.date) ?? 0) + (row.metrics[metric] ?? 0));
  return daysOf(ranges[which]).map((date) => ({ date, value: byDay.get(date) ?? 0 }));
}
