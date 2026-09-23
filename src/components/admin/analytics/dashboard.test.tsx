import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AnalyticsDashboardView, { PeriodSwitch } from "@/components/admin/analytics/dashboard";
import { periodRanges } from "@/lib/admin/analytics/periods";
import { buildDashboard } from "@/lib/admin/analytics/queries";
import type { FactRecord } from "@/lib/admin/analytics/types";

/*
  The page as HTML, from fixture facts: every block renders with a value,
  and rendering reaches no network. The refresh button is a client
  component; the server render shows it in its idle state.
*/
vi.mock("@/lib/admin/analytics/actions", () => ({
  refreshAnalyticsAction: async () => ({ status: "idle" }),
}));

const ranges = periodRanges(30, new Date("2026-09-23T10:00:00Z"));
const day = "2026-09-20";
const f = (report: string, dims: Record<string, string>, metrics: Record<string, number>): FactRecord => ({ report, date: day, dims, metrics });

const facts: FactRecord[] = [
  f("ga4.overview", {}, { sessions: 120, total_users: 100, new_users: 80, engaged_sessions: 70, engagement_rate: 0.58, page_views: 400, key_events: 4 }),
  { ...f("ga4.overview", {}, { sessions: 90, total_users: 80, new_users: 60, engaged_sessions: 40, engagement_rate: 0.44, page_views: 300, key_events: 2 }), date: "2026-08-10" },
  f("ga4.sources", { channel: "Organic Search", source_medium: "google / organic" }, { sessions: 60, engaged_sessions: 40, key_events: 2 }),
  f("ga4.sources", { channel: "AI Assistant", source_medium: "chatgpt.com / ai-assistant" }, { sessions: 9, engaged_sessions: 8, key_events: 1 }),
  f("ga4.geo", { country: "Netherlands", region: "North Holland", city: "Amsterdam" }, { sessions: 50, key_events: 2 }),
  f("ga4.landing", { landing_page: "/nl/tarieven" }, { sessions: 30, engaged_sessions: 20, key_events: 1 }),
  f("ga4.events", { event_name: "service_view", service_id: "business-websites", cta_id: "(not set)", cta_target: "(not set)", package_id: "(not set)", placement: "(not set)" }, { event_count: 25 }),
  f("ga4.events", { event_name: "cta_click", service_id: "(not set)", cta_id: "home_hero_contact", cta_target: "contact", package_id: "(not set)", placement: "hero" }, { event_count: 7 }),
  f("ga4.events", { event_name: "pricing_package_select", service_id: "(not set)", cta_id: "(not set)", cta_target: "(not set)", package_id: "business", placement: "(not set)" }, { event_count: 11 }),
  f("ga4.funnel", { event_name: "planner_start", step_name: "(not set)", project_type: "(not set)", direction: "(not set)" }, { event_count: 12 }),
  f("ga4.funnel", { event_name: "planner_step", step_name: "project_type", project_type: "business", direction: "next" }, { event_count: 9 }),
  f("ga4.funnel", { event_name: "planner_complete", step_name: "(not set)", project_type: "business", direction: "(not set)" }, { event_count: 3 }),
  f("ga4.funnel", { event_name: "planner_error", step_name: "scope", project_type: "business", direction: "(not set)" }, { event_count: 2 }),
  f("ga4.funnel", { event_name: "contact_start", step_name: "(not set)", project_type: "(not set)", direction: "(not set)" }, { event_count: 15 }),
  f("ga4.funnel", { event_name: "contact_submit", step_name: "(not set)", project_type: "(not set)", direction: "(not set)" }, { event_count: 5 }),
];

const data = buildDashboard({
  ranges,
  facts,
  inquiries: [
    { receivedAt: "2026-09-20T09:00:00Z", origin: "project_planner", trafficClass: "ai_assistant", trafficSource: "chatgpt.com" },
    { receivedAt: "2026-09-21T09:00:00Z", origin: "contact", trafficClass: "direct", trafficSource: null },
    { receivedAt: "2026-09-21T10:00:00Z", origin: "contact", trafficClass: null, trafficSource: null },
  ],
  runs: [{ report: "ga4.sources", status: "ok", startedAt: "2026-09-23T06:00:00Z", finishedAt: "2026-09-23T06:00:02Z", rowsUpserted: 40, error: null }],
  config: { configured: true, missing: [], enabled: true },
  hasFacts: true,
});

describe("the analytics dashboard", () => {
  it("renders every block with fixture data, without any network", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const html = renderToStaticMarkup(<AnalyticsDashboardView data={data} />);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    for (const id of ["overview", "sources", "ai", "geo", "landing", "services", "ctas", "planner-funnel", "contact-funnel", "sync"]) {
      expect(html, id).toContain(`id="${id}"`);
    }
    expect(html).toContain("Sessies");
    expect(html).toContain("120");
    expect(html).toContain("+33%");
    expect(html).toContain("google / organic");
    expect(html).toContain("chatgpt.com");
    expect(html).toContain("Amsterdam");
    expect(html).toContain("/nl/tarieven");
    expect(html).toContain("Bedrijfswebsite");
    expect(html).toContain("home_hero_contact");
    expect(html).toContain("Fouten bij Scope");
    expect(html).toContain("Vernieuw nu");
    expect(html).toContain("Niet vastgelegd");
    expect(html).toContain("Direct / onbekend");
    expect(html).toContain("<svg");
  });

  it("explains a missing configuration by variable name and shows no empty chart without a reason", () => {
    const unconfigured = buildDashboard({
      ranges,
      facts: [],
      inquiries: [],
      runs: [],
      config: { configured: false, missing: ["GA4_PROPERTY_ID", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"], enabled: false },
      hasFacts: false,
    });
    const html = renderToStaticMarkup(<AnalyticsDashboardView data={unconfigured} />);
    expect(html).toContain("GA4 niet gekoppeld");
    expect(html).toContain("GA4_PROPERTY_ID, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
    expect(html).toContain("GA4 is niet gekoppeld; zie Synchronisatie onderaan.");
    expect(html).not.toContain("Vernieuw nu");
  });

  it("marks the chosen period", () => {
    const html = renderToStaticMarkup(<PeriodSwitch period={90} />);
    expect(html).toContain('href="/admin/analytics?period=90"');
    expect(html).toMatch(/aria-current="page"[^>]*>90 dagen/);
  });
});
