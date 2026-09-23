import { describe, expect, it, vi } from "vitest";
import { bingPlans, createBingAdapter, normalizeBingRows, parseBingDate, readBingConfig, unwrapBing } from "@/lib/analytics-admin/providers/bing";
import { ProviderError, type FetchResult, type SyncPlan } from "@/lib/analytics-admin/types";


const rowsOf = async (pending: Promise<unknown>) => ((await pending) as FetchResult).rows;
/**
 * Answers as the Bing Webmaster JSON API shapes them (`{"d": [...]}`,
 * `/Date(ms-0700)/`), never fetched: every test hands the adapter a fake.
 */
const apiKey = "0123456789abcdef0123456789abcdef";
const siteUrl = "https://ymcreations.com/";
const plan: SyncPlan = { phase: "recent", window: { start: "2026-09-10", end: "2026-09-22" } };

/** Midnight Pacific (UTC-7) on a day, as Bing writes it. */
const pacificMidnight = (day: string) => `/Date(${Date.parse(`${day}T07:00:00Z`)}-0700)/`;

function fakeApi(body: string, status = 200) {
  const urls: URL[] = [];
  const doFetch = vi.fn(async (url: RequestInfo | URL) => {
    urls.push(new URL(String(url)));
    return new Response(body, { status });
  });
  return { urls, fetch: doFetch as unknown as typeof fetch };
}

const adapterFor = (api: { fetch: typeof fetch }) => createBingAdapter({ siteUrl, auth: { kind: "api_key", apiKey }, fetch: api.fetch });

describe("Bing configuration", () => {
  it("names what is missing, never a value", () => {
    expect(readBingConfig({})).toEqual({ ok: false, missing: ["BING_WEBMASTER_API_KEY", "BING_SITE_URL"] });
    expect(readBingConfig({ BING_WEBMASTER_API_KEY: "short", BING_SITE_URL: siteUrl })).toEqual({ ok: false, missing: ["BING_WEBMASTER_API_KEY"] });
    expect(readBingConfig({ BING_WEBMASTER_API_KEY: apiKey, BING_SITE_URL: "ymcreations.com" })).toEqual({ ok: false, missing: ["BING_SITE_URL"] });
    expect(readBingConfig({ BING_WEBMASTER_API_KEY: ` ${apiKey} `, BING_SITE_URL: "https://ymcreations.com" })).toEqual({
      ok: true,
      siteUrl,
      auth: { kind: "api_key", apiKey },
    });
  });
});

describe("Bing dates and wrapper", () => {
  it("reads the day in the value's own offset", () => {
    expect(parseBingDate("/Date(1316156400000-0700)/")).toBe("2011-09-16");
    expect(parseBingDate(pacificMidnight("2026-09-21"))).toBe("2026-09-21");
    expect(parseBingDate("/Date(1316156400000)/")).toBe("2011-09-16");
    expect(parseBingDate("/Date(1316131200000+0200)/")).toBe("2011-09-16");
    expect(parseBingDate("2011-09-16T00:00:00-07:00")).toBeNull();
    expect(parseBingDate(12)).toBeNull();
  });

  it("unwraps d, reads null as empty, and refuses anything else", () => {
    expect(unwrapBing({ d: [{ a: 1 }] })).toEqual([{ a: 1 }]);
    expect(unwrapBing({ d: null })).toEqual([]);
    expect(() => unwrapBing([{ a: 1 }])).toThrow("invalid_response");
    expect(() => unwrapBing({ d: "text" })).toThrow("invalid_response");
  });
});

describe("Bing plans", () => {
  it("syncs traffic daily over 14 Pacific days and the weekly-updated reports on Mondays over 42", () => {
    const tuesday = new Date("2026-09-23T06:00:00Z");
    const monday = new Date("2026-09-21T10:00:00Z");
    expect(bingPlans("bing.traffic", tuesday, false)).toEqual([{ phase: "recent", window: { start: "2026-09-09", end: "2026-09-22" } }]);
    expect(bingPlans("bing.queries", tuesday, false)).toEqual([]);
    expect(bingPlans("bing.queries", monday, false)).toEqual([{ phase: "recent", window: { start: "2026-08-11", end: "2026-09-21" } }]);
    expect(bingPlans("bing.crawl", tuesday, true)).toHaveLength(1);
  });
});

describe("the Bing adapter", () => {
  it("reads daily traffic, keeping only days in the window, and puts the key only in the request", async () => {
    const api = fakeApi(
      JSON.stringify({
        d: [
          { __type: "RankAndTrafficStats:#Microsoft.Bing.Webmaster.Api", Clicks: 4, Date: pacificMidnight("2026-09-21"), Impressions: 120 },
          { __type: "RankAndTrafficStats:#Microsoft.Bing.Webmaster.Api", Clicks: 9, Date: pacificMidnight("2026-03-01"), Impressions: 300 },
        ],
      }),
    );
    const rows = await rowsOf(adapterFor(api).fetch("bing.traffic", plan));
    expect(api.urls[0].origin + api.urls[0].pathname).toBe("https://ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats");
    expect(api.urls[0].searchParams.get("siteUrl")).toBe(siteUrl);
    expect(api.urls[0].searchParams.get("apikey")).toBe(apiKey);
    expect(rows).toEqual([{ provider: "bing", report: "bing.traffic", date: "2026-09-21", dims: {}, metrics: { clicks: 4, impressions: 120 } }]);
  });

  it("reads query stats with both positions", async () => {
    const api = fakeApi(
      JSON.stringify({
        d: [{ __type: "QueryStats:#Microsoft.Bing.Webmaster.Api", AvgClickPosition: 3, AvgImpressionPosition: 5.5, Clicks: 2, Date: pacificMidnight("2026-09-14"), Impressions: 40, Query: "webshop laten maken" }],
      }),
    );
    expect(await rowsOf(adapterFor(api).fetch("bing.queries", plan))).toEqual([
      {
        provider: "bing",
        report: "bing.queries",
        date: "2026-09-14",
        dims: { query: "webshop laten maken" },
        metrics: { clicks: 2, impressions: 40, avg_click_position: 3, avg_impression_position: 5.5 },
      },
    ]);
    expect(api.urls[0].pathname).toBe("/webmaster/api.svc/json/GetQueryStats");
  });

  it("reads page stats from the Query field as the page, leaving out a position Bing did not report", async () => {
    const api = fakeApi(
      JSON.stringify({ d: [{ AvgClickPosition: -1, AvgImpressionPosition: 8, Clicks: 0, Date: pacificMidnight("2026-09-14"), Impressions: 12, Query: "https://ymcreations.com/nl/tarieven" }] }),
    );
    expect(await rowsOf(adapterFor(api).fetch("bing.pages", plan))).toEqual([
      { provider: "bing", report: "bing.pages", date: "2026-09-14", dims: { page: "https://ymcreations.com/nl/tarieven" }, metrics: { clicks: 0, impressions: 12, avg_impression_position: 8 } },
    ]);
    expect(api.urls[0].pathname).toBe("/webmaster/api.svc/json/GetPageStats");
  });

  it("keeps only the crawl counters the answer has", async () => {
    const api = fakeApi(JSON.stringify({ d: [{ Date: pacificMidnight("2026-09-20"), CrawledPages: 31, CrawlErrors: 1, InIndex: 24, Code4xx: 1, Unknown: 5 }] }));
    expect(await rowsOf(adapterFor(api).fetch("bing.crawl", plan))).toEqual([
      { provider: "bing", report: "bing.crawl", date: "2026-09-20", dims: {}, metrics: { code_4xx: 1, crawled_pages: 31, crawl_errors: 1, in_index: 24 } },
    ]);
  });

  it("returns nothing for an empty list or d: null", async () => {
    expect(await rowsOf(adapterFor(fakeApi(JSON.stringify({ d: [] }))).fetch("bing.traffic", plan))).toEqual([]);
    expect(await rowsOf(adapterFor(fakeApi(JSON.stringify({ d: null }))).fetch("bing.traffic", plan))).toEqual([]);
  });

  it("classes an empty body as empty_response and garbage as invalid_response", async () => {
    await expect(adapterFor(fakeApi("")).fetch("bing.traffic", plan)).rejects.toMatchObject({ kind: "empty_response" });
    await expect(adapterFor(fakeApi("<html>")).fetch("bing.traffic", plan)).rejects.toMatchObject({ kind: "invalid_response" });
    await expect(adapterFor(fakeApi(JSON.stringify({ d: [{ Clicks: 1, Date: "yesterday", Impressions: 1 }] }))).fetch("bing.traffic", plan)).rejects.toMatchObject({
      kind: "invalid_response",
    });
    await expect(adapterFor(fakeApi(JSON.stringify({ d: [{ Clicks: "1", Date: pacificMidnight("2026-09-20"), Impressions: 1 }] }))).fetch("bing.traffic", plan)).rejects.toMatchObject({
      kind: "invalid_response",
    });
    expect(() => normalizeBingRows("bing.queries", { d: [{ Clicks: 1, Impressions: 1, Date: pacificMidnight("2026-09-20") }] }, plan)).toThrow(ProviderError);
  });

  it("classes an invalid key as auth, throttling as quota, other 400s as http, without the message", async () => {
    const answer = (code: number) => fakeApi(JSON.stringify({ ErrorCode: code, Message: `secret detail ${apiKey}` }), 400);
    const invalidKey = await adapterFor(answer(3)).fetch("bing.traffic", plan).catch((e: ProviderError) => e);
    expect(invalidKey).toMatchObject({ kind: "auth", status: 400 });
    expect(String((invalidKey as Error).message)).not.toContain("secret");
    expect(String((invalidKey as Error).message)).not.toContain(apiKey);
    await expect(adapterFor(answer(14)).fetch("bing.traffic", plan)).rejects.toMatchObject({ kind: "auth" });
    await expect(adapterFor(answer(4)).fetch("bing.traffic", plan)).rejects.toMatchObject({ kind: "quota" });
    await expect(adapterFor(answer(7)).fetch("bing.traffic", plan)).rejects.toMatchObject({ kind: "http", status: 400 });
    await expect(adapterFor(fakeApi("not json", 400)).fetch("bing.traffic", plan)).rejects.toMatchObject({ kind: "http", status: 400 });
  });

  it("classes provider failures and a network failure", async () => {
    await expect(adapterFor(fakeApi("", 500)).fetch("bing.traffic", plan)).rejects.toMatchObject({ kind: "http", status: 500 });
    await expect(adapterFor(fakeApi("", 401)).fetch("bing.traffic", plan)).rejects.toMatchObject({ kind: "auth", status: 401 });
    const down = createBingAdapter({ siteUrl, auth: { kind: "api_key", apiKey }, fetch: (async () => Promise.reject(new Error(`offline ${apiKey}`))) as unknown as typeof fetch });
    const error = await down.fetch("bing.traffic", plan).catch((e: ProviderError) => e);
    expect(error).toMatchObject({ kind: "network" });
    expect(String((error as Error).message)).not.toContain(apiKey);
  });
});

describe("Bing query filtering and timeouts", () => {
  it("drops identifier-like queries and counts them, and leaves page URLs alone", async () => {
    const date = pacificMidnight("2026-09-14");
    const query = (Query: string) => ({ AvgClickPosition: 1, AvgImpressionPosition: 2, Clicks: 1, Date: date, Impressions: 5, Query });
    const queries = (await adapterFor(fakeApi(JSON.stringify({ d: [query("webshop"), query("info@example.com"), query("+31 6 12345678")] }))).fetch(
      "bing.queries",
      plan,
    )) as FetchResult;
    expect(queries.rows.map((r) => r.dims.query)).toEqual(["webshop"]);
    expect(queries.filtered).toBe(2);

    const pages = (await adapterFor(fakeApi(JSON.stringify({ d: [query("https://ymcreations.com/nl/contact")] }))).fetch("bing.pages", plan)) as FetchResult;
    expect(pages.rows.map((r) => r.dims.page)).toEqual(["https://ymcreations.com/nl/contact"]);
    expect(pages.filtered).toBe(0);
  });

  it("gives up on a request that hangs, as timeout, without the key in the error", async () => {
    const hanging = (() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;
    const adapter = createBingAdapter({ siteUrl, auth: { kind: "api_key", apiKey }, fetch: hanging, timeoutMs: 20 });
    const error = await adapter.fetch("bing.traffic", plan).catch((e: Error) => e);
    expect(error).toMatchObject({ kind: "timeout" });
    expect(String((error as Error).message)).not.toContain(apiKey);
  });
});
