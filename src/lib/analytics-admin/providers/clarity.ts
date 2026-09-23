import { openGate, type RequestGate } from "@/lib/analytics-admin/concurrency";
import { fetchWithTimeout, parseJson, type ProviderResponse } from "@/lib/analytics-admin/http";
import { sanitizeSearchQuery } from "@/lib/analytics-admin/query-filter";
import { dateKeyIn, daily, isDue, windowFrom } from "@/lib/analytics-admin/schedule";
import { ProviderError, type FactRow, type FetchResult, type ProviderAdapter, type SyncPlan } from "@/lib/analytics-admin/types";
import { clarityAllowedOnPath } from "@/lib/clarity/client";

/**
 * Microsoft Clarity through its Data Export API
 * (`GET https://www.clarity.ms/export-data/api/v1/project-live-insights`).
 *
 * What the API is, per Microsoft (checked 23 September 2026): the project's
 * live insights for the last 1, 2 or 3 days counted back from the call
 * (`numOfDays`), broken down by up to three dimensions, at most 1,000 rows,
 * no pagination, at most 10 requests per project per day, UTC. It is not a
 * history: a call returns a rolling window, not calendar days.
 *
 * So this adapter takes two snapshots per run, both over the last 72 hours:
 *   clarity.live    per URL (`dimension1=URL`)
 *   clarity.totals  the project as a whole (no dimension), because sessions
 *                   per URL cannot be added up into sessions
 * Each is stored on the UTC day of the call and replaced by a later call on
 * the same day. Two requests per run: the daily cron and a few manual
 * refreshes stay well inside the ten a day; a refused request is `quota`
 * and fails only these two reports.
 *
 * Which metrics are kept: the ones the dashboard uses, by the names
 * Microsoft lists (Traffic, Scroll Depth, Engagement Time, Dead Click Count,
 * Rage Click Count, Excessive Scroll, Quickback Click, Script Error Count,
 * Error Click Count). Microsoft documents the fields of `Traffic` only
 * (`totalSessionCount`, `totalBotSessionCount`, `distantUserCount`,
 * `PagesPerSessionPercentage`); for the others the fields are whatever the
 * answer holds. Every numeric field of a kept metric is stored as
 * `<metric>_<field>` in snake case, and nothing else: no string field, no
 * user id, no referrer, no page title.
 *
 * URLs: only the path is kept -- query string and fragment are dropped, as
 * they may carry anything. A path Clarity must not run on
 * (clarity/client.ts), or with a segment that looks like an address, number
 * or token (query-filter.ts), is not stored; it is counted as filtered.
 * Two URLs that become the same path are merged: counts add up; averages
 * and percentages cannot be merged honestly and are dropped for that path.
 *
 * Errors: 401/403 `auth`, 429 `quota` (the daily limit), otherwise
 * `http <status>`; never the body.
 *
 * https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api
 */
export const clarityEnv = { apiToken: "CLARITY_API_TOKEN", projectId: "NEXT_PUBLIC_CLARITY_PROJECT_ID" } as const;

export type ClarityConfig = { ok: true; token: string } | { ok: false; missing: string[] };

/** Names what is missing or malformed, never a value. */
export function readClarityConfig(env: Record<string, string | undefined> = process.env): ClarityConfig {
  if (typeof window !== "undefined") throw new Error("The Clarity token was read in the browser. It is server-only.");
  const token = env[clarityEnv.apiToken]?.trim() ?? "";
  if (!/^[A-Za-z0-9._-]{20,4096}$/.test(token)) return { ok: false, missing: [clarityEnv.apiToken] };
  return { ok: true, token };
}

export const CLARITY_DAYS = 3;

export const clarityReports = {
  "clarity.live": { dimension: "URL" },
  "clarity.totals": { dimension: null },
} as const satisfies Record<string, { dimension: string | null }>;

export type ClarityReportKey = keyof typeof clarityReports;
export const clarityReportKeys = Object.keys(clarityReports) as ClarityReportKey[];

export function isClarityReportKey(value: string): value is ClarityReportKey {
  return Object.prototype.hasOwnProperty.call(clarityReports, value);
}

/** The snapshot's window in UTC days, for the record; the API itself counts hours back from the call. */
export function clarityPlans(now: Date, ignoreCadence: boolean): SyncPlan[] {
  if (!isDue(daily, now, ignoreCadence)) return [];
  return [{ phase: "snapshot", window: windowFrom(dateKeyIn(now, "UTC"), -(CLARITY_DAYS - 1), 0) }];
}

/** Microsoft's metric names, however spaced or cased, to the stored prefix. */
const keptMetrics: Record<string, string> = {
  traffic: "traffic",
  scrolldepth: "scroll_depth",
  engagementtime: "engagement_time",
  deadclickcount: "dead_clicks",
  rageclickcount: "rage_clicks",
  excessivescroll: "excessive_scroll",
  quickbackclick: "quickbacks",
  scripterrorcount: "script_errors",
  errorclickcount: "error_clicks",
};

function metricPrefix(name: unknown): string | null {
  return typeof name === "string" ? (keptMetrics[name.toLowerCase().replace(/[^a-z]/g, "")] ?? null) : null;
}

function snake(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
}

function numeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value);
  return null;
}

/** The path of a URL as Clarity reports it, or null when it must not be stored. */
export function clarityPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let path: string;
  try {
    path = new URL(raw.trim()).pathname;
  } catch {
    if (!raw.trim().startsWith("/")) return null;
    path = raw.trim().split(/[?#]/)[0] ?? "";
  }
  path = path.length > 1 ? path.replace(/\/+$/, "") : path;
  if (path.length === 0 || path.length > 300) return null;
  if (!clarityAllowedOnPath(path)) return null;
  const segments = path.split("/").filter(Boolean);
  if (segments.some((segment) => !sanitizeSearchQuery(decodeSegment(segment)).keep)) return null;
  return path;
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

const unmergeable = /average|percentage|rate|per_/;

/** One answer to fact rows. Exported for the fixture tests. */
export function normalizeClarity(report: ClarityReportKey, body: unknown, date: string): FetchResult {
  if (!Array.isArray(body)) throw new ProviderError("invalid_response");
  const dimension = clarityReports[report].dimension;
  const byPath = new Map<string, Record<string, number>>();
  const collided = new Set<string>();
  let filtered = 0;

  for (const block of body) {
    if (typeof block !== "object" || block === null) throw new ProviderError("invalid_response");
    const { metricName, information } = block as { metricName?: unknown; information?: unknown };
    if (!Array.isArray(information)) throw new ProviderError("invalid_response");
    const prefix = metricPrefix(metricName);
    if (!prefix) continue;

    const seenInBlock = new Set<string>();
    for (const item of information) {
      if (typeof item !== "object" || item === null) throw new ProviderError("invalid_response");
      const entries = Object.entries(item as Record<string, unknown>);
      let key = "";
      if (dimension) {
        const urlEntry = entries.find(([field]) => field.toLowerCase() === dimension.toLowerCase());
        const path = clarityPath(urlEntry?.[1]);
        if (!path) {
          filtered += 1;
          continue;
        }
        key = path;
      }
      const target = byPath.get(key) ?? {};
      const merging = seenInBlock.has(key);
      if (merging) collided.add(key);
      seenInBlock.add(key);
      for (const [field, value] of entries) {
        if (dimension && field.toLowerCase() === dimension.toLowerCase()) continue;
        const number = numeric(value);
        if (number === null) continue;
        const name = `${prefix}_${snake(field)}`;
        target[name] = merging && name in target ? target[name] + number : number;
      }
      byPath.set(key, target);
    }
  }

  const rows: FactRow[] = [];
  for (const [path, metrics] of byPath) {
    if (collided.has(path)) for (const name of Object.keys(metrics)) if (unmergeable.test(name)) delete metrics[name];
    if (Object.keys(metrics).length === 0) continue;
    rows.push({ provider: "clarity", report, date, dims: dimension ? { url: path } : {}, metrics });
  }
  return { rows, filtered };
}

function failFor(response: ProviderResponse): never {
  if (response.status === 401 || response.status === 403) throw new ProviderError("auth", response.status);
  if (response.status === 429) throw new ProviderError("quota", 429);
  throw new ProviderError("http", response.status);
}

export function createClarityAdapter(input: { token: string; fetch?: typeof fetch; timeoutMs?: number; gate?: RequestGate }): ProviderAdapter {
  const doFetch = input.fetch ?? fetch;
  const gate = input.gate ?? openGate;

  return {
    key: "clarity",
    reports: clarityReportKeys,

    plan(report, context) {
      return isClarityReportKey(report) ? clarityPlans(context.now, context.ignoreCadence) : [];
    },

    async fetch(report, plan) {
      if (!isClarityReportKey(report)) throw new ProviderError("unknown_report");
      const url = new URL("https://www.clarity.ms/export-data/api/v1/project-live-insights");
      url.searchParams.set("numOfDays", String(CLARITY_DAYS));
      const dimension = clarityReports[report].dimension;
      if (dimension) url.searchParams.set("dimension1", dimension);

      const response = await gate(() =>
        fetchWithTimeout(doFetch, url, { method: "GET", headers: { authorization: `Bearer ${input.token}`, "content-type": "application/json" } }, input.timeoutMs),
      );
      if (!response.ok) failFor(response);
      if (response.text.trim() === "") throw new ProviderError("empty_response");
      return normalizeClarity(report, parseJson<unknown>(response.text), plan.window.end);
    },
  };
}
