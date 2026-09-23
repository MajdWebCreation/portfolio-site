import type { BingReportKey } from "@/lib/analytics-admin/providers/bing";
import type { ClarityReportKey } from "@/lib/analytics-admin/providers/clarity";
import type { Ga4ReportKey } from "@/lib/analytics-admin/providers/ga4";
import type { GscReportKey } from "@/lib/analytics-admin/providers/gsc";
import { shiftDate, shiftMonths } from "@/lib/analytics-admin/schedule";

/**
 * How long each kind of fact is kept, in one place.
 *
 *   aggregate   counts per day and per page, channel, country, device,
 *               event ...: no text anyone typed. 26 months, enough for a
 *               year-on-year view.
 *   query_text  facts that carry a search query as typed (after the
 *               filter in query-filter.ts). 16 months: a year-on-year
 *               comparison plus a margin, and no longer, because a query
 *               is text from a person even when it has been filtered.
 *   clarity_live  YM's own copy of Microsoft Clarity's per-page and
 *               project totals for the last 72 hours. 90 days: the API only
 *               ever returns the last three days and these figures serve
 *               recent usability work, not trends. This is the retention of
 *               the aggregates in our database; what Microsoft keeps in
 *               Clarity itself (recordings 30 days, click and heatmap data
 *               and labelled sessions 9 months) is Microsoft's.
 *
 * Every report of every provider must be named here: the type below is a
 * record over all report keys, so a new report does not compile until it
 * is given a class, and the runner refuses to store a `query` dimension for
 * a report that is not `query_text`.
 *
 * The cleanup is enforced by the general retention job
 * (api/cron/retention, lib/retention/retention-runner.ts), which runs every
 * day whether or not any provider is configured or syncing, under its own
 * RETENTION_ENABLED switch. An applied sync runs the same cleanup again as
 * a second line; it is not the guarantee.
 */
export const retentionClasses = {
  aggregate: { months: 26 },
  query_text: { months: 16 },
  clarity_live: { days: 90 },
} as const satisfies Record<string, { months: number } | { days: number }>;
export type RetentionClass = keyof typeof retentionClasses;

export const reportRetention: Record<Ga4ReportKey | GscReportKey | BingReportKey | ClarityReportKey, RetentionClass> = {
  "ga4.overview": "aggregate",
  "ga4.sources": "aggregate",
  "ga4.first_user_sources": "aggregate",
  "ga4.geo": "aggregate",
  "ga4.devices": "aggregate",
  "ga4.landing": "aggregate",
  "ga4.events": "aggregate",
  "ga4.funnel": "aggregate",
  "ga4.key_events_sources": "aggregate",
  "gsc.totals": "aggregate",
  "gsc.queries": "query_text",
  "gsc.pages": "aggregate",
  "gsc.countries": "aggregate",
  "gsc.devices": "aggregate",
  "gsc.appearance": "aggregate",
  "gsc.query_page": "query_text",
  "bing.traffic": "aggregate",
  "bing.queries": "query_text",
  "bing.pages": "aggregate",
  "bing.crawl": "aggregate",
  "clarity.live": "clarity_live",
  "clarity.totals": "clarity_live",
};

export function retentionClassOf(report: string): RetentionClass | null {
  return Object.prototype.hasOwnProperty.call(reportRetention, report) ? reportRetention[report as keyof typeof reportRetention] : null;
}

export function reportsOfClass(retentionClass: RetentionClass): string[] {
  return Object.entries(reportRetention)
    .filter(([, value]) => value === retentionClass)
    .map(([report]) => report);
}

/** The first day that is kept for a class: facts dated before it are removed. */
export function retentionCutoff(retentionClass: RetentionClass, today: string): string {
  const term: { months: number } | { days: number } = retentionClasses[retentionClass];
  return "months" in term ? shiftMonths(today, -term.months) : shiftDate(today, -term.days);
}

export type RetentionTarget = { retentionClass: RetentionClass; cutoff: string; reports: string[] | null };

/**
 * What the cleanup removes on a given day: per class the cutoff, and the
 * reports it applies to (`null` for every report, used by the longest
 * class so that a report without facts yet is still covered). Both the
 * general retention job (lib/retention) and the sync use this list, so the
 * two cannot disagree.
 */
export function analyticsRetentionTargets(today: string): RetentionTarget[] {
  return (Object.keys(retentionClasses) as RetentionClass[]).map((retentionClass) => ({
    retentionClass,
    cutoff: retentionCutoff(retentionClass, today),
    reports: retentionClass === "aggregate" ? null : reportsOfClass(retentionClass),
  }));
}
