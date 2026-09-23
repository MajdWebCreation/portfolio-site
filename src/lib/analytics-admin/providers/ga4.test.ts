import { describe, expect, it, vi } from "vitest";
import { createGa4Adapter, ga4ReportKeys, ga4Reports, normalizeGa4Rows, type Ga4ReportKey } from "@/lib/analytics-admin/providers/ga4";
import { ProviderError } from "@/lib/analytics-admin/types";

/**
 * Responses as the Analytics Data API shapes them, never fetched: every
 * test hands the adapter a fake fetch.
 */
const window = { start: "2026-09-20", end: "2026-09-22" };
const plan = { phase: "recent" as const, window };

function apiRow(dimensions: string[], metrics: (string | number)[]) {
  return { dimensionValues: dimensions.map((value) => ({ value })), metricValues: metrics.map((value) => ({ value: String(value) })) };
}

const fixtures: Record<Ga4ReportKey, { rows: ReturnType<typeof apiRow>[]; rowCount: number }> = {
  "ga4.overview": { rows: [apiRow(["20260922"], [120, 90, 60, 80, "0.6667", 300, 3])], rowCount: 1 },
  "ga4.sources": {
    rows: [
      apiRow(["20260922", "Organic Search", "google / organic"], [70, 55, 2]),
      apiRow(["20260922", "AI Assistant", "chatgpt.com / ai-assistant"], [8, 7, 1]),
      apiRow(["20260921", "Direct", "(direct) / (none)"], [30, 15, 0]),
    ],
    rowCount: 3,
  },
  "ga4.first_user_sources": { rows: [apiRow(["20260922", "google / organic"], [40, 1])], rowCount: 1 },
  "ga4.geo": { rows: [apiRow(["20260922", "Netherlands", "North Holland", "Amsterdam"], [50, 2]), apiRow(["20260922", "Belgium", "(not set)", "(not set)"], [3, 0])], rowCount: 2 },
  "ga4.devices": { rows: [apiRow(["20260922", "mobile", "Chrome"], [61])], rowCount: 1 },
  "ga4.landing": { rows: [apiRow(["20260922", "/nl/diensten/bedrijfswebsite"], [22, 18, 1])], rowCount: 1 },
  "ga4.events": {
    rows: [
      apiRow(["20260922", "service_view", "business-websites", "(not set)", "(not set)", "(not set)", "(not set)"], [22]),
      apiRow(["20260922", "cta_click", "(not set)", "home_hero_contact", "contact", "(not set)", "hero"], [9]),
    ],
    rowCount: 2,
  },
  "ga4.funnel": { rows: [apiRow(["20260922", "planner_step", "scope", "starter", "next"], [6])], rowCount: 1 },
  "ga4.key_events_sources": { rows: [apiRow(["20260922", "planner_complete", "ai_assistant", "chatgpt.com"], [1])], rowCount: 1 },
};

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init ?? {}));
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function adapterWith(handler: Parameters<typeof fakeFetch>[0], token = async () => "token-abc") {
  const fetchSpy = fakeFetch(handler);
  return { adapter: createGa4Adapter({ propertyId: "123456", token, fetch: fetchSpy as unknown as typeof fetch }), fetchSpy };
}

describe("normalizeGa4Rows, per report", () => {
  for (const report of ga4ReportKeys) {
    it(`${report}: stored names, ISO dates, numeric metrics`, () => {
      const rows = normalizeGa4Rows(report, fixtures[report]);
      expect(rows.length).toBe(fixtures[report].rows.length);
      for (const row of rows) {
        expect(row.provider).toBe("ga4");
        expect(row.report).toBe(report);
        expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(Object.keys(row.dims)).toEqual(ga4Reports[report].dimensions.slice(1).map((field) => field.key));
        expect(Object.keys(row.metrics)).toEqual(ga4Reports[report].metrics.map((field) => field.key));
        for (const value of Object.values(row.metrics)) expect(Number.isFinite(value)).toBe(true);
      }
    });
  }

  it("maps the sources report the way the dashboard reads it", () => {
    expect(normalizeGa4Rows("ga4.sources", fixtures["ga4.sources"])[1]).toEqual({
      provider: "ga4",
      report: "ga4.sources",
      date: "2026-09-22",
      dims: { channel: "AI Assistant", source_medium: "chatgpt.com / ai-assistant" },
      metrics: { sessions: 8, engaged_sessions: 7, key_events: 1 },
    });
  });

  it("strips the customEvent prefix and keeps GA's (not set)", () => {
    const [view] = normalizeGa4Rows("ga4.events", fixtures["ga4.events"]);
    expect(view.dims).toEqual({ event_name: "service_view", service_id: "business-websites", cta_id: "(not set)", cta_target: "(not set)", package_id: "(not set)", placement: "(not set)" });
    const [attribution] = normalizeGa4Rows("ga4.key_events_sources", fixtures["ga4.key_events_sources"]);
    expect(attribution.dims).toEqual({ event_name: "planner_complete", traffic_class: "ai_assistant", traffic_source: "chatgpt.com" });
  });

  it("refuses a response whose shape does not match the report", () => {
    expect(() => normalizeGa4Rows("ga4.overview", { rows: [apiRow(["20260922", "extra"], [1])] })).toThrow(ProviderError);
    expect(() => normalizeGa4Rows("ga4.overview", { rows: [apiRow(["2026-09-22"], [1, 2, 3, 4, 5, 6, 7])] })).toThrow(ProviderError);
    expect(() => normalizeGa4Rows("ga4.devices", { rows: [apiRow(["20260922", "mobile", "Chrome"], ["many"])] })).toThrow(ProviderError);
    expect(normalizeGa4Rows("ga4.overview", {})).toEqual([]);
  });
});

describe("createGa4Adapter", () => {
  it("runs a report with the bearer token, the window and the spec, and pages through the result", async () => {
    const calls: unknown[] = [];
    const { adapter, fetchSpy } = adapterWith((url, init) => {
      const body = JSON.parse(String(init.body));
      calls.push({ url, auth: (init.headers as Record<string, string>).authorization, body });
      if (body.offset === 0) return json({ rows: fixtures["ga4.sources"].rows.slice(0, 2), rowCount: 3 });
      return json({ rows: fixtures["ga4.sources"].rows.slice(2), rowCount: 3 });
    });
    /* The fixture pages are small; the adapter pages by its own size, so simulate rowCount > one page. */
    const rows = await adapter.fetch("ga4.sources", plan);
    expect(rows).toHaveLength(2);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(calls[0]).toMatchObject({
      url: "https://analyticsdata.googleapis.com/v1beta/properties/123456:runReport",
      auth: "Bearer token-abc",
      body: {
        dateRanges: [{ startDate: "2026-09-20", endDate: "2026-09-22" }],
        dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }, { name: "sessionSourceMedium" }],
        metrics: [{ name: "sessions" }, { name: "engagedSessions" }, { name: "keyEvents" }],
        offset: 0,
      },
    });
  });

  it("keeps fetching while rowCount says there is more", async () => {
    let call = 0;
    const { adapter, fetchSpy } = adapterWith(() => {
      call += 1;
      return json({ rows: [apiRow([`2026092${call}`], [1, 1, 1, 1, "0.5", 1, 0])], rowCount: 10_001 });
    });
    const rows = (await adapter.fetch("ga4.overview", plan)) as Array<{ date: string }>;
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(rows.map((r) => r.date)).toEqual(["2026-09-21", "2026-09-22"]);
  });

  it("classes 401 and 403 as auth, 429 as quota, other statuses as http", async () => {
    for (const [status, kind] of [
      [401, "auth"],
      [403, "auth"],
      [429, "quota"],
      [500, "http"],
    ] as const) {
      const { adapter } = adapterWith(() => json({ error: { message: "secret detail" } }, status));
      await expect(adapter.fetch("ga4.overview", plan)).rejects.toMatchObject({ kind, status });
      await expect(adapter.fetch("ga4.overview", plan)).rejects.toThrow(`${kind} ${status}`);
    }
  });

  it("classes an incompatible 400 as compatibility, and never repeats the message", async () => {
    const { adapter } = adapterWith(() => json({ error: { message: "Please remove sessionSource: it is incompatible with totalUsers" } }, 400));
    const error = await adapter.fetch("ga4.sources", plan).catch((e: ProviderError) => e);
    expect(error).toMatchObject({ kind: "compatibility", status: 400 });
    expect(String(error)).not.toContain("sessionSource");
  });

  it("classes a network failure and an unreadable body", async () => {
    const { adapter: down } = adapterWith(() => {
      throw new TypeError("fetch failed");
    });
    await expect(down.fetch("ga4.geo", plan)).rejects.toMatchObject({ kind: "network" });

    const { adapter: garbled } = adapterWith(() => new Response("<html>", { status: 200 }));
    await expect(garbled.fetch("ga4.geo", plan)).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("checks compatibility and fails a report the API marks incompatible", async () => {
    const { adapter, fetchSpy } = adapterWith((url) =>
      url.endsWith(":checkCompatibility")
        ? json({ dimensionCompatibilities: [{ dimensionMetadata: { apiName: "city" }, compatibility: "INCOMPATIBLE" }], metricCompatibilities: [] })
        : json({}),
    );
    await expect(adapter.check?.("ga4.geo")).rejects.toMatchObject({ kind: "compatibility" });
    expect(String(fetchSpy.mock.calls[0][0])).toContain(":checkCompatibility");

    const { adapter: fine } = adapterWith(() => json({ dimensionCompatibilities: [], metricCompatibilities: [] }));
    await expect(fine.check?.("ga4.geo")).resolves.toBeUndefined();
  });

  it("refuses a report it does not know", async () => {
    const { adapter } = adapterWith(() => json({}));
    await expect(adapter.fetch("gsc.queries", plan)).rejects.toMatchObject({ kind: "unknown_report" });
  });

  it("surfaces a token failure as the token's error", async () => {
    const { adapter, fetchSpy } = adapterWith(
      () => json({}),
      async () => {
        throw new ProviderError("auth", 401);
      },
    );
    await expect(adapter.fetch("ga4.overview", plan)).rejects.toMatchObject({ kind: "auth" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
