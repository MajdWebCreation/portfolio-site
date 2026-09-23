import { ProviderError, type FactRow, type FetchResult, type ProviderAdapter, type SyncPlan } from "@/lib/analytics-admin/types";
import { sanitizeSearchQuery } from "@/lib/analytics-admin/query-filter";
import type { TokenSource } from "@/lib/analytics-admin/google-auth";
import { fetchWithTimeout, parseJson, type ProviderResponse } from "@/lib/analytics-admin/http";
import { mapWithLimit, openGate, type RequestGate } from "@/lib/analytics-admin/concurrency";
import { PACIFIC, dateKeyIn, daysIn, isDue, weeklyOn, windowFrom } from "@/lib/analytics-admin/schedule";

/**
 * Google Search Console through the Search Analytics API
 * (`searchAnalytics.query`), for web search.
 *
 * Every report is a fixed list of API dimensions and the name each is
 * stored under (`searchAppearance` becomes `appearance`); the metrics are
 * always the four the API returns: clicks, impressions, ctr (0–1) and
 * position (average, 1 is the top). `ctr` and `position` are kept as the
 * API computed them for that row; the dashboard re-weights them when it
 * adds rows up.
 *
 * Dates. The API takes and returns days in Pacific time, so the plan asks
 * for "today" in Pacific time and every stored `date` is a Pacific day.
 * Nothing here converts it to Amsterdam; a Search Console day is what it
 * is.
 *
 * Fresh and final data. `dataState: "all"` includes data that is not final
 * yet; `"final"` (the default) returns settled days only. The plan reads:
 *   recent  today and the three days before it (Pacific), `all`: what is
 *           known so far, overwritten by the next runs;
 *   final   the seven days before that, `final`: re-read daily for a week,
 *           so each day is stored in its settled form once Google has
 *           finalised it (usually within a few days).
 * A day the final read does not return yet keeps its preliminary rows;
 * a day it does return replaces them, including rows the final data no
 * longer has (the store removes those). No wider backfill runs daily.
 *
 * Reports:
 *   gsc.totals      date                     the authoritative totals
 *   gsc.queries     query, per day           top 500 by clicks, per day
 *   gsc.pages       date, page
 *   gsc.countries   date, country            ISO 3166-1 alpha-3, lowercase as sent
 *   gsc.devices     date, device             DESKTOP / MOBILE / TABLET
 *   gsc.appearance  date, searchAppearance
 *   gsc.query_page  query, page              weekly snapshot of 28 settled days
 * Every query passes the filter in query-filter.ts first; a query that
 * looks like an address, number, link or token is not stored, only counted.
 * Query rows are never summed into a total: Search Console leaves out
 * anonymised queries, and the top-500 cut leaves out the tail, so the
 * totals report is the only total.
 *
 * `gsc.query_page` has no date dimension: it is one aggregate over its
 * 28-day window, stored on the window's last day with `window_days`
 * among its metrics, and replaced by the next week's snapshot.
 *
 * Generative-AI features (AI Overviews, AI Mode) are counted inside `web`
 * by the API and cannot be separated through it; Search Console's own AI
 * report has no API. Nothing here pretends otherwise.
 *
 * Errors carry a class and a status, never the response: 401/403 `auth`,
 * 429 `quota`, anything else `http <status>`.
 *
 * Documentation checked 23 September 2026:
 * https://developers.google.com/webmaster-tools/v1/searchanalytics/query
 */
type ApiDimension = "date" | "query" | "page" | "country" | "device" | "searchAppearance";

type GscReportSpec = {
  /** API dimensions, `date` first when present. */
  dimensions: readonly ApiDimension[];
  /** One request per day of the plan, dated that day: for a per-day top list. */
  perDay?: { rowLimit: number };
  /** One aggregate over the plan's window, stored on its last day. */
  snapshot?: { rowLimit: number };
};

export const GSC_QUERIES_PER_DAY = 500;
export const GSC_QUERY_PAGE_ROWS = 5_000;
export const GSC_RECENT_DAYS = 4;
export const GSC_FINAL_DAYS = 7;
export const GSC_SNAPSHOT_DAYS = 28;
/**
 * Day requests of one report asked side by side. The provider's request
 * gate (sync.ts) caps what is actually in flight for Search Console as a
 * whole, so this only lets one report use the free slots.
 */
export const GSC_DAY_CONCURRENCY = 3;

export const gscReports = {
  "gsc.totals": { dimensions: ["date"] },
  "gsc.queries": { dimensions: ["query"], perDay: { rowLimit: GSC_QUERIES_PER_DAY } },
  "gsc.pages": { dimensions: ["date", "page"] },
  "gsc.countries": { dimensions: ["date", "country"] },
  "gsc.devices": { dimensions: ["date", "device"] },
  "gsc.appearance": { dimensions: ["date", "searchAppearance"] },
  "gsc.query_page": { dimensions: ["query", "page"], snapshot: { rowLimit: GSC_QUERY_PAGE_ROWS } },
} as const satisfies Record<string, GscReportSpec>;

export type GscReportKey = keyof typeof gscReports;
export const gscReportKeys = Object.keys(gscReports) as GscReportKey[];

export function isGscReportKey(value: string): value is GscReportKey {
  return Object.prototype.hasOwnProperty.call(gscReports, value);
}

const storedName: Record<ApiDimension, string> = {
  date: "date",
  query: "query",
  page: "page",
  country: "country",
  device: "device",
  searchAppearance: "appearance",
};

const PAGE_SIZE = 25_000;

/** Snapshots are weekly, on Mondays. */
const snapshotCadence = weeklyOn(1);

/** The ranges due for a report now, in Pacific days. */
export function gscPlans(report: GscReportKey, now: Date, ignoreCadence: boolean): SyncPlan[] {
  const today = dateKeyIn(now, PACIFIC);
  const spec: GscReportSpec = gscReports[report];
  if (spec.snapshot) {
    if (!isDue(snapshotCadence, now, ignoreCadence)) return [];
    const end = -(GSC_RECENT_DAYS);
    return [{ phase: "snapshot", window: windowFrom(today, end - (GSC_SNAPSHOT_DAYS - 1), end) }];
  }
  return [
    { phase: "final", window: windowFrom(today, -(GSC_RECENT_DAYS + GSC_FINAL_DAYS - 1), -GSC_RECENT_DAYS) },
    { phase: "recent", window: windowFrom(today, -(GSC_RECENT_DAYS - 1), 0) },
  ];
}

export type GscRow = { keys?: unknown; clicks?: unknown; impressions?: unknown; ctr?: unknown; position?: unknown };
export type GscResponse = { rows?: unknown; responseAggregationType?: string };

function metric(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new ProviderError("invalid_response");
  return value;
}

/**
 * Turns one API response into fact rows. `day` dates rows of a report
 * without a date dimension. A query the filter refuses (query-filter.ts)
 * does not become a row; it is only counted. Exported for the fixture tests.
 */
export function normalizeGscRows(report: GscReportKey, response: unknown, day: string | null, extra: Record<string, number> = {}): FetchResult {
  if (typeof response !== "object" || response === null || Array.isArray(response)) throw new ProviderError("invalid_response");
  const rowsValue = (response as GscResponse).rows;
  if (rowsValue === undefined) return { rows: [], filtered: 0 };
  if (!Array.isArray(rowsValue)) throw new ProviderError("invalid_response");

  const spec: GscReportSpec = gscReports[report];
  const rows: FactRow[] = [];
  let filtered = 0;
  for (const raw of rowsValue as GscRow[]) {
    const keys = raw?.keys;
    if (!Array.isArray(keys) || keys.length !== spec.dimensions.length || keys.some((key) => typeof key !== "string")) {
      throw new ProviderError("invalid_response");
    }
    const metrics = { clicks: metric(raw.clicks), impressions: metric(raw.impressions), ctr: metric(raw.ctr), position: metric(raw.position), ...extra };

    let date = day;
    let refused = false;
    const dims: Record<string, string> = {};
    spec.dimensions.forEach((dimension, index) => {
      const value = keys[index] as string;
      if (dimension === "date") date = value;
      else if (dimension === "query") {
        const verdict = sanitizeSearchQuery(value);
        if (verdict.keep) dims.query = verdict.query;
        else refused = true;
      } else dims[storedName[dimension]] = value.slice(0, 300);
    });
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ProviderError("invalid_response");
    if (refused) {
      filtered += 1;
      continue;
    }
    rows.push({ provider: "gsc", report, date, dims, metrics });
  }
  return { rows, filtered };
}

function failFor(response: ProviderResponse): never {
  if (response.status === 401 || response.status === 403) throw new ProviderError("auth", response.status);
  if (response.status === 429) throw new ProviderError("quota", 429);
  throw new ProviderError("http", response.status);
}

export function createGscAdapter(input: { siteUrl: string; token: TokenSource; fetch?: typeof fetch; timeoutMs?: number; gate?: RequestGate }): ProviderAdapter {
  const gate = input.gate ?? openGate;
  const doFetch = input.fetch ?? fetch;
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(input.siteUrl)}/searchAnalytics/query`;

  async function query(body: Record<string, unknown>): Promise<unknown> {
    const token = await input.token();
    const response = await gate(() =>
      fetchWithTimeout(
        doFetch,
        endpoint,
        { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ type: "web", ...body }) },
        input.timeoutMs,
      ),
    );
    if (!response.ok) failFor(response);
    return parseJson<unknown>(response.text);
  }

  return {
    key: "gsc",
    reports: gscReportKeys,

    plan(report, context) {
      return isGscReportKey(report) ? gscPlans(report, context.now, context.ignoreCadence) : [];
    },

    async fetch(report, plan) {
      if (!isGscReportKey(report)) throw new ProviderError("unknown_report");
      const spec: GscReportSpec = gscReports[report];
      const dataState = plan.phase === "recent" ? "all" : "final";

      if (spec.perDay) {
        /* One request per day, a few at a time; pages are joined in day order, whatever order they arrive in. */
        const perDay = spec.perDay;
        const pages = await mapWithLimit(daysIn(plan.window), GSC_DAY_CONCURRENCY, async (day) =>
          normalizeGscRows(report, await query({ startDate: day, endDate: day, dimensions: spec.dimensions, rowLimit: perDay.rowLimit, dataState }), day),
        );
        return { rows: pages.flatMap((page) => page.rows), filtered: pages.reduce((total, page) => total + page.filtered, 0) };
      }

      if (spec.snapshot) {
        const response = await query({
          startDate: plan.window.start,
          endDate: plan.window.end,
          dimensions: spec.dimensions,
          rowLimit: spec.snapshot.rowLimit,
          dataState,
        });
        const windowDays = daysIn(plan.window).length;
        return normalizeGscRows(report, response, plan.window.end, { window_days: windowDays });
      }

      const result: FetchResult = { rows: [], filtered: 0 };
      for (let startRow = 0; ; startRow += PAGE_SIZE) {
        const response = await query({
          startDate: plan.window.start,
          endDate: plan.window.end,
          dimensions: spec.dimensions,
          rowLimit: PAGE_SIZE,
          startRow,
          dataState,
        });
        const page = normalizeGscRows(report, response, null);
        result.rows.push(...page.rows);
        result.filtered += page.filtered;
        if (page.rows.length + page.filtered < PAGE_SIZE) break;
      }
      return result;
    },
  };
}
