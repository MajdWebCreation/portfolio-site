import { describe, expect, it, vi } from "vitest";
import { clarityPath, clarityPlans, createClarityAdapter, normalizeClarity, readClarityConfig } from "@/lib/analytics-admin/providers/clarity";
import type { FetchResult, SyncPlan } from "@/lib/analytics-admin/types";

/*
  Answers shaped like Microsoft's documented sample (Traffic, with the
  dimension as a key of each information row). The fields of the other
  metrics are not documented; the fixtures use plausible names and the
  tests pin down that whatever numeric fields arrive are kept, and nothing
  else.
*/
const token = "eyJhbGciOiJSUzI1NiJ9.test-token-value-for-tests";
const plan: SyncPlan = { phase: "snapshot", window: { start: "2026-09-21", end: "2026-09-23" } };

function fakeApi(body: unknown, status = 200) {
  const urls: URL[] = [];
  const headers: Array<Record<string, string>> = [];
  const doFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    urls.push(new URL(String(url)));
    headers.push(init?.headers as Record<string, string>);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  });
  return { urls, headers, fetch: doFetch as unknown as typeof fetch };
}

const perUrl = [
  {
    metricName: "Traffic",
    information: [
      { totalSessionCount: "40", totalBotSessionCount: "3", distantUserCount: "31", PagesPerSessionPercentage: 1.8, URL: "https://ymcreations.com/nl/tarieven?utm_source=x&email=a@b.nl" },
      { totalSessionCount: "12", totalBotSessionCount: "0", distantUserCount: "10", PagesPerSessionPercentage: 1.2, URL: "https://ymcreations.com/nl/incasso/abc123token" },
    ],
  },
  { metricName: "RageClickCount", information: [{ sessionsCount: "2", subTotal: "7", sessionsWithMetricPercentage: 5, URL: "https://ymcreations.com/nl/tarieven" }] },
  { metricName: "Scroll Depth", information: [{ averageScrollDepth: 61.5, URL: "https://ymcreations.com/nl/tarieven#pakketten" }] },
  { metricName: "PageTitle", information: [{ name: "Tarieven", sessionsCount: "40", URL: "https://ymcreations.com/nl/tarieven" }] },
  { metricName: "ReferrerUrl", information: [{ name: "https://mail.example.com/?u=jan", sessionsCount: "1" }] },
];

describe("Clarity configuration and plans", () => {
  it("needs a token and names only the variable", () => {
    expect(readClarityConfig({})).toEqual({ ok: false, missing: ["CLARITY_API_TOKEN"] });
    expect(readClarityConfig({ CLARITY_API_TOKEN: "short" })).toEqual({ ok: false, missing: ["CLARITY_API_TOKEN"] });
    expect(readClarityConfig({ CLARITY_API_TOKEN: ` ${token} ` })).toEqual({ ok: true, token });
  });

  it("takes one 72-hour snapshot a day, dated the UTC day of the call", () => {
    expect(clarityPlans(new Date("2026-09-23T06:00:00Z"), false)).toEqual([{ phase: "snapshot", window: { start: "2026-09-21", end: "2026-09-23" } }]);
  });
});

describe("the Clarity adapter", () => {
  it("asks the documented endpoint for three days by URL, with the token only in the header", async () => {
    const api = fakeApi(perUrl);
    await createClarityAdapter({ token, fetch: api.fetch }).fetch("clarity.live", plan);
    expect(api.urls[0].origin + api.urls[0].pathname).toBe("https://www.clarity.ms/export-data/api/v1/project-live-insights");
    expect(Object.fromEntries(api.urls[0].searchParams)).toEqual({ numOfDays: "3", dimension1: "URL" });
    expect(api.urls[0].toString()).not.toContain(token);
    expect(api.headers[0].authorization).toBe(`Bearer ${token}`);
  });

  it("asks the project totals without a dimension", async () => {
    const api = fakeApi([{ metricName: "Traffic", information: [{ totalSessionCount: "52", totalBotSessionCount: "3", distantUserCount: "41", PagesPerSessionPercentage: 1.6 }] }]);
    const result = (await createClarityAdapter({ token, fetch: api.fetch }).fetch("clarity.totals", plan)) as FetchResult;
    expect(Object.fromEntries(api.urls[0].searchParams)).toEqual({ numOfDays: "3" });
    expect(result.rows).toEqual([
      {
        provider: "clarity",
        report: "clarity.totals",
        date: "2026-09-23",
        dims: {},
        metrics: { traffic_total_session_count: 52, traffic_total_bot_session_count: 3, traffic_distant_user_count: 41, traffic_pages_per_session_percentage: 1.6 },
      },
    ]);
  });

  it("keeps paths only, merges what becomes one path, drops excluded routes and unknown metrics", () => {
    const result = normalizeClarity("clarity.live", perUrl, "2026-09-23");
    expect(result.rows).toEqual([
      {
        provider: "clarity",
        report: "clarity.live",
        date: "2026-09-23",
        dims: { url: "/nl/tarieven" },
        metrics: {
          traffic_total_session_count: 40,
          traffic_total_bot_session_count: 3,
          traffic_distant_user_count: 31,
          traffic_pages_per_session_percentage: 1.8,
          rage_clicks_sessions_count: 2,
          rage_clicks_sub_total: 7,
          rage_clicks_sessions_with_metric_percentage: 5,
          scroll_depth_average_scroll_depth: 61.5,
        },
      },
    ]);
    expect(result.filtered).toBe(1);
    const stored = JSON.stringify(result.rows);
    for (const leak of ["utm_source", "a@b.nl", "abc123token", "Tarieven", "mail.example.com", "jan"]) expect(stored).not.toContain(leak);
  });

  it("merges counts of two URLs that are the same path, and drops their averages", () => {
    const result = normalizeClarity(
      "clarity.live",
      [
        { metricName: "DeadClickCount", information: [{ subTotal: "2", URL: "https://ymcreations.com/nl/?a=1" }, { subTotal: "3", URL: "https://ymcreations.com/nl" }] },
        { metricName: "ScrollDepth", information: [{ averageScrollDepth: 40, URL: "https://ymcreations.com/nl?b=2" }, { averageScrollDepth: 80, URL: "https://ymcreations.com/nl/" }] },
      ],
      "2026-09-23",
    );
    expect(result.rows).toEqual([{ provider: "clarity", report: "clarity.live", date: "2026-09-23", dims: { url: "/nl" }, metrics: { dead_clicks_sub_total: 5 } }]);
  });

  it.each([
    ["https://ymcreations.com/nl/diensten/bedrijfswebsite", "/nl/diensten/bedrijfswebsite"],
    ["https://ymcreations.com/", "/"],
    ["/en/pricing?x=1", "/en/pricing"],
    ["https://ymcreations.com/nl/betaling/afgerond?id=tr_123", null],
    ["https://ymcreations.com/admin/analytics", null],
    ["https://ymcreations.com/nl/jan@example.com", null],
    ["https://ymcreations.com/nl/0612345678", null],
    ["not a url", null],
    ["", null],
  ])("reads %s as %s", (raw, path) => {
    expect(clarityPath(raw)).toBe(path);
  });

  it("classes failures without the body and treats malformed answers as invalid", async () => {
    await expect(createClarityAdapter({ token, fetch: fakeApi("", 401).fetch }).fetch("clarity.live", plan)).rejects.toMatchObject({ kind: "auth", status: 401 });
    await expect(createClarityAdapter({ token, fetch: fakeApi("Exceeded daily limit", 429).fetch }).fetch("clarity.live", plan)).rejects.toMatchObject({ kind: "quota" });
    await expect(createClarityAdapter({ token, fetch: fakeApi("", 400).fetch }).fetch("clarity.live", plan)).rejects.toMatchObject({ kind: "http", status: 400 });
    await expect(createClarityAdapter({ token, fetch: fakeApi("").fetch }).fetch("clarity.live", plan)).rejects.toMatchObject({ kind: "empty_response" });
    await expect(createClarityAdapter({ token, fetch: fakeApi("<html>").fetch }).fetch("clarity.live", plan)).rejects.toMatchObject({ kind: "invalid_response" });
    expect(() => normalizeClarity("clarity.live", { metricName: "Traffic" }, "2026-09-23")).toThrow("invalid_response");
    expect(() => normalizeClarity("clarity.live", [{ metricName: "Traffic", information: "x" }], "2026-09-23")).toThrow("invalid_response");
    expect(normalizeClarity("clarity.live", [], "2026-09-23")).toEqual({ rows: [], filtered: 0 });
  });

  it("gives up on a request that hangs, as timeout", async () => {
    const hanging = (() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;
    await expect(createClarityAdapter({ token, fetch: hanging, timeoutMs: 20 }).fetch("clarity.totals", plan)).rejects.toMatchObject({ kind: "timeout" });
  });
});
