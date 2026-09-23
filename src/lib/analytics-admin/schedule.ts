import type { SyncWindow } from "@/lib/analytics-admin/types";

/**
 * Dates and cadences for the provider plans.
 *
 * Every provider counts days in its own reporting timezone, and a plan
 * is only right when it asks in that timezone: GA4 in the property's
 * (Europe/Amsterdam for this site), Search Console in Pacific time (its
 * API says so), Bing in the offset its own date values carry. So a plan
 * asks `dateKeyIn(now, zone)` for "today" in that zone rather than
 * reusing the Amsterdam date everywhere.
 *
 * A cadence is ours, not the provider's: "weekly" means we fetch that
 * report once a week because its data changes weekly or because a daily
 * fetch would repeat the same large answer, not that the provider only
 * has weekly rows.
 */
export const AMSTERDAM = "Europe/Amsterdam";
export const PACIFIC = "America/Los_Angeles";

/** The calendar day of `now` in a timezone, YYYY-MM-DD. */
export function dateKeyIn(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function shiftDate(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** From `startOffset` to `endOffset` days relative to `today`, inclusive; offsets are zero or negative. */
export function windowFrom(today: string, startOffset: number, endOffset: number): SyncWindow {
  return { start: shiftDate(today, startOffset), end: shiftDate(today, endOffset) };
}

/** Every day of a window, in order. */
export function daysIn(window: SyncWindow): string[] {
  const days: string[] = [];
  for (let day = window.start; day <= window.end; day = shiftDate(day, 1)) days.push(day);
  return days;
}

/**
 * Daily: every run. Weekly: runs on one weekday (0 Sunday … 6 Saturday)
 * in the given timezone. A weekly report whose run fails waits a week;
 * its window is wide enough to cover the gap then.
 */
export type Cadence = { kind: "daily" } | { kind: "weekly"; weekday: number; timeZone: string };

export const daily: Cadence = { kind: "daily" };

export function weeklyOn(weekday: number, timeZone = AMSTERDAM): Cadence {
  return { kind: "weekly", weekday, timeZone };
}

export function isDue(cadence: Cadence, now: Date, ignoreCadence: boolean): boolean {
  if (ignoreCadence || cadence.kind === "daily") return true;
  const today = dateKeyIn(now, cadence.timeZone);
  const [year, month, day] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === cadence.weekday;
}

/** The same day `months` months earlier or later; a day past the month's end rolls over, as `Date.UTC` does. */
export function shiftMonths(dateKey: string, months: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + months, day)).toISOString().slice(0, 10);
}
