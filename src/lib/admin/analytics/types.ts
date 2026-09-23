import type { TrafficClass } from "@/lib/attribution/types";
import type { PageType } from "@/lib/analytics/events";
import type { ProviderHealth } from "@/lib/analytics-admin/types";
import type { SyncedProvider } from "@/lib/analytics-admin/synced-providers";

/**
 * What the analytics page shows, as values. Built by queries.ts from the
 * synced facts and the inquiries table; the components render these and
 * hold no logic of their own.
 */
export const periods = [7, 30, 90] as const;
export type Period = (typeof periods)[number];

/** Inclusive calendar range, YYYY-MM-DD. */
export type DateRange = { start: string; end: string };

export type PeriodRanges = {
  period: Period;
  /** The last `period` full days, ending yesterday. */
  current: DateRange;
  /** The `period` days before that. */
  previous: DateRange;
};

/** A figure now and in the period before, with the change as a fraction; null when there is nothing to compare against. */
export type Comparison = { current: number; previous: number; delta: number | null };

export type OverviewKey =
  | "sessions"
  | "users"
  | "engagedSessions"
  | "engagementRate"
  | "pageViews"
  | "keyEvents"
  | "inquiries"
  | "conversionRate";

export type Overview = Record<OverviewKey, Comparison>;

/** One day of a trend: sessions for GA, clicks for the search providers. */
export type DailyPoint = { date: string; value: number };

export type SourceRow = { channel: string; sourceMedium: string; sessions: number; engagedSessions: number; keyEvents: number };

export type InquiryClassRow = { trafficClass: TrafficClass | null; inquiries: number };
export type InquirySourceRow = { trafficClass: TrafficClass; trafficSource: string; inquiries: number };

/** One AI assistant: what GA saw of it (null when GA has no row) and what the inquiries say. */
export type AiRow = {
  source: string;
  sessions: number | null;
  engagedSessions: number | null;
  keyEvents: number | null;
  inquiries: number;
};

export type GeoRow = { country: string; region: string; city: string; sessions: number; keyEvents: number };

export type LandingRow = { landingPage: string; pageType: PageType; sessions: number; engagedSessions: number; keyEvents: number };

export type ServiceRow = { serviceId: string; label: string; views: number; ctaClicks: number };

export type PackageRow = { packageId: string; selections: number; ctaClicks: number; plannerCompletions: number };

export type CtaRow = { ctaId: string; ctaTarget: string; placement: string; count: number };

export type FunnelStep = {
  key: string;
  label: string;
  count: number;
  /** Share of the previous step that reached this one; null for the first step or a previous step of zero. */
  rateFromPrevious: number | null;
};

export type PlannerFunnel = { steps: FunnelStep[]; errors: Array<{ stepName: string; label: string; count: number }> };
export type ContactFunnel = { steps: FunnelStep[]; errors: number };

export type ReportStatus = {
  report: string;
  status: "ok" | "failed" | "running";
  at: string;
  rows: number | null;
  error: string | null;
};

/** One provider's synchronisation as the dashboard shows it. */
export type ProviderSyncStatus = {
  provider: SyncedProvider;
  label: string;
  /** From the configuration and the latest run of each report. */
  health: ProviderHealth;
  configured: boolean;
  /** The variables that are missing or malformed, by name. */
  missing: string[];
  lastSuccess: { at: string; rows: number } | null;
  lastFailure: { at: string; report: string; error: string } | null;
  lastRun: { at: string; report: string; status: ReportStatus["status"] } | null;
  /** The most recent run per report. */
  reports: ReportStatus[];
  /** Any fact row of this provider exists at all, so an empty block means "nothing in this period" rather than "never synced". */
  hasFacts: boolean;
  /** Separately configured pieces (Clarity: tag and export API), by label and variable name; never a value. */
  parts: Array<{ label: string; configured: boolean; variable: string }>;
};

export type SyncStatus = {
  enabled: boolean;
  providers: ProviderSyncStatus[];
  /** The fact read stopped at its ceiling; the oldest days of the window may be missing. */
  truncated: boolean;
};

/** Search figures for a set of rows: sums, and CTR and position re-weighted over them. Null where there is nothing to divide by. */
export type SearchMetrics = { clicks: number; impressions: number; ctr: number | null; position: number | null };

/** A query, page, country, device or appearance, now and before. */
export type SearchRow = {
  key: string;
  current: SearchMetrics;
  previous: SearchMetrics;
  clickChange: number;
  impressionChange: number;
  /** Only when the previous period had enough clicks for a percentage to mean something. */
  relativeClickChange: number | null;
};

export type SearchPageRow = SearchRow & { path: string; pageType: PageType; serviceId: string | null; serviceLabel: string | null; articleSlug: string | null };

export type SearchTotals = { current: SearchMetrics; previous: SearchMetrics; clicks: Comparison; impressions: Comparison };

export type BrandSplit = {
  branded: { clicks: Comparison; impressions: Comparison };
  nonBranded: { clicks: Comparison; impressions: Comparison };
  /** Branded share of the classified query clicks, now and before; null without clicks. */
  brandedShare: { current: number | null; previous: number | null };
};

export type GoogleSearchBlock = {
  /** Any Search Console totals exist in the current or previous period. */
  available: boolean;
  totals: SearchTotals;
  daily: { current: DailyPoint[]; previous: DailyPoint[] };
  brand: BrandSplit;
  queries: SearchRow[];
  risers: SearchRow[];
  fallers: SearchRow[];
  pages: SearchPageRow[];
  countries: SearchRow[];
  devices: SearchRow[];
  appearance: SearchRow[];
  consoleUrl: string;
};

export type BingCrawl = { date: string; metrics: Record<string, number> };

export type BingSearchBlock = {
  available: boolean;
  totals: { clicks: Comparison; impressions: Comparison };
  daily: { current: DailyPoint[]; previous: DailyPoint[] };
  /** Position here is Bing's average impression position, weighted by impressions. */
  queries: SearchRow[];
  pages: SearchPageRow[];
  crawl: BingCrawl | null;
  consoleUrl: string;
};

/**
 * One source seen three ways, side by side and never added up: GA
 * sessions (visits the tag measured), search clicks (what the search
 * engine counted), and inquiries (what the site recorded). Null is "no
 * data from that provider for this period"; 0 is a provider that reported
 * and had none. `searchClicks` is null for a source that has no search
 * console of its own.
 */
export type AcquisitionRow = {
  source: "google" | "bing" | "chatgpt";
  label: string;
  gaSessions: number | null;
  searchClicks: number | null;
  searchClicksApplicable: boolean;
  inquiries: number;
};

/** One behaviour signal from Clarity: a count, or null when the answer did not carry it. */
export type ClaritySignalKey = "rageClicks" | "deadClicks" | "quickbacks" | "excessiveScroll" | "scriptErrors" | "errorClicks";

export type ClarityProblemUrl = { path: string; signals: Array<{ key: ClaritySignalKey; count: number }>; total: number };

export type ClarityBlock = {
  /** The UTC day of the latest snapshot, or null when there is none. */
  snapshotDate: string | null;
  sessions: number | null;
  botSessions: number | null;
  scrollDepth: number | null;
  /** Seconds, as Clarity reports them. */
  engagementActive: number | null;
  engagementTotal: number | null;
  signals: Record<ClaritySignalKey, number | null>;
  problemUrls: ClarityProblemUrl[];
  consoleUrl: string;
};

export type Insight = { kind: "low_ctr_page" | "search_change" | "service_low_cta" | "source_no_inquiries"; text: string };

export type AnalyticsDashboard = {
  ranges: PeriodRanges;
  overview: Overview;
  daily: { current: DailyPoint[]; previous: DailyPoint[] };
  sources: SourceRow[];
  inquiriesByClass: InquiryClassRow[];
  inquiriesBySource: InquirySourceRow[];
  ai: AiRow[];
  geo: GeoRow[];
  landing: LandingRow[];
  services: ServiceRow[];
  packages: PackageRow[];
  ctas: CtaRow[];
  plannerFunnel: PlannerFunnel;
  contactFunnel: ContactFunnel;
  acquisition: AcquisitionRow[];
  googleSearch: GoogleSearchBlock;
  bingSearch: BingSearchBlock;
  clarity: ClarityBlock;
  insights: Insight[];
  sync: SyncStatus;
};

/** A synced row as the repository reads it back. */
export type FactRecord = {
  report: string;
  date: string;
  dims: Record<string, string>;
  metrics: Record<string, number>;
};

/** The four columns of an inquiry the dashboard needs. Never a name or an address. */
export type InquiryRecord = {
  receivedAt: string;
  origin: "contact" | "project_planner" | "websitecheck";
  trafficClass: TrafficClass | null;
  trafficSource: string | null;
};

export type SyncRunRecord = {
  provider: SyncedProvider;
  report: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  rowsUpserted: number | null;
  error: string | null;
};
