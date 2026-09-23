import { describe, expect, it, vi } from "vitest";
import { createGscAdapter, gscPlans, gscReportKeys, normalizeGscRows } from "@/lib/analytics-admin/providers/gsc";
import { ProviderError, type FetchResult, type SyncPlan } from "@/lib/analytics-admin/types";
import { createRequestGate } from "@/lib/analytics-admin/concurrency";
import { isBrandedQuery, normalizeQuery } from "@/lib/admin/analytics/branded";


const rowsOf = async (pending: Promise<unknown>) => ((await pending) as FetchResult).rows;
/**
 * Responses as the Search Analytics API shapes them, never fetched: every
 * test hands the adapter a fake fetch and reads back what it asked.
 */
const token = async () => "test-token";

type Call = { url: string; body: Record<string, unknown> };

function fakeApi(answer: (body: Record<string, unknown>) => unknown, status = 200) {
  const calls: Call[] = [];
  const doFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url: String(url), body });
    return new Response(JSON.stringify(answer(body)), { status });
  });
  return { calls, fetch: doFetch as unknown as typeof fetch };
}

const recent: SyncPlan = { phase: "recent", window: { start: "2026-09-19", end: "2026-09-22" } };
const final: SyncPlan = { phase: "final", window: { start: "2026-09-12", end: "2026-09-18" } };
const row = (keys: string[], clicks = 2, impressions = 40, ctr = 0.05, position = 7.5) => ({ keys, clicks, impressions, ctr, position });

describe("Search Console plans", () => {
  /* 06:00 UTC on 23 September is 23:00 on 22 September in Pacific time: the API's day. */
  const now = new Date("2026-09-23T06:00:00Z");

  it("reads fresh data for the last four Pacific days and settled data for the seven before", () => {
    expect(gscPlans("gsc.totals", now, false)).toEqual([
      { phase: "final", window: { start: "2026-09-12", end: "2026-09-18" } },
      { phase: "recent", window: { start: "2026-09-19", end: "2026-09-22" } },
    ]);
  });

  it("plans the query-page snapshot weekly, over 28 settled days", () => {
    const monday = new Date("2026-09-21T10:00:00Z");
    expect(gscPlans("gsc.query_page", now, false)).toEqual([]);
    expect(gscPlans("gsc.query_page", monday, false)).toEqual([{ phase: "snapshot", window: { start: "2026-08-21", end: "2026-09-17" } }]);
    expect(gscPlans("gsc.query_page", now, true)).toHaveLength(1);
  });
});

describe("the Search Console adapter", () => {
  it("knows exactly the planned reports", () => {
    expect(gscReportKeys).toEqual(["gsc.totals", "gsc.queries", "gsc.pages", "gsc.countries", "gsc.devices", "gsc.appearance", "gsc.query_page"]);
  });

  it("reads the totals per day, with fresh data in the recent phase", async () => {
    const api = fakeApi(() => ({ rows: [row(["2026-09-21"], 5, 100, 0.05, 8.2), row(["2026-09-22"], 1, 30, 0.033, 9)], responseAggregationType: "byProperty" }));
    const adapter = createGscAdapter({ siteUrl: "sc-domain:ymcreations.com", token, fetch: api.fetch });
    const rows = await rowsOf(adapter.fetch("gsc.totals", recent));

    expect(api.calls[0].url).toBe("https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aymcreations.com/searchAnalytics/query");
    expect(api.calls[0].body).toEqual({ type: "web", startDate: "2026-09-19", endDate: "2026-09-22", dimensions: ["date"], rowLimit: 25000, startRow: 0, dataState: "all" });
    expect(rows).toEqual([
      { provider: "gsc", report: "gsc.totals", date: "2026-09-21", dims: {}, metrics: { clicks: 5, impressions: 100, ctr: 0.05, position: 8.2 } },
      { provider: "gsc", report: "gsc.totals", date: "2026-09-22", dims: {}, metrics: { clicks: 1, impressions: 30, ctr: 0.033, position: 9 } },
    ]);
  });

  it("asks settled data only in the final phase", async () => {
    const api = fakeApi(() => ({ rows: [row(["2026-09-15"])] }));
    await createGscAdapter({ siteUrl: "https://www.ymcreations.com/", token, fetch: api.fetch }).fetch("gsc.totals", final);
    expect(api.calls[0].body.dataState).toBe("final");
    expect(api.calls[0].url).toContain("/sites/https%3A%2F%2Fwww.ymcreations.com%2F/");
  });

  it("reads the top queries one day at a time, 500 per day, dated that day", async () => {
    const api = fakeApi((body) => ({ rows: [row([`query for ${body.startDate}`])] }));
    const rows = await rowsOf(createGscAdapter({ siteUrl: "sc-domain:ymcreations.com", token, fetch: api.fetch }).fetch("gsc.queries", recent));
    expect(api.calls.map((call) => [call.body.startDate, call.body.endDate, call.body.rowLimit, call.body.dimensions])).toEqual([
      ["2026-09-19", "2026-09-19", 500, ["query"]],
      ["2026-09-20", "2026-09-20", 500, ["query"]],
      ["2026-09-21", "2026-09-21", 500, ["query"]],
      ["2026-09-22", "2026-09-22", 500, ["query"]],
    ]);
    expect(rows[3]).toMatchObject({ date: "2026-09-22", dims: { query: "query for 2026-09-22" } });
  });

  it.each([
    ["gsc.pages", ["date", "page"], ["2026-09-20", "https://ymcreations.com/nl/tarieven"], { page: "https://ymcreations.com/nl/tarieven" }],
    ["gsc.countries", ["date", "country"], ["2026-09-20", "nld"], { country: "nld" }],
    ["gsc.devices", ["date", "device"], ["2026-09-20", "MOBILE"], { device: "MOBILE" }],
    ["gsc.appearance", ["date", "searchAppearance"], ["2026-09-20", "VIDEO"], { appearance: "VIDEO" }],
  ] as const)("reads %s with its stored dimension names", async (report, dimensions, keys, dims) => {
    const api = fakeApi(() => ({ rows: [row([...keys])] }));
    const rows = await rowsOf(createGscAdapter({ siteUrl: "sc-domain:ymcreations.com", token, fetch: api.fetch }).fetch(report, recent));
    expect(api.calls[0].body.dimensions).toEqual(dimensions);
    expect(rows).toEqual([{ provider: "gsc", report, date: "2026-09-20", dims, metrics: { clicks: 2, impressions: 40, ctr: 0.05, position: 7.5 } }]);
  });

  it("stores the query-page snapshot on the window's last day, with its length", async () => {
    const api = fakeApi(() => ({ rows: [row(["website laten maken", "https://ymcreations.com/nl/diensten/bedrijfswebsite"])] }));
    const snapshot: SyncPlan = { phase: "snapshot", window: { start: "2026-08-20", end: "2026-09-16" } };
    const rows = await rowsOf(createGscAdapter({ siteUrl: "sc-domain:ymcreations.com", token, fetch: api.fetch }).fetch("gsc.query_page", snapshot));
    expect(api.calls[0].body).toMatchObject({ dimensions: ["query", "page"], rowLimit: 5000, dataState: "final" });
    expect(rows).toEqual([
      {
        provider: "gsc",
        report: "gsc.query_page",
        date: "2026-09-16",
        dims: { query: "website laten maken", page: "https://ymcreations.com/nl/diensten/bedrijfswebsite" },
        metrics: { clicks: 2, impressions: 40, ctr: 0.05, position: 7.5, window_days: 28 },
      },
    ]);
  });

  it("pages through large answers", async () => {
    let served = 0;
    const api = fakeApi((body) => {
      served += 1;
      const count = body.startRow === 0 ? 25_000 : 3;
      return { rows: Array.from({ length: count }, (_, index) => row(["2026-09-20", `https://ymcreations.com/p${String(body.startRow)}-${index}`])) };
    });
    const rows = await rowsOf(createGscAdapter({ siteUrl: "sc-domain:ymcreations.com", token, fetch: api.fetch }).fetch("gsc.pages", recent));
    expect(served).toBe(2);
    expect(api.calls[1].body.startRow).toBe(25_000);
    expect(rows).toHaveLength(25_003);
  });

  it("treats an answer without rows as empty", async () => {
    const api = fakeApi(() => ({ responseAggregationType: "byProperty" }));
    expect(await rowsOf(createGscAdapter({ siteUrl: "sc-domain:ymcreations.com", token, fetch: api.fetch }).fetch("gsc.totals", recent))).toEqual([]);
  });

  it.each([
    [401, "auth"],
    [403, "auth"],
    [429, "quota"],
    [500, "http"],
  ] as const)("classes HTTP %i as %s, without the body", async (status, kind) => {
    const api = fakeApi(() => ({ error: { message: "User does not have sufficient permission for site secret-site" } }), status);
    const adapter = createGscAdapter({ siteUrl: "sc-domain:ymcreations.com", token, fetch: api.fetch });
    const error = await adapter.fetch("gsc.totals", recent).catch((e: ProviderError) => e);
    expect(error).toMatchObject({ kind, status });
    expect(String((error as Error).message)).not.toContain("secret");
  });

  it("refuses malformed answers", () => {
    expect(() => normalizeGscRows("gsc.totals", "nonsense", null)).toThrow(ProviderError);
    expect(() => normalizeGscRows("gsc.totals", { rows: {} }, null)).toThrow("invalid_response");
    expect(() => normalizeGscRows("gsc.pages", { rows: [row(["2026-09-20"])] }, null)).toThrow("invalid_response");
    expect(() => normalizeGscRows("gsc.totals", { rows: [{ keys: ["2026-09-20"], clicks: "2", impressions: 1, ctr: 0, position: 1 }] }, null)).toThrow("invalid_response");
    expect(() => normalizeGscRows("gsc.totals", { rows: [row(["20260920"])] }, null)).toThrow("invalid_response");
  });

  it("classes a network failure and a broken body", async () => {
    const down = createGscAdapter({ siteUrl: "sc-domain:ymcreations.com", token, fetch: (async () => Promise.reject(new Error("offline"))) as unknown as typeof fetch });
    await expect(down.fetch("gsc.totals", recent)).rejects.toMatchObject({ kind: "network" });
    const garbled = createGscAdapter({ siteUrl: "sc-domain:ymcreations.com", token, fetch: (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch });
    await expect(garbled.fetch("gsc.totals", recent)).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("passes a refused token exchange through as auth", async () => {
    const adapter = createGscAdapter({
      siteUrl: "sc-domain:ymcreations.com",
      token: async () => {
        throw new ProviderError("auth", 400);
      },
      fetch: vi.fn() as unknown as typeof fetch,
    });
    await expect(adapter.fetch("gsc.totals", recent)).rejects.toMatchObject({ kind: "auth" });
  });
});

describe("query filtering and timeouts", () => {
  it("drops identifier-like queries before they become rows, and counts them", async () => {
    const api = fakeApi(() => ({
      rows: [row(["website laten maken"]), row(["jan@example.com"]), row(["0612345678"]), row(["https://ymcreations.com/nl"]), row(["  ym   creations "])],
    }));
    const result = (await createGscAdapter({ siteUrl: "sc-domain:ymcreations.com", token, fetch: api.fetch }).fetch("gsc.queries", {
      phase: "recent",
      window: { start: "2026-09-22", end: "2026-09-22" },
    })) as FetchResult;
    expect(result.rows.map((r) => r.dims.query)).toEqual(["website laten maken", "ym creations"]);
    expect(result.filtered).toBe(3);
  });

  it("filters the query of the query-page snapshot but not its page", async () => {
    const api = fakeApi(() => ({ rows: [row(["eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk", "https://ymcreations.com/nl"]), row(["webshop", "https://ymcreations.com/nl"])] }));
    const result = (await createGscAdapter({ siteUrl: "sc-domain:ymcreations.com", token, fetch: api.fetch }).fetch("gsc.query_page", {
      phase: "snapshot",
      window: { start: "2026-08-20", end: "2026-09-16" },
    })) as FetchResult;
    expect(result.rows.map((r) => r.dims)).toEqual([{ query: "webshop", page: "https://ymcreations.com/nl" }]);
    expect(result.filtered).toBe(1);
  });

  it("does not filter pages or other dimensions", () => {
    expect(normalizeGscRows("gsc.pages", { rows: [row(["2026-09-20", "https://ymcreations.com/nl/tarieven"])] }, null).rows).toHaveLength(1);
  });

  it("gives up on a request that hangs, as timeout", async () => {
    const hanging = (() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;
    const adapter = createGscAdapter({ siteUrl: "sc-domain:ymcreations.com", token, fetch: hanging, timeoutMs: 20 });
    await expect(adapter.fetch("gsc.totals", recent)).rejects.toMatchObject({ kind: "timeout" });
  });
});

describe("day requests of gsc.queries", () => {
  it("asks at most three days at once, each day exactly once, and returns them in day order", async () => {
    let running = 0;
    let peak = 0;
    const asked: string[] = [];
    const slowFetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { startDate: string };
      asked.push(body.startDate);
      running += 1;
      peak = Math.max(peak, running);
      /* Later days answer sooner, so arrival order is the reverse of day order. */
      await new Promise((resolve) => setTimeout(resolve, 30 - Number(body.startDate.slice(8, 10))));
      running -= 1;
      return new Response(JSON.stringify({ rows: [row([`q ${body.startDate}`])] }), { status: 200 });
    }) as unknown as typeof fetch;
    const eleven: SyncPlan = { phase: "final", window: { start: "2026-09-12", end: "2026-09-22" } };
    const rows = await rowsOf(createGscAdapter({ siteUrl: "sc-domain:ymcreations.com", token, fetch: slowFetch }).fetch("gsc.queries", eleven));

    expect(peak).toBe(3);
    expect(asked).toHaveLength(11);
    expect(new Set(asked).size).toBe(11);
    expect(rows.map((r) => r.date)).toEqual(["2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22"]);
  });

  it("keeps the provider-wide gate as the ceiling", async () => {
    let running = 0;
    let peak = 0;
    const slowFetch = (async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 3));
      running -= 1;
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    await createGscAdapter({ siteUrl: "sc-domain:ymcreations.com", token, fetch: slowFetch, gate: createRequestGate({ concurrency: 1 }) }).fetch("gsc.queries", recent);
    expect(peak).toBe(1);
  });
});

describe("branded queries", () => {
  it.each(["ym creations", "YM Creations", "ymcreations", "YM-Creations", "ymcreations.com", "website ym  creations amsterdam", "ＹＭ ｃｒｅａｔｉｏｎｓ"])("counts %s as branded", (query) => {
    expect(isBrandedQuery(query)).toBe(true);
  });

  it.each(["ym", "creations", "webdesign amsterdam", "ym creation", "gymcreations", "ymcreationsx"])("does not count %s as branded", (query) => {
    expect(isBrandedQuery(query)).toBe(false);
  });

  it("normalises case, joining punctuation and whitespace only", () => {
    expect(normalizeQuery("  YM_Creations /  Webshop ")).toBe("ym creations webshop");
  });
});
