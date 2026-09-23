import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AnalyticsDashboardView, { PeriodSwitch } from "@/components/admin/analytics/dashboard";
import { periodRanges } from "@/lib/admin/analytics/periods";
import { buildDashboard, type DashboardInput } from "@/lib/admin/analytics/queries";
import type { FactRecord, SyncRunRecord } from "@/lib/admin/analytics/types";
import type { ProviderConfigStatus } from "@/lib/analytics-admin/synced-providers";

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
  runs: [{ provider: "ga4", report: "ga4.sources", status: "ok", startedAt: "2026-09-23T06:00:00Z", finishedAt: "2026-09-23T06:00:02Z", rowsUpserted: 40, error: null }],
  config: [
    { provider: "ga4", configured: true, missing: [] },
    { provider: "gsc", configured: false, missing: ["GSC_SITE_URL"] },
    { provider: "bing", configured: false, missing: ["BING_WEBMASTER_API_KEY", "BING_SITE_URL"] },
  ],
  enabled: true,
  hasFacts: { ga4: true },
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

  it("explains a missing configuration per provider by variable name, without a module-wide GA4 badge", () => {
    const unconfigured = buildDashboard({
      ranges,
      facts: [],
      inquiries: [],
      runs: [],
      config: [
        { provider: "ga4", configured: false, missing: ["GA4_PROPERTY_ID", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"] },
        { provider: "gsc", configured: false, missing: ["GSC_SITE_URL"] },
        { provider: "bing", configured: false, missing: ["BING_WEBMASTER_API_KEY"] },
      ],
      enabled: false,
      hasFacts: {},
    });
    const html = renderToStaticMarkup(<AnalyticsDashboardView data={unconfigured} />);
    expect(html).not.toContain("GA4 niet gekoppeld");
    expect(html).toContain("GA4_PROPERTY_ID, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
    expect(html).toContain("GSC_SITE_URL");
    expect(html).toContain("BING_WEBMASTER_API_KEY");
    expect(html).toContain("Google Analytics is niet gekoppeld; zie Synchronisatie onderaan.");
    expect(html.match(/Niet gekoppeld/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html).not.toContain("Vernieuw nu");
  });

  it("marks the chosen period", () => {
    const html = renderToStaticMarkup(<PeriodSwitch period={90} />);
    expect(html).toContain('href="/admin/analytics?period=90"');
    expect(html).toMatch(/aria-current="page"[^>]*>90 dagen/);
  });
});

const allConfigured: ProviderConfigStatus[] = [
  { provider: "ga4", configured: true, missing: [] },
  { provider: "gsc", configured: true, missing: [] },
  { provider: "bing", configured: true, missing: [] },
];
const only = (provider: ProviderConfigStatus["provider"]): ProviderConfigStatus[] =>
  allConfigured.map((entry) => (entry.provider === provider ? entry : { ...entry, configured: false, missing: [`${entry.provider.toUpperCase()}_VAR`] }));

const searchFacts: FactRecord[] = [
  f("gsc.totals", {}, { clicks: 42, impressions: 1200, ctr: 0.035, position: 7.4 }),
  { ...f("gsc.totals", {}, { clicks: 21, impressions: 900, ctr: 0.023, position: 9.1 }), date: "2026-08-10" },
  f("gsc.queries", { query: "ym creations" }, { clicks: 12, impressions: 30, ctr: 0.4, position: 1.2 }),
  f("gsc.queries", { query: "webshop laten maken amsterdam" }, { clicks: 9, impressions: 400, ctr: 0.0225, position: 8 }),
  { ...f("gsc.queries", { query: "webshop laten maken amsterdam" }, { clicks: 2, impressions: 380, ctr: 0.005, position: 11 }), date: "2026-08-10" },
  f("gsc.pages", { page: "https://ymcreations.com/nl/diensten/webshop-laten-maken" }, { clicks: 9, impressions: 500, ctr: 0.018, position: 8 }),
  f("gsc.countries", { country: "nld" }, { clicks: 40, impressions: 1000, ctr: 0.04, position: 7 }),
  f("gsc.devices", { device: "MOBILE" }, { clicks: 30, impressions: 800, ctr: 0.0375, position: 7 }),
];
const bingFacts: FactRecord[] = [
  f("bing.traffic", {}, { clicks: 0, impressions: 55 }),
  f("bing.queries", { query: "website laten maken" }, { clicks: 0, impressions: 20, avg_impression_position: 12 }),
  f("bing.crawl", {}, { crawled_pages: 31, in_index: 24 }),
];

const render = (input: Partial<DashboardInput>) =>
  renderToStaticMarkup(<AnalyticsDashboardView data={buildDashboard({ ranges, facts: [], inquiries: [], runs: [], config: allConfigured, enabled: true, hasFacts: {}, ...input })} />);

describe("the search blocks", () => {
  it("renders GA-only without inventing search figures", () => {
    const html = render({ facts, config: only("ga4"), hasFacts: { ga4: true } });
    expect(html).toContain('id="google-search"');
    expect(html).toContain("Search Console is niet gekoppeld");
    expect(html).toContain("Bing Webmaster Tools is niet gekoppeld");
    expect(html).toContain('id="acquisition"');
  });

  it("renders Search Console alone: totals, trend, brand split, queries, pages, countries, devices, AI notice", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const html = render({ facts: searchFacts, config: only("gsc"), hasFacts: { gsc: true }, gscSiteUrl: "sc-domain:ymcreations.com" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    expect(html).toContain("Klikken per dag vanuit Google");
    expect(html).toContain("42");
    expect(html).toContain("+100%");
    expect(html).toContain("Merk: klikken");
    expect(html).toContain("webshop laten maken amsterdam");
    expect(html).toContain("/nl/diensten/webshop-laten-maken");
    expect(html).toContain("Webshop");
    expect(html).toContain("NLD");
    expect(html).toContain("Mobiel");
    expect(html).toContain("kan dus lager zijn dan het totaal");
    expect(html).toContain("Open in Search Console");
    expect(html).toContain("resource_id=sc-domain%3Aymcreations.com");
    expect(html).toContain("Google Analytics is niet gekoppeld");
  });

  it("renders Bing alone with its Web + Chat wording, crawl block and no geo or device tables", () => {
    const html = render({ facts: bingFacts, config: only("bing"), hasFacts: { bing: true } });
    const bing = html.slice(html.indexOf('id="bing-search"'));
    expect(bing).toContain("Klikken (Web + Chat)");
    expect(bing).toContain("website laten maken");
    expect(bing).toContain("Gecrawlde pagina&#x27;s");
    expect(bing).toContain("Open Bing Webmaster Tools");
    expect(bing).not.toContain("Landen");
    expect(bing).not.toContain("Apparaten");
  });

  it("renders all providers together, with sessions, search clicks and inquiries in separate columns", () => {
    const html = render({
      facts: [...facts, ...searchFacts, ...bingFacts],
      inquiries: [{ receivedAt: "2026-09-20T09:00:00Z", origin: "contact", trafficClass: "organic_search", trafficSource: "google.com" }],
      hasFacts: { ga4: true, gsc: true, bing: true },
    });
    for (const id of ["acquisition", "google-search", "bing-search", "sync"]) expect(html, id).toContain(`id="${id}"`);
    const acquisition = html.slice(html.indexOf('id="acquisition"'), html.indexOf('id="sources"'));
    /* Google: 60 GA sessions, 42 Search Console clicks, 1 inquiry; never a sum of them. */
    expect(acquisition).toMatch(/Google<\/td><td[^>]*>60<\/td><td[^>]*>42<\/td><td[^>]*>1<\/td>/);
    /* Bing reported zero clicks: a 0, not a dash. GA saw no Bing sessions but did report sources: also 0. */
    expect(acquisition).toMatch(/Bing<\/td><td[^>]*>0<\/td><td[^>]*>0<\/td><td[^>]*>0<\/td>/);
    expect(acquisition).not.toContain("103");
  });

  it("shows a dash where a provider has no data", () => {
    const html = render({ facts: [], hasFacts: {} });
    const acquisition = html.slice(html.indexOf('id="acquisition"'), html.indexOf('id="sources"'));
    expect(acquisition).toMatch(/Google<\/td><td[^>]*>—<\/td><td[^>]*>—<\/td><td[^>]*>0<\/td>/);
  });

  it("shows a provider error per provider, with the failure class", () => {
    const runs: SyncRunRecord[] = [
      { provider: "gsc", report: "gsc.totals", status: "failed", startedAt: "2026-09-23T06:00:00Z", finishedAt: "2026-09-23T06:00:01Z", rowsUpserted: 0, error: "auth 403" },
      { provider: "bing", report: "bing.traffic", status: "failed", startedAt: "2026-09-23T06:00:00Z", finishedAt: "2026-09-23T06:00:01Z", rowsUpserted: 0, error: "http 500" },
      { provider: "ga4", report: "ga4.overview", status: "ok", startedAt: "2026-09-23T06:00:00Z", finishedAt: "2026-09-23T06:00:01Z", rowsUpserted: 3, error: null },
    ];
    const html = render({ facts, runs, hasFacts: { ga4: true } });
    const sync = html.slice(html.indexOf('id="sync"'));
    expect(sync).toContain("Toegang geweigerd");
    expect(sync).toContain("gsc.totals: auth 403");
    expect(sync).toContain("Fout bij ophalen");
    expect(sync).toContain("bing.traffic: http 500");
    expect(sync).toContain("Werkt");
    expect(sync).toContain("Vernieuw nu");
  });

  it("renders every period length", () => {
    for (const period of [7, 30, 90] as const) {
      const html = renderToStaticMarkup(
        <AnalyticsDashboardView
          data={buildDashboard({ ranges: periodRanges(period, new Date("2026-09-23T10:00:00Z")), facts: searchFacts, inquiries: [], runs: [], config: allConfigured, enabled: false, hasFacts: {} })}
        />,
      );
      expect(html).toContain('id="google-search"');
    }
  });

  it("shows insights only when a rule fires", () => {
    expect(render({ facts })).not.toContain('id="insights"');
    const html = render({
      facts: [
        ...facts,
        f("ga4.events", { event_name: "service_view", service_id: "ecommerce-development", cta_id: "(not set)", cta_target: "(not set)", package_id: "(not set)", placement: "(not set)" }, { event_count: 80 }),
      ],
    });
    expect(html).toContain('id="insights"');
    expect(html).toContain("Webshop werd 80 keer bekeken");
  });
});
