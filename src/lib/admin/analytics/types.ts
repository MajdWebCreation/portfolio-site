import type { TrafficClass } from "@/lib/attribution/types";
import type { PageType } from "@/lib/analytics/events";

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

export type DailyPoint = { date: string; sessions: number };

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

export type SyncStatus = {
  /** All three Google variables are set and well-formed. */
  configured: boolean;
  /** The variables that are missing or malformed, by name. */
  missing: string[];
  enabled: boolean;
  lastSuccess: { at: string; rows: number } | null;
  lastFailure: { at: string; report: string; error: string } | null;
  /** The most recent run per report. */
  reports: ReportStatus[];
  /** Any fact row exists at all, so an empty block means "nothing in this period" rather than "never synced". */
  hasFacts: boolean;
};

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
  origin: "contact" | "project_planner";
  trafficClass: TrafficClass | null;
  trafficSource: string | null;
};

export type SyncRunRecord = {
  report: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  rowsUpserted: number | null;
  error: string | null;
};
