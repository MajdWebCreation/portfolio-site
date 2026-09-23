import { ProviderError, type FactRow, type FetchResult, type ProviderAdapter, type SyncPlan } from "@/lib/analytics-admin/types";
import { sanitizeSearchQuery } from "@/lib/analytics-admin/query-filter";
import { fetchWithTimeout, parseJson, type ProviderResponse } from "@/lib/analytics-admin/http";
import { openGate, type RequestGate } from "@/lib/analytics-admin/concurrency";
import { PACIFIC, dateKeyIn, daily, isDue, weeklyOn, windowFrom, type Cadence } from "@/lib/analytics-admin/schedule";

/**
 * Bing Webmaster Tools through its JSON API
 * (`https://ssl.bing.com/webmaster/api.svc/json/<Method>`).
 *
 * The methods used here take only the site and return the site's history
 * (about six months) as a list, wrapped as `{"d": [...]}`, with dates in
 * Microsoft's JSON form `/Date(1316156400000-0700)/`: milliseconds since
 * the epoch and the offset of the day it describes. The stored `date` is
 * that day, read in its own offset, not converted to Amsterdam.
 *
 * Reports and what Microsoft documents about them:
 *   bing.traffic  GetRankAndTrafficStats  clicks, impressions per day;
 *                 updated daily; since 24 March 2023 it counts every
 *                 Bing vertical: Web, Chat, News, Images, Videos and the
 *                 Knowledge Panel. Hence the dashboard's "Web + Chat"
 *                 wording applies to this report and to nothing else.
 *   bing.queries  GetQueryStats   per query and date: clicks, impressions,
 *                 average click and impression position; updated weekly.
 *                 Every query passes query-filter.ts first; a refused one
 *                 is counted, not stored.
 *   bing.pages    GetPageStats    the same shape per page URL (the API
 *                 puts the URL in its `Query` field); updated weekly.
 *   bing.crawl    GetCrawlStats   per date the crawl counters the answer
 *                 contains (crawled pages, errors, status classes, pages in
 *                 the index, ...). Only fields present and numeric are kept.
 * No country or device: Bing's API has none, and none is invented.
 *
 * Cadence is ours: traffic daily, keeping the last 14 days of the answer;
 * the weekly-updated reports on Mondays, keeping the last 42 days (six
 * weeks, so a failed Monday is covered by the next). The answer holds
 * more; the plan's window decides what is stored, so a run never rewrites
 * six months of rows.
 *
 * Authentication is an API key in the query string, as Bing asks; the
 * `BingAuth` type leaves room for OAuth (`webmaster.read`) later without
 * changing the adapter's callers. The URL carrying the key is never
 * logged or put in an error.
 *
 * Errors: HTTP 400 carries `{ErrorCode, Message}`; the numeric code alone
 * is read (3 invalid key, 6 user blocked, 14 not authorised → `auth`;
 * 4/5 throttling → `quota`), the message never. An empty body is
 * `empty_response`, an unreadable or unexpected one `invalid_response`.
 *
 * Documentation checked 23 September 2026:
 * https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi
 * https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.apierrorcode
 */
export const bingEnv = { apiKey: "BING_WEBMASTER_API_KEY", siteUrl: "BING_SITE_URL" } as const;

export type BingAuth = { kind: "api_key"; apiKey: string };

export type BingConfig = { ok: true; siteUrl: string; auth: BingAuth } | { ok: false; missing: string[] };

export function normalizeBingSiteUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.search || url.hash || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Names what is missing or malformed, never a value. */
export function readBingConfig(env: Record<string, string | undefined> = process.env): BingConfig {
  if (typeof window !== "undefined") throw new Error("Bing credentials were read in the browser. They are server-only.");
  const missing: string[] = [];
  const apiKey = env[bingEnv.apiKey]?.trim() ?? "";
  if (!/^[A-Za-z0-9]{16,128}$/.test(apiKey)) missing.push(bingEnv.apiKey);
  const siteUrl = env[bingEnv.siteUrl] ? normalizeBingSiteUrl(env[bingEnv.siteUrl] as string) : null;
  if (!siteUrl) missing.push(bingEnv.siteUrl);
  if (missing.length > 0 || !siteUrl) return { ok: false, missing };
  return { ok: true, siteUrl, auth: { kind: "api_key", apiKey } };
}

type BingReportSpec = {
  method: "GetRankAndTrafficStats" | "GetQueryStats" | "GetPageStats" | "GetCrawlStats";
  cadence: Cadence;
  /** Days kept from the answer, up to and including today (Pacific). */
  keepDays: number;
};

export const bingReports = {
  "bing.traffic": { method: "GetRankAndTrafficStats", cadence: daily, keepDays: 14 },
  "bing.queries": { method: "GetQueryStats", cadence: weeklyOn(1), keepDays: 42 },
  "bing.pages": { method: "GetPageStats", cadence: weeklyOn(1), keepDays: 42 },
  "bing.crawl": { method: "GetCrawlStats", cadence: weeklyOn(1), keepDays: 42 },
} as const satisfies Record<string, BingReportSpec>;

export type BingReportKey = keyof typeof bingReports;
export const bingReportKeys = Object.keys(bingReports) as BingReportKey[];

export function isBingReportKey(value: string): value is BingReportKey {
  return Object.prototype.hasOwnProperty.call(bingReports, value);
}

export function bingPlans(report: BingReportKey, now: Date, ignoreCadence: boolean): SyncPlan[] {
  const spec: BingReportSpec = bingReports[report];
  if (!isDue(spec.cadence, now, ignoreCadence)) return [];
  return [{ phase: "recent", window: windowFrom(dateKeyIn(now, PACIFIC), -(spec.keepDays - 1), 0) }];
}

/** `/Date(1316156400000-0700)/` → `2011-09-16`: the day in the value's own offset; UTC when it has none. */
export function parseBingDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^\/Date\((-?\d+)([+-])(\d{2})(\d{2})\)\/$/.exec(value) ?? /^\/Date\((-?\d+)\)\/$/.exec(value);
  if (!match) return null;
  const ms = Number(match[1]);
  const offset = match[2] ? (match[2] === "-" ? -1 : 1) * (Number(match[3]) * 60 + Number(match[4])) : 0;
  const local = new Date(ms + offset * 60_000);
  return Number.isNaN(local.getTime()) ? null : local.toISOString().slice(0, 10);
}

const crawlFields: Record<string, string> = {
  AllOtherCodes: "all_other_codes",
  BlockedByRobotsTxt: "blocked_by_robots_txt",
  Code2xx: "code_2xx",
  Code301: "code_301",
  Code302: "code_302",
  Code4xx: "code_4xx",
  Code5xx: "code_5xx",
  ConnectionTimeout: "connection_timeout",
  ContainsMalware: "contains_malware",
  CrawledPages: "crawled_pages",
  CrawlErrors: "crawl_errors",
  DnsFailures: "dns_failures",
  InIndex: "in_index",
  InLinks: "in_links",
};

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new ProviderError("invalid_response");
  return value;
}

/** A position when the answer has one; a negative or missing value is "not reported", not zero. */
function position(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** The `d` list, or an empty one when Bing says `null`. Exported for the fixture tests. */
export function unwrapBing(body: unknown): unknown[] {
  if (typeof body !== "object" || body === null || !("d" in body)) throw new ProviderError("invalid_response");
  const d = (body as { d: unknown }).d;
  if (d === null) return [];
  if (!Array.isArray(d)) throw new ProviderError("invalid_response");
  return d;
}

/**
 * One answer to fact rows, keeping only days inside the plan's window. A
 * query the filter refuses (query-filter.ts) does not become a row; it is
 * only counted. Exported for the fixture tests.
 */
export function normalizeBingRows(report: BingReportKey, body: unknown, plan: SyncPlan): FetchResult {
  const rows: FactRow[] = [];
  let filtered = 0;
  for (const raw of unwrapBing(body)) {
    if (typeof raw !== "object" || raw === null) throw new ProviderError("invalid_response");
    const item = raw as Record<string, unknown>;
    const date = parseBingDate(item.Date);
    if (!date) throw new ProviderError("invalid_response");
    if (date < plan.window.start || date > plan.window.end) continue;

    if (report === "bing.traffic") {
      rows.push({ provider: "bing", report, date, dims: {}, metrics: { clicks: count(item.Clicks), impressions: count(item.Impressions) } });
      continue;
    }

    if (report === "bing.crawl") {
      const metrics: Record<string, number> = {};
      for (const [field, key] of Object.entries(crawlFields)) {
        if (typeof item[field] === "number" && Number.isFinite(item[field])) metrics[key] = item[field] as number;
      }
      rows.push({ provider: "bing", report, date, dims: {}, metrics });
      continue;
    }

    if (typeof item.Query !== "string") throw new ProviderError("invalid_response");
    const metrics: Record<string, number> = { clicks: count(item.Clicks), impressions: count(item.Impressions) };
    const click = position(item.AvgClickPosition);
    const impression = position(item.AvgImpressionPosition);
    if (click !== null) metrics.avg_click_position = click;
    if (impression !== null) metrics.avg_impression_position = impression;
    if (report === "bing.pages") {
      rows.push({ provider: "bing", report, date, dims: { page: item.Query.slice(0, 300) }, metrics });
      continue;
    }
    const verdict = sanitizeSearchQuery(item.Query);
    if (!verdict.keep) {
      filtered += 1;
      continue;
    }
    rows.push({ provider: "bing", report, date, dims: { query: verdict.query }, metrics });
  }
  return { rows, filtered };
}

const authCodes = new Set([3, 6, 14]);
const throttleCodes = new Set([4, 5]);

function failFor(response: ProviderResponse): never {
  if (response.status === 401 || response.status === 403) throw new ProviderError("auth", response.status);
  if (response.status === 429) throw new ProviderError("quota", 429);
  if (response.status === 400) {
    /* Only the numeric code is read; the message goes nowhere. */
    let code: number | null = null;
    try {
      const body = JSON.parse(response.text) as { ErrorCode?: unknown } | null;
      code = typeof body?.ErrorCode === "number" ? body.ErrorCode : null;
    } catch {
      code = null;
    }
    if (code !== null && authCodes.has(code)) throw new ProviderError("auth", 400);
    if (code !== null && throttleCodes.has(code)) throw new ProviderError("quota", 400);
  }
  throw new ProviderError("http", response.status);
}

export function createBingAdapter(input: { siteUrl: string; auth: BingAuth; fetch?: typeof fetch; timeoutMs?: number; gate?: RequestGate }): ProviderAdapter {
  const gate = input.gate ?? openGate;
  const doFetch = input.fetch ?? fetch;

  async function call(method: BingReportSpec["method"]): Promise<unknown> {
    const url = new URL(`https://ssl.bing.com/webmaster/api.svc/json/${method}`);
    url.searchParams.set("siteUrl", input.siteUrl);
    url.searchParams.set("apikey", input.auth.apiKey);

    const response = await gate(() => fetchWithTimeout(doFetch, url, { method: "GET", headers: { accept: "application/json" } }, input.timeoutMs));
    if (!response.ok) failFor(response);
    if (response.text.trim() === "") throw new ProviderError("empty_response");
    return parseJson<unknown>(response.text);
  }

  return {
    key: "bing",
    reports: bingReportKeys,

    plan(report, context) {
      return isBingReportKey(report) ? bingPlans(report, context.now, context.ignoreCadence) : [];
    },

    async fetch(report, plan) {
      if (!isBingReportKey(report)) throw new ProviderError("unknown_report");
      return normalizeBingRows(report, await call(bingReports[report].method), plan);
    },
  };
}
