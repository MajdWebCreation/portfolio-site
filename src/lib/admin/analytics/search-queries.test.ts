import { describe, expect, it } from "vitest";
import { describeSearchPage } from "@/lib/admin/analytics/page-types";
import { periodRanges } from "@/lib/admin/analytics/periods";
import {
  SEARCH_TREND_MIN_CLICK_CHANGE,
  SEARCH_TREND_MIN_IMPRESSIONS,
  buildAcquisition,
  buildBingSearch,
  buildGoogleSearch,
  buildInsights,
  risersAndFallers,
  searchMetrics,
  searchRows,
} from "@/lib/admin/analytics/search-queries";
import type { FactRecord, InquiryRecord, SearchRow } from "@/lib/admin/analytics/types";

/* 23 September 2026 in Amsterdam: the current 7-day period is 16–22 Sep, the previous 9–15 Sep. */
const now = new Date("2026-09-23T10:00:00Z");
const ranges7 = periodRanges(7, now);
const cur = "2026-09-18";
const prev = "2026-09-11";

const fact = (report: string, date: string, dims: Record<string, string>, metrics: Record<string, number>): FactRecord => ({ report, date, dims, metrics });
const q = (date: string, query: string, clicks: number, impressions: number, position = 5) =>
  fact("gsc.queries", date, { query }, { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position });
const totals = (date: string, clicks: number, impressions: number, position = 6) => fact("gsc.totals", date, {}, { clicks, impressions, ctr: clicks / impressions, position });

describe("search metrics", () => {
  it("sums clicks and impressions and re-weights CTR and position by impressions", () => {
    const metrics = searchMetrics([totals(cur, 10, 100, 4), totals("2026-09-19", 0, 300, 12)]);
    expect(metrics).toEqual({ clicks: 10, impressions: 400, ctr: 0.025, position: 10 });
    expect(searchMetrics([])).toEqual({ clicks: 0, impressions: 0, ctr: null, position: null });
  });

  it("groups by a dimension with the current and previous period side by side", () => {
    const rows = searchRows([q(cur, "webdesign", 12, 200), q(prev, "webdesign", 4, 150), q("2026-08-01", "webdesign", 99, 999)], ranges7, "query");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "webdesign", clickChange: 8, impressionChange: 50, relativeClickChange: null });
    expect(rows[0].current.clicks).toBe(12);
    expect(rows[0].previous.clicks).toBe(4);
  });
});

describe("risers and fallers", () => {
  const row = (key: string, now: number, before: number, impressions: number): SearchRow => searchRows([q(cur, key, now, impressions), q(prev, key, before, impressions)], ranges7, "query")[0];

  it("needs enough impressions and a real change, and gives a percentage only on a sufficient base", () => {
    const rows = [
      row("groeit", 30, 12, 400),
      row("klein", 6, 1, 20),
      row("stil", 11, 10, 300),
      row("daalt", 2, 14, 250),
    ];
    const { risers, fallers } = risersAndFallers(rows);
    expect(risers.map((r) => r.key)).toEqual(["groeit"]);
    expect(risers[0].relativeClickChange).toBe(1.5);
    expect(fallers.map((r) => r.key)).toEqual(["daalt"]);
    expect(SEARCH_TREND_MIN_IMPRESSIONS).toBeGreaterThan(20);
    expect(SEARCH_TREND_MIN_CLICK_CHANGE).toBeGreaterThan(1);
  });

  it("does not print a large percentage on a trivial base", () => {
    const [small] = searchRows([q(cur, "nieuw", 6, 80), q(prev, "nieuw", 1, 80)], ranges7, "query");
    expect(small.clickChange).toBe(5);
    expect(small.relativeClickChange).toBeNull();
  });
});

describe("the Google Search block", () => {
  const facts: FactRecord[] = [
    totals(cur, 40, 1000, 7),
    totals(prev, 20, 800, 9),
    q(cur, "ym creations", 15, 40),
    q(cur, "YMCreations.com", 5, 10),
    q(cur, "website laten maken", 8, 500),
    q(prev, "ym creations", 10, 30),
    q(prev, "website laten maken", 2, 300),
    fact("gsc.pages", cur, { page: "https://ymcreations.com/nl/diensten/bedrijfswebsite" }, { clicks: 9, impressions: 600, ctr: 0.015, position: 8 }),
    fact("gsc.pages", cur, { page: "https://ymcreations.com/nl/blog/wat-kost-een-website" }, { clicks: 3, impressions: 90, ctr: 0.033, position: 12 }),
    fact("gsc.countries", cur, { country: "nld" }, { clicks: 30, impressions: 700, ctr: 0.04, position: 6 }),
    fact("gsc.devices", cur, { device: "MOBILE" }, { clicks: 25, impressions: 600, ctr: 0.04, position: 6 }),
  ];
  const block = buildGoogleSearch(facts, ranges7, "sc-domain:ymcreations.com");

  it("takes totals from the totals report, never from the queries", () => {
    expect(block.available).toBe(true);
    expect(block.totals.current).toEqual({ clicks: 40, impressions: 1000, ctr: 0.04, position: 7 });
    expect(block.totals.clicks).toEqual({ current: 40, previous: 20, delta: 1 });
    const queryClicks = block.queries.reduce((total, row) => total + row.current.clicks, 0);
    expect(queryClicks).toBe(28);
    expect(block.totals.current.clicks).not.toBe(queryClicks);
  });

  it("splits branded and non-branded query clicks and impressions, now and before", () => {
    expect(block.brand.branded.clicks).toEqual({ current: 20, previous: 10, delta: 1 });
    expect(block.brand.nonBranded.clicks).toEqual({ current: 8, previous: 2, delta: 3 });
    expect(block.brand.branded.impressions.current).toBe(50);
    expect(block.brand.nonBranded.impressions.current).toBe(500);
    expect(block.brand.brandedShare.current).toBeCloseTo(20 / 28);
    expect(block.brand.brandedShare.previous).toBeCloseTo(10 / 12);
  });

  it("maps landing pages to the site's registers", () => {
    expect(block.pages[0]).toMatchObject({ path: "/nl/diensten/bedrijfswebsite", pageType: "service", serviceId: "business-websites", serviceLabel: "Bedrijfswebsite" });
    expect(block.pages[1]).toMatchObject({ path: "/nl/blog/wat-kost-een-website", pageType: "article", articleSlug: "wat-kost-een-website", serviceId: null });
  });

  it("keeps countries and devices as Search Console reports them, and links to the property", () => {
    expect(block.countries.map((r) => r.key)).toEqual(["nld"]);
    expect(block.devices.map((r) => r.key)).toEqual(["MOBILE"]);
    expect(block.consoleUrl).toBe("https://search.google.com/search-console/performance/search-analytics?resource_id=sc-domain%3Aymcreations.com");
  });

  it("is unavailable without totals, for every period length", () => {
    for (const period of [7, 30, 90] as const) {
      const empty = buildGoogleSearch([], periodRanges(period, now), null);
      expect(empty.available).toBe(false);
      expect(empty.daily.current).toHaveLength(period);
      expect(empty.totals.current.ctr).toBeNull();
    }
  });

  it("puts a day in the right period for 30 and 90 days", () => {
    const old = [totals("2026-08-01", 5, 50)];
    expect(buildGoogleSearch(old, periodRanges(30, now), null).totals.clicks).toEqual({ current: 0, previous: 5, delta: -1 });
    expect(buildGoogleSearch(old, periodRanges(90, now), null).totals.clicks).toEqual({ current: 5, previous: 0, delta: null });
  });
});

describe("the Bing Search block", () => {
  it("sums daily traffic, re-weights the impression position of queries, and takes the latest crawl", () => {
    const block = buildBingSearch(
      [
        fact("bing.traffic", cur, {}, { clicks: 3, impressions: 90 }),
        fact("bing.traffic", prev, {}, { clicks: 1, impressions: 30 }),
        fact("bing.queries", "2026-09-14", { query: "webshop" }, { clicks: 1, impressions: 10, avg_impression_position: 4 }),
        fact("bing.queries", cur, { query: "webshop" }, { clicks: 2, impressions: 30, avg_impression_position: 8 }),
        fact("bing.crawl", "2026-09-14", {}, { in_index: 20 }),
        fact("bing.crawl", "2026-09-21", {}, { in_index: 24, crawl_errors: 1 }),
      ],
      ranges7,
    );
    expect(block.available).toBe(true);
    expect(block.totals.clicks).toEqual({ current: 3, previous: 1, delta: 2 });
    expect(block.queries[0]).toMatchObject({ key: "webshop", current: { clicks: 2, impressions: 30, position: 8 }, previous: { clicks: 1, position: 4 } });
    expect(block.crawl).toEqual({ date: "2026-09-21", metrics: { in_index: 24, crawl_errors: 1 } });
  });

  it("has no crawl and is unavailable without data", () => {
    const block = buildBingSearch([], ranges7);
    expect(block.available).toBe(false);
    expect(block.crawl).toBeNull();
  });
});

describe("acquisition side by side", () => {
  const inquiry = (source: string | null, receivedAt = `${cur}T10:00:00Z`): InquiryRecord => ({
    receivedAt,
    origin: "contact",
    trafficClass: source === "chatgpt.com" ? "ai_assistant" : source ? "organic_search" : "direct",
    trafficSource: source,
  });

  it("shows a dash for a provider without data and a zero for one that reported none", () => {
    const rows = buildAcquisition([fact("ga4.sources", cur, { channel: "Organic Search", source_medium: "google / organic" }, { sessions: 50 })], [inquiry("google.com")], ranges7);
    expect(rows).toEqual([
      { source: "google", label: "Google", gaSessions: 50, searchClicks: null, searchClicksApplicable: true, inquiries: 1 },
      { source: "bing", label: "Bing", gaSessions: 0, searchClicks: null, searchClicksApplicable: true, inquiries: 0 },
      { source: "chatgpt", label: "ChatGPT", gaSessions: 0, searchClicks: null, searchClicksApplicable: false, inquiries: 0 },
    ]);
  });

  it("keeps sessions, search clicks and inquiries apart, without a total", () => {
    const rows = buildAcquisition(
      [
        fact("ga4.sources", cur, { channel: "Organic Search", source_medium: "google / organic" }, { sessions: 50 }),
        fact("ga4.sources", cur, { channel: "Paid Search", source_medium: "google / cpc" }, { sessions: 7 }),
        fact("ga4.sources", cur, { channel: "AI Assistant", source_medium: "chatgpt.com / referral" }, { sessions: 4 }),
        totals(cur, 40, 1000),
        fact("bing.traffic", cur, {}, { clicks: 0, impressions: 12 }),
      ],
      [inquiry("google.com"), inquiry("chatgpt.com"), inquiry("google.com", "2026-08-01T10:00:00Z")],
      ranges7,
    );
    expect(rows.map((row) => [row.source, row.gaSessions, row.searchClicks, row.inquiries])).toEqual([
      ["google", 50, 40, 1],
      ["bing", 0, 0, 0],
      ["chatgpt", 4, null, 1],
    ]);
    expect(Object.keys(rows[0])).not.toContain("total");
  });

  it("shows GA as unavailable when GA has no source rows in the period", () => {
    expect(buildAcquisition([], [], ranges7).map((row) => row.gaSessions)).toEqual([null, null, null]);
  });
});

describe("insights", () => {
  const googleSearch = buildGoogleSearch(
    [
      totals(cur, 100, 2000),
      totals(prev, 60, 1500),
      fact("gsc.pages", cur, { page: "https://ymcreations.com/nl/tarieven" }, { clicks: 2, impressions: 400, ctr: 0.005, position: 9 }),
      fact("gsc.pages", cur, { page: "https://ymcreations.com/nl" }, { clicks: 80, impressions: 900, ctr: 0.09, position: 3 }),
    ],
    ranges7,
    null,
  );

  it("describes what was measured, by fixed rules, without causes", () => {
    const insights = buildInsights({
      googleSearch,
      services: [
        { serviceId: "business-websites", label: "Bedrijfswebsite", views: 120, ctaClicks: 1 },
        { serviceId: "ecommerce-development", label: "Webshop", views: 120, ctaClicks: 20 },
      ],
      acquisition: [
        { source: "google", label: "Google", gaSessions: 300, searchClicks: 100, searchClicksApplicable: true, inquiries: 0 },
        { source: "bing", label: "Bing", gaSessions: 20, searchClicks: 3, searchClicksApplicable: true, inquiries: 0 },
      ],
    });
    expect(insights.map((insight) => insight.kind)).toEqual(["low_ctr_page", "search_change", "service_low_cta", "source_no_inquiries"]);
    expect(insights[0].text).toContain("/nl/tarieven");
    expect(insights[1].text).toContain("hoger");
    expect(insights.map((insight) => insight.text).join(" ")).not.toMatch(/omdat|interessant|vinden/);
  });

  it("stays silent on small numbers", () => {
    const quiet = buildInsights({
      googleSearch: buildGoogleSearch([totals(cur, 3, 40), totals(prev, 1, 20)], ranges7, null),
      services: [{ serviceId: "business-websites", label: "Bedrijfswebsite", views: 10, ctaClicks: 0 }],
      acquisition: [{ source: "google", label: "Google", gaSessions: 30, searchClicks: 3, searchClicksApplicable: true, inquiries: 0 }],
    });
    expect(quiet).toEqual([]);
  });
});

describe("search page mapping", () => {
  it("reads English service pages, other routes and bare paths", () => {
    expect(describeSearchPage("https://ymcreations.com/en/services/business-websites")).toMatchObject({ pageType: "service", serviceId: "business-websites" });
    expect(describeSearchPage("https://ymcreations.com/nl/diensten/bestaat-niet")).toMatchObject({ pageType: "service", serviceId: null });
    expect(describeSearchPage("https://ymcreations.com/nl/tarieven")).toMatchObject({ path: "/nl/tarieven", pageType: "pricing", serviceId: null, articleSlug: null });
    expect(describeSearchPage("/nl")).toMatchObject({ pageType: "home" });
  });
});
