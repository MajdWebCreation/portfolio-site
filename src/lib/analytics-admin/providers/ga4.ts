import { ProviderError, type FactRow, type ProviderAdapter, type SyncPlan } from "@/lib/analytics-admin/types";
import type { TokenSource } from "@/lib/analytics-admin/google-auth";
import { syncWindow } from "@/lib/analytics-admin/runner";
import { fetchWithTimeout, parseJson, type ProviderResponse } from "@/lib/analytics-admin/http";
import { openGate, type RequestGate } from "@/lib/analytics-admin/concurrency";

/**
 * Google Analytics 4 through the Analytics Data API (v1beta, runReport).
 *
 * Each report is a fixed pair of dimension and metric lists, and a name for
 * every field as it is stored: `sessionDefaultChannelGroup` becomes
 * `channel`, `customEvent:service_id` becomes `service_id`, `engagedSessions`
 * becomes `engaged_sessions`. The dashboard reads those stored names and
 * never sees an API name, so a report can change its query without the
 * dashboard noticing, and the other providers can use the same words.
 *
 * `date` is always the first dimension and becomes the row's day; the
 * remaining dimensions become `dims`. Metric values arrive as strings and
 * are parsed; a value that is not a number fails the report rather than
 * storing a zero that was never reported.
 *
 * Plan: every report daily, the last three days including today in the
 * property's day (Europe/Amsterdam for this site). GA keeps processing a
 * day for a while, so the same days are read again on the next runs and
 * the upsert replaces them; there is no separate final phase.
 *
 * Errors carry a class and a status, never the response: a 401 or 403 is
 * `auth`, a 429 is `quota`, a 400 that mentions incompatibility is
 * `compatibility`, anything else is `http <status>`.
 *
 * Documentation checked 23 September 2026:
 * https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport
 * https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/checkCompatibility
 */
type Field = { name: string; key: string };

export type Ga4ReportSpec = {
  dimensions: readonly Field[];
  metrics: readonly Field[];
};

const sessions: Field = { name: "sessions", key: "sessions" };
const engagedSessions: Field = { name: "engagedSessions", key: "engaged_sessions" };
const keyEvents: Field = { name: "keyEvents", key: "key_events" };
const eventCount: Field = { name: "eventCount", key: "event_count" };
const date: Field = { name: "date", key: "date" };
const eventName: Field = { name: "eventName", key: "event_name" };
const custom = (parameter: string): Field => ({ name: `customEvent:${parameter}`, key: parameter });

export const ga4Reports = {
  "ga4.overview": {
    dimensions: [date],
    metrics: [
      sessions,
      { name: "totalUsers", key: "total_users" },
      { name: "newUsers", key: "new_users" },
      engagedSessions,
      { name: "engagementRate", key: "engagement_rate" },
      { name: "screenPageViews", key: "page_views" },
      keyEvents,
    ],
  },
  "ga4.sources": {
    dimensions: [date, { name: "sessionDefaultChannelGroup", key: "channel" }, { name: "sessionSourceMedium", key: "source_medium" }],
    metrics: [sessions, engagedSessions, keyEvents],
  },
  "ga4.first_user_sources": {
    dimensions: [date, { name: "firstUserSourceMedium", key: "first_user_source_medium" }],
    metrics: [{ name: "newUsers", key: "new_users" }, keyEvents],
  },
  "ga4.geo": {
    dimensions: [date, { name: "country", key: "country" }, { name: "region", key: "region" }, { name: "city", key: "city" }],
    metrics: [sessions, keyEvents],
  },
  "ga4.devices": {
    dimensions: [date, { name: "deviceCategory", key: "device" }, { name: "browser", key: "browser" }],
    metrics: [sessions],
  },
  "ga4.landing": {
    dimensions: [date, { name: "landingPage", key: "landing_page" }],
    metrics: [sessions, engagedSessions, keyEvents],
  },
  "ga4.events": {
    dimensions: [date, eventName, custom("service_id"), custom("cta_id"), custom("cta_target"), custom("package_id"), custom("placement")],
    metrics: [eventCount],
  },
  "ga4.funnel": {
    dimensions: [date, eventName, custom("step_name"), custom("project_type"), custom("direction")],
    metrics: [eventCount],
  },
  "ga4.key_events_sources": {
    dimensions: [date, eventName, custom("traffic_class"), custom("traffic_source")],
    metrics: [eventCount],
  },
} as const satisfies Record<string, Ga4ReportSpec>;

export type Ga4ReportKey = keyof typeof ga4Reports;
export const ga4ReportKeys = Object.keys(ga4Reports) as Ga4ReportKey[];

export function isGa4ReportKey(value: string): value is Ga4ReportKey {
  return Object.prototype.hasOwnProperty.call(ga4Reports, value);
}

const PAGE_SIZE = 10_000;

type RunReportResponse = {
  rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
  rowCount?: number;
};

type CompatibilityResponse = {
  dimensionCompatibilities?: Array<{ compatibility?: string }>;
  metricCompatibilities?: Array<{ compatibility?: string }>;
};

function toIsoDate(ga: string): string | null {
  return /^\d{8}$/.test(ga) ? `${ga.slice(0, 4)}-${ga.slice(4, 6)}-${ga.slice(6, 8)}` : null;
}

/** Turns one API response into fact rows. Exported for the fixture tests. */
export function normalizeGa4Rows(report: Ga4ReportKey, response: RunReportResponse): FactRow[] {
  const spec = ga4Reports[report];
  const rows: FactRow[] = [];

  for (const row of response.rows ?? []) {
    const dimensionValues = row.dimensionValues ?? [];
    const metricValues = row.metricValues ?? [];
    if (dimensionValues.length !== spec.dimensions.length || metricValues.length !== spec.metrics.length) {
      throw new ProviderError("invalid_response");
    }

    const day = toIsoDate(dimensionValues[0].value ?? "");
    if (!day) throw new ProviderError("invalid_response");

    const dims: Record<string, string> = {};
    spec.dimensions.slice(1).forEach((field, index) => {
      dims[field.key] = (dimensionValues[index + 1].value ?? "").slice(0, 300);
    });

    const metrics: Record<string, number> = {};
    spec.metrics.forEach((field, index) => {
      const value = Number(metricValues[index].value);
      if (!Number.isFinite(value)) throw new ProviderError("invalid_response");
      metrics[field.key] = value;
    });

    rows.push({ provider: "ga4", report, date: day, dims, metrics });
  }

  return rows;
}

function failFor(response: ProviderResponse): never {
  if (response.status === 401 || response.status === 403) throw new ProviderError("auth", response.status);
  if (response.status === 429) throw new ProviderError("quota", 429);
  /* Only the presence of the word is read; the message itself goes nowhere. */
  if (response.status === 400 && /incompatib/i.test(response.text)) throw new ProviderError("compatibility", 400);
  throw new ProviderError("http", response.status);
}

export function createGa4Adapter(input: { propertyId: string; token: TokenSource; fetch?: typeof fetch; timeoutMs?: number; gate?: RequestGate }): ProviderAdapter {
  const gate = input.gate ?? openGate;
  const doFetch = input.fetch ?? fetch;
  const base = `https://analyticsdata.googleapis.com/v1beta/properties/${input.propertyId}`;

  async function post<T>(method: "runReport" | "checkCompatibility", body: unknown): Promise<T> {
    const token = await input.token();
    const response = await gate(() =>
      fetchWithTimeout(
        doFetch,
        `${base}:${method}`,
        { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) },
        input.timeoutMs,
      ),
    );
    if (!response.ok) failFor(response);
    return parseJson<T>(response.text);
  }

  return {
    key: "ga4",
    reports: ga4ReportKeys,

    plan(_report, context) {
      return [{ phase: "recent", window: syncWindow(context.now) }];
    },

    async check(report) {
      if (!isGa4ReportKey(report)) throw new ProviderError("unknown_report");
      const spec = ga4Reports[report];
      const result = await post<CompatibilityResponse>("checkCompatibility", {
        dimensions: spec.dimensions.map((field) => ({ name: field.name })),
        metrics: spec.metrics.map((field) => ({ name: field.name })),
        compatibilityFilter: "INCOMPATIBLE",
      });
      const incompatible = [...(result.dimensionCompatibilities ?? []), ...(result.metricCompatibilities ?? [])].some(
        (entry) => entry.compatibility === "INCOMPATIBLE",
      );
      if (incompatible) throw new ProviderError("compatibility");
    },

    async fetch(report, plan: SyncPlan) {
      if (!isGa4ReportKey(report)) throw new ProviderError("unknown_report");
      const { window } = plan;
      const spec = ga4Reports[report];
      const rows: FactRow[] = [];
      let offset = 0;

      for (;;) {
        const page = await post<RunReportResponse>("runReport", {
          dateRanges: [{ startDate: window.start, endDate: window.end }],
          dimensions: spec.dimensions.map((field) => ({ name: field.name })),
          metrics: spec.metrics.map((field) => ({ name: field.name })),
          limit: PAGE_SIZE,
          offset,
          keepEmptyRows: false,
        });
        rows.push(...normalizeGa4Rows(report, page));
        const total = typeof page.rowCount === "number" ? page.rowCount : 0;
        offset += PAGE_SIZE;
        if (offset >= total || (page.rows ?? []).length === 0) break;
      }

      return rows;
    },
  };
}
