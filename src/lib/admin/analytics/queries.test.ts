import { describe, expect, it } from "vitest";
import { daysOf, periodRanges, resolvePeriod } from "@/lib/admin/analytics/periods";
import {
  buildAiReferrals,
  buildContactFunnel,
  buildDashboard,
  buildInquiriesByClass,
  buildLanding,
  buildOverview,
  buildPlannerFunnel,
  buildProviderSyncStatus,
  buildSyncStatus,
  factRecordFromRow,
} from "@/lib/admin/analytics/queries";
import type { FactRecord, InquiryRecord, SyncRunRecord } from "@/lib/admin/analytics/types";

/* 23 September 2026 in Amsterdam: the current 7-day period is 16–22 Sep, the previous 9–15 Sep. */
const now = new Date("2026-09-23T10:00:00Z");
const ranges7 = periodRanges(7, now);

const fact = (report: string, date: string, dims: Record<string, string>, metrics: Record<string, number>): FactRecord => ({ report, date, dims, metrics });

function overviewDay(date: string, sessions: number, engaged = Math.round(sessions / 2), keyEvents = 0): FactRecord {
  return fact("ga4.overview", date, {}, { sessions, total_users: sessions, new_users: sessions - 1, engaged_sessions: engaged, engagement_rate: 0.5, page_views: sessions * 3, key_events: keyEvents });
}

const inquiry = (receivedAt: string, trafficClass: InquiryRecord["trafficClass"], trafficSource: string | null = null): InquiryRecord => ({
  receivedAt,
  origin: "contact",
  trafficClass,
  trafficSource,
});

describe("periods", () => {
  it("resolves 7, 30 and 90 and defaults to 30", () => {
    expect(resolvePeriod("7")).toBe(7);
    expect(resolvePeriod(["90"])).toBe(90);
    expect(resolvePeriod("14")).toBe(30);
    expect(resolvePeriod(undefined)).toBe(30);
  });

  it("ends yesterday and puts the previous period right before it, for every length", () => {
    expect(ranges7).toEqual({ period: 7, current: { start: "2026-09-16", end: "2026-09-22" }, previous: { start: "2026-09-09", end: "2026-09-15" } });
    expect(periodRanges(30, now)).toEqual({ period: 30, current: { start: "2026-08-24", end: "2026-09-22" }, previous: { start: "2026-07-25", end: "2026-08-23" } });
    expect(periodRanges(90, now)).toEqual({ period: 90, current: { start: "2026-06-25", end: "2026-09-22" }, previous: { start: "2026-03-27", end: "2026-06-24" } });
    expect(daysOf(ranges7.current)).toHaveLength(7);
  });
});

describe("buildOverview", () => {
  it("sums the current period, the previous one, and the delta", () => {
    const facts = [overviewDay("2026-09-16", 10, 5, 1), overviewDay("2026-09-22", 30, 15, 1), overviewDay("2026-09-10", 20, 10, 0), overviewDay("2026-09-23", 999)];
    const inquiries = [inquiry("2026-09-17T09:00:00Z", "organic_search", "google.com"), inquiry("2026-09-20T09:00:00Z", null), inquiry("2026-09-12T09:00:00Z", "direct")];
    const overview = buildOverview(facts, inquiries, ranges7);

    expect(overview.sessions).toEqual({ current: 40, previous: 20, delta: 1 });
    expect(overview.keyEvents).toEqual({ current: 2, previous: 0, delta: null });
    expect(overview.inquiries).toEqual({ current: 2, previous: 1, delta: 1 });
    expect(overview.engagementRate.current).toBeCloseTo(0.5);
    expect(overview.conversionRate).toEqual({ current: 0.05, previous: 0.05, delta: 0 });
  });

  it("never divides by zero: no sessions means a rate of 0 and no delta", () => {
    const overview = buildOverview([], [inquiry("2026-09-17T09:00:00Z", "direct")], ranges7);
    expect(overview.conversionRate).toEqual({ current: 0, previous: 0, delta: null });
    expect(overview.sessions).toEqual({ current: 0, previous: 0, delta: null });
    expect(overview.engagementRate.current).toBe(0);
  });

  it("copes with partial data: a period with some days missing still sums what is there", () => {
    const overview = buildOverview([overviewDay("2026-09-18", 7)], [], ranges7);
    expect(overview.sessions.current).toBe(7);
  });
});

describe("attribution blocks", () => {
  it("counts inquiries per class in register order, with unrecorded ones last", () => {
    const rows = buildInquiriesByClass(
      [
        inquiry("2026-09-17T09:00:00Z", "ai_assistant", "chatgpt.com"),
        inquiry("2026-09-17T10:00:00Z", "organic_search", "google.com"),
        inquiry("2026-09-18T09:00:00Z", "ai_assistant", "perplexity.ai"),
        inquiry("2026-09-18T11:00:00Z", null),
        inquiry("2026-09-01T09:00:00Z", "social", "linkedin.com"),
      ],
      ranges7,
    );
    expect(rows).toEqual([
      { trafficClass: "organic_search", inquiries: 1 },
      { trafficClass: "ai_assistant", inquiries: 2 },
      { trafficClass: null, inquiries: 1 },
    ]);
  });

  it("joins GA's AI channel with the inquiries that named an assistant, without inventing either", () => {
    const facts = [
      fact("ga4.sources", "2026-09-17", { channel: "AI Assistant", source_medium: "chatgpt.com / ai-assistant" }, { sessions: 8, engaged_sessions: 6, key_events: 1 }),
      fact("ga4.sources", "2026-09-18", { channel: "Referral", source_medium: "perplexity.ai / referral" }, { sessions: 3, engaged_sessions: 2, key_events: 0 }),
      fact("ga4.sources", "2026-09-18", { channel: "Organic Search", source_medium: "google / organic" }, { sessions: 50, engaged_sessions: 30, key_events: 2 }),
      fact("ga4.sources", "2026-09-18", { channel: "Direct", source_medium: "(direct) / (none)" }, { sessions: 20, engaged_sessions: 5, key_events: 0 }),
      fact("ga4.sources", "2026-09-10", { channel: "AI Assistant", source_medium: "chatgpt.com / ai-assistant" }, { sessions: 99, engaged_sessions: 99, key_events: 9 }),
    ];
    const inquiries = [inquiry("2026-09-19T09:00:00Z", "ai_assistant", "chatgpt.com"), inquiry("2026-09-19T10:00:00Z", "ai_assistant", "claude.ai")];

    expect(buildAiReferrals(facts, inquiries, ranges7)).toEqual([
      { source: "chatgpt.com", sessions: 8, engagedSessions: 6, keyEvents: 1, inquiries: 1 },
      { source: "perplexity.ai", sessions: 3, engagedSessions: 2, keyEvents: 0, inquiries: 0 },
      { source: "claude.ai", sessions: null, engagedSessions: null, keyEvents: null, inquiries: 1 },
    ]);
  });
});

describe("landing and funnels", () => {
  it("maps landing pages to a page type", () => {
    const rows = buildLanding(
      [
        fact("ga4.landing", "2026-09-17", { landing_page: "/nl/diensten/bedrijfswebsite" }, { sessions: 5, engaged_sessions: 4, key_events: 0 }),
        fact("ga4.landing", "2026-09-18", { landing_page: "/nl/diensten/bedrijfswebsite" }, { sessions: 6, engaged_sessions: 4, key_events: 1 }),
        fact("ga4.landing", "2026-09-18", { landing_page: "(not set)" }, { sessions: 1, engaged_sessions: 0, key_events: 0 }),
      ],
      ranges7,
    );
    expect(rows).toEqual([
      { landingPage: "/nl/diensten/bedrijfswebsite", pageType: "service", sessions: 11, engagedSessions: 8, keyEvents: 1 },
      { landingPage: "(not set)", pageType: "other", sessions: 1, engagedSessions: 0, keyEvents: 0 },
    ]);
  });

  it("builds the planner funnel with pass-through rates, ignoring back moves, and errors per step", () => {
    const f = (name: string, step: string, direction: string, count: number, date = "2026-09-17") =>
      fact("ga4.funnel", date, { event_name: name, step_name: step, project_type: "starter", direction }, { event_count: count });
    const facts = [
      f("planner_start", "(not set)", "(not set)", 20),
      f("planner_step", "project_type", "next", 16),
      f("planner_step", "scope", "next", 8),
      f("planner_step", "scope", "back", 3),
      f("planner_step", "planning", "next", 6),
      f("planner_step", "contact", "next", 0),
      f("planner_complete", "(not set)", "(not set)", 4),
      f("planner_error", "scope", "(not set)", 5),
      f("planner_error", "(not set)", "(not set)", 1),
      f("planner_start", "(not set)", "(not set)", 500, "2026-09-01"),
    ];
    const funnel = buildPlannerFunnel(facts, ranges7);
    expect(funnel.steps.map((s) => [s.key, s.count, s.rateFromPrevious])).toEqual([
      ["planner_start", 20, null],
      ["step_project_type", 16, 0.8],
      ["step_scope", 8, 0.5],
      ["step_planning", 6, 0.75],
      ["step_contact", 0, 0],
      ["planner_complete", 4, null],
    ]);
    expect(funnel.errors).toEqual([
      { stepName: "scope", label: "Scope", count: 5 },
      { stepName: "other", label: "Onbekende stap", count: 1 },
    ]);
  });

  it("builds the contact funnel", () => {
    const f = (name: string, count: number) => fact("ga4.funnel", "2026-09-20", { event_name: name, step_name: "(not set)", project_type: "(not set)", direction: "(not set)" }, { event_count: count });
    const funnel = buildContactFunnel([f("contact_start", 10), f("contact_submit", 3), f("contact_error", 4)], ranges7);
    expect(funnel.steps.map((s) => [s.count, s.rateFromPrevious])).toEqual([
      [10, null],
      [3, 0.3],
    ]);
    expect(funnel.errors).toBe(4);
  });
});

describe("sync status", () => {
  const run = (report: string, status: string, startedAt: string, rows: number | null, error: string | null = null): SyncRunRecord => ({
    provider: report.split(".")[0] as SyncRunRecord["provider"],
    report,
    status,
    startedAt,
    finishedAt: startedAt,
    rowsUpserted: rows,
    error,
  });
  const configured = { configured: true, missing: [] };

  it("reports the last success as a batch, the last failure, the last run and the latest run per report", () => {
    const status = buildProviderSyncStatus(
      "ga4",
      [
        run("ga4.overview", "ok", "2026-09-23T06:00:01Z", 3),
        run("ga4.sources", "failed", "2026-09-23T06:00:02Z", 0, "quota 429"),
        run("ga4.geo", "ok", "2026-09-23T06:00:03Z", 40),
        run("ga4.sources", "ok", "2026-09-22T06:00:02Z", 12),
        run("gsc.totals", "ok", "2026-09-23T06:01:00Z", 7),
      ],
      configured,
      true,
    );
    expect(status.lastSuccess).toEqual({ at: "2026-09-23T06:00:03Z", rows: 43 });
    expect(status.lastFailure).toEqual({ at: "2026-09-23T06:00:02Z", report: "ga4.sources", error: "quota 429" });
    expect(status.lastRun).toEqual({ at: "2026-09-23T06:00:03Z", report: "ga4.geo", status: "ok" });
    expect(status.health).toBe("provider_error");
    expect(status.reports.map((r) => [r.report, r.status])).toEqual([
      ["ga4.geo", "ok"],
      ["ga4.overview", "ok"],
      ["ga4.sources", "failed"],
    ]);
  });

  it("derives the health of each provider from its configuration and latest runs", () => {
    const sync = buildSyncStatus({
      runs: [run("gsc.totals", "failed", "2026-09-23T06:00:00Z", 0, "auth 403"), run("bing.traffic", "ok", "2026-09-23T06:00:00Z", 14)],
      config: [
        { provider: "ga4", configured: false, missing: ["GA4_PROPERTY_ID"] },
        { provider: "gsc", ...configured },
        { provider: "bing", ...configured },
        { provider: "clarity", configured: false, missing: ["CLARITY_API_TOKEN"] },
      ],
      enabled: false,
      hasFacts: { bing: true },
    });
    expect(sync.providers.map((p) => [p.provider, p.health, p.hasFacts])).toEqual([
      ["ga4", "not_configured", false],
      ["gsc", "auth_failed", false],
      ["bing", "ok", true],
      ["clarity", "not_configured", false],
    ]);
    expect(sync.providers[0]).toMatchObject({ label: "Google Analytics", missing: ["GA4_PROPERTY_ID"], lastSuccess: null, lastFailure: null, lastRun: null, reports: [] });
  });

  it("shows a configured provider without runs as configured, and a later success clears an older failure", () => {
    const sync = buildSyncStatus({
      runs: [run("bing.traffic", "failed", "2026-09-22T06:00:00Z", 0, "http 500"), run("bing.traffic", "ok", "2026-09-23T06:00:00Z", 14)],
      config: [
        { provider: "ga4", ...configured },
        { provider: "gsc", ...configured },
        { provider: "bing", ...configured },
        { provider: "clarity", ...configured },
      ],
      enabled: true,
      hasFacts: {},
    });
    expect(sync.providers.map((p) => p.health)).toEqual(["configured", "configured", "ok", "configured"]);
  });
});

describe("buildDashboard", () => {
  it("renders every block from nothing without throwing", () => {
    const dashboard = buildDashboard({ ranges: ranges7, facts: [], inquiries: [], runs: [], config: [], enabled: false, hasFacts: {} });
    expect(dashboard.daily.current).toHaveLength(7);
    expect(dashboard.sources).toEqual([]);
    expect(dashboard.plannerFunnel.steps).toHaveLength(6);
    expect(dashboard.overview.conversionRate.delta).toBeNull();
  });

  it("drops a malformed fact row instead of failing the page", () => {
    expect(factRecordFromRow({ report: "ga4.geo", date: "2026-09-17", dims: "broken", metrics: {} })).toBeNull();
    expect(factRecordFromRow({ report: "ga4.geo", date: "2026-09-17", dims: { city: "Amsterdam", n: 1 }, metrics: { sessions: 2, note: "x" } })).toEqual({
      report: "ga4.geo",
      date: "2026-09-17",
      dims: { city: "Amsterdam" },
      metrics: { sessions: 2 },
    });
  });
});
