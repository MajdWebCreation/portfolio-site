import { aiSources } from "@/lib/attribution/sources";
import { isTrafficClass, trafficClasses, type TrafficClass } from "@/lib/attribution/types";
import { inRange } from "@/lib/admin/analytics/periods";
import { compare, daily, sum } from "@/lib/admin/analytics/aggregate";
import { isPlannerStepName, pageTypeForLandingPage, plannerStepLabels, plannerStepOrder, serviceLabel } from "@/lib/admin/analytics/page-types";
import { isAuthFailure, type ProviderHealth } from "@/lib/analytics-admin/types";
import { syncedProviders, type ProviderConfigStatus, type SyncedProvider } from "@/lib/analytics-admin/synced-providers";
import { providerLabels } from "@/lib/admin/analytics/providers";
import { buildAcquisition, buildBingSearch, buildGoogleSearch, buildInsights } from "@/lib/admin/analytics/search-queries";
import { buildClarity } from "@/lib/admin/analytics/clarity-queries";
import type {
  AiRow,
  AnalyticsDashboard,
  ContactFunnel,
  CtaRow,
  FactRecord,
  FunnelStep,
  GeoRow,
  InquiryClassRow,
  InquiryRecord,
  InquirySourceRow,
  LandingRow,
  Overview,
  PackageRow,
  PeriodRanges,
  PlannerFunnel,
  ProviderSyncStatus,
  ReportStatus,
  ServiceRow,
  SourceRow,
  SyncRunRecord,
  SyncStatus,
} from "@/lib/admin/analytics/types";

/**
 * From rows to the dashboard, as pure functions.
 *
 * Everything here takes the synced facts and the inquiry records for the
 * whole window (previous period through current) and produces the blocks
 * the page renders. No I/O, no date arithmetic beyond the ranges it is
 * given, so the tests can hand it fixtures and check every number.
 */
const NOT_SET = "(not set)";




/** Sums rows by a key of their dimensions; the reducer keeps the metrics summed per group. */
function groupBy<T>(rows: FactRecord[], key: (row: FactRecord) => string, build: (rows: FactRecord[]) => T): T[] {
  const groups = new Map<string, FactRecord[]>();
  for (const row of rows) {
    const id = key(row);
    const group = groups.get(id);
    if (group) group.push(row);
    else groups.set(id, [row]);
  }
  return [...groups.values()].map(build);
}

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export function buildOverview(facts: FactRecord[], inquiries: InquiryRecord[], ranges: PeriodRanges): Overview {
  const overview = facts.filter((row) => row.report === "ga4.overview");
  const inPeriod = (which: "current" | "previous") => overview.filter((row) => inRange(row.date, ranges[which]));
  const inquiriesIn = (which: "current" | "previous") => inquiries.filter((row) => inRange(row.receivedAt.slice(0, 10), ranges[which])).length;

  const current = inPeriod("current");
  const previous = inPeriod("previous");
  const sessionsNow = sum(current, "sessions");
  const sessionsBefore = sum(previous, "sessions");
  const inquiriesNow = inquiriesIn("current");
  const inquiriesBefore = inquiriesIn("previous");

  return {
    sessions: compare(sessionsNow, sessionsBefore),
    users: compare(sum(current, "total_users"), sum(previous, "total_users")),
    engagedSessions: compare(sum(current, "engaged_sessions"), sum(previous, "engaged_sessions")),
    engagementRate: compare(rate(sum(current, "engaged_sessions"), sessionsNow), rate(sum(previous, "engaged_sessions"), sessionsBefore)),
    pageViews: compare(sum(current, "page_views"), sum(previous, "page_views")),
    keyEvents: compare(sum(current, "key_events"), sum(previous, "key_events")),
    inquiries: compare(inquiriesNow, inquiriesBefore),
    conversionRate: compare(rate(inquiriesNow, sessionsNow), rate(inquiriesBefore, sessionsBefore)),
  };
}

export function buildSources(facts: FactRecord[], ranges: PeriodRanges): SourceRow[] {
  const rows = facts.filter((row) => row.report === "ga4.sources" && inRange(row.date, ranges.current));
  return groupBy(
    rows,
    (row) => `${row.dims.channel}|${row.dims.source_medium}`,
    (group) => ({
      channel: group[0].dims.channel ?? NOT_SET,
      sourceMedium: group[0].dims.source_medium ?? NOT_SET,
      sessions: sum(group, "sessions"),
      engagedSessions: sum(group, "engaged_sessions"),
      keyEvents: sum(group, "key_events"),
    }),
  ).sort((a, b) => b.sessions - a.sessions);
}

export function buildInquiriesByClass(inquiries: InquiryRecord[], ranges: PeriodRanges): InquiryClassRow[] {
  const current = inquiries.filter((row) => inRange(row.receivedAt.slice(0, 10), ranges.current));
  const counts = new Map<TrafficClass | null, number>();
  for (const row of current) counts.set(row.trafficClass, (counts.get(row.trafficClass) ?? 0) + 1);
  const ordered: InquiryClassRow[] = trafficClasses.map((trafficClass) => ({ trafficClass, inquiries: counts.get(trafficClass) ?? 0 }));
  ordered.push({ trafficClass: null, inquiries: counts.get(null) ?? 0 });
  return ordered.filter((row) => row.inquiries > 0);
}

export function buildInquiriesBySource(inquiries: InquiryRecord[], ranges: PeriodRanges): InquirySourceRow[] {
  const current = inquiries.filter((row) => inRange(row.receivedAt.slice(0, 10), ranges.current) && row.trafficClass && row.trafficSource);
  const counts = new Map<string, InquirySourceRow>();
  for (const row of current) {
    const key = `${row.trafficClass}|${row.trafficSource}`;
    const existing = counts.get(key);
    if (existing) existing.inquiries += 1;
    else counts.set(key, { trafficClass: row.trafficClass as TrafficClass, trafficSource: row.trafficSource as string, inquiries: 1 });
  }
  return [...counts.values()].sort((a, b) => b.inquiries - a.inquiries);
}

/**
 * AI assistants: GA's own view (the "AI Assistant" channel, or a source
 * that matches the register) next to the inquiries that named the source.
 * A source with neither is not shown; a source GA does not know but an
 * inquiry does is shown with GA's columns empty rather than zero.
 */
export function buildAiReferrals(facts: FactRecord[], inquiries: InquiryRecord[], ranges: PeriodRanges): AiRow[] {
  const known = new Set(aiSources);
  const rows = facts.filter((row) => row.report === "ga4.sources" && inRange(row.date, ranges.current));
  const ga = new Map<string, { sessions: number; engagedSessions: number; keyEvents: number }>();

  for (const row of rows) {
    const source = (row.dims.source_medium ?? "").split(" / ")[0].trim().toLowerCase();
    const isAi = row.dims.channel === "AI Assistant" || known.has(source);
    if (!isAi || !source) continue;
    const entry = ga.get(source) ?? { sessions: 0, engagedSessions: 0, keyEvents: 0 };
    entry.sessions += row.metrics.sessions ?? 0;
    entry.engagedSessions += row.metrics.engaged_sessions ?? 0;
    entry.keyEvents += row.metrics.key_events ?? 0;
    ga.set(source, entry);
  }

  const byInquiry = new Map<string, number>();
  for (const row of inquiries) {
    if (row.trafficClass !== "ai_assistant" || !row.trafficSource) continue;
    if (!inRange(row.receivedAt.slice(0, 10), ranges.current)) continue;
    byInquiry.set(row.trafficSource, (byInquiry.get(row.trafficSource) ?? 0) + 1);
  }

  const sources = new Set([...ga.keys(), ...byInquiry.keys()]);
  return [...sources]
    .map((source) => {
      const g = ga.get(source);
      return {
        source,
        sessions: g?.sessions ?? null,
        engagedSessions: g?.engagedSessions ?? null,
        keyEvents: g?.keyEvents ?? null,
        inquiries: byInquiry.get(source) ?? 0,
      };
    })
    .sort((a, b) => (b.sessions ?? 0) - (a.sessions ?? 0) || b.inquiries - a.inquiries);
}

export function buildGeo(facts: FactRecord[], ranges: PeriodRanges, limit = 15): GeoRow[] {
  const rows = facts.filter((row) => row.report === "ga4.geo" && inRange(row.date, ranges.current));
  return groupBy(
    rows,
    (row) => `${row.dims.country}|${row.dims.region}|${row.dims.city}`,
    (group) => ({
      country: group[0].dims.country ?? NOT_SET,
      region: group[0].dims.region ?? NOT_SET,
      city: group[0].dims.city ?? NOT_SET,
      sessions: sum(group, "sessions"),
      keyEvents: sum(group, "key_events"),
    }),
  )
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, limit);
}

export function buildLanding(facts: FactRecord[], ranges: PeriodRanges, limit = 20): LandingRow[] {
  const rows = facts.filter((row) => row.report === "ga4.landing" && inRange(row.date, ranges.current));
  return groupBy(
    rows,
    (row) => row.dims.landing_page ?? NOT_SET,
    (group) => {
      const landingPage = group[0].dims.landing_page ?? NOT_SET;
      return {
        landingPage,
        pageType: pageTypeForLandingPage(landingPage),
        sessions: sum(group, "sessions"),
        engagedSessions: sum(group, "engaged_sessions"),
        keyEvents: sum(group, "key_events"),
      };
    },
  )
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, limit);
}

function eventRows(facts: FactRecord[], ranges: PeriodRanges, report: "ga4.events" | "ga4.funnel"): FactRecord[] {
  return facts.filter((row) => row.report === report && inRange(row.date, ranges.current));
}

export function buildServices(facts: FactRecord[], ranges: PeriodRanges): ServiceRow[] {
  const rows = eventRows(facts, ranges, "ga4.events").filter((row) => row.dims.service_id && row.dims.service_id !== NOT_SET);
  return groupBy(
    rows,
    (row) => row.dims.service_id,
    (group) => ({
      serviceId: group[0].dims.service_id,
      label: serviceLabel(group[0].dims.service_id),
      views: sum(group.filter((row) => row.dims.event_name === "service_view"), "event_count"),
      ctaClicks: sum(group.filter((row) => row.dims.event_name === "service_cta_click"), "event_count"),
    }),
  ).sort((a, b) => b.views - a.views || b.ctaClicks - a.ctaClicks);
}

export function buildPackages(facts: FactRecord[], ranges: PeriodRanges): PackageRow[] {
  const events = eventRows(facts, ranges, "ga4.events").filter((row) => row.dims.package_id && row.dims.package_id !== NOT_SET && row.dims.package_id !== "none");
  const funnel = eventRows(facts, ranges, "ga4.funnel").filter(
    (row) => row.dims.event_name === "planner_complete" && row.dims.project_type && row.dims.project_type !== NOT_SET && row.dims.project_type !== "none",
  );

  const ids = new Set([...events.map((row) => row.dims.package_id), ...funnel.map((row) => row.dims.project_type)]);
  return [...ids]
    .map((packageId) => ({
      packageId,
      selections: sum(events.filter((row) => row.dims.package_id === packageId && row.dims.event_name === "pricing_package_select"), "event_count"),
      ctaClicks: sum(events.filter((row) => row.dims.package_id === packageId && row.dims.event_name === "pricing_cta_click"), "event_count"),
      plannerCompletions: sum(funnel.filter((row) => row.dims.project_type === packageId), "event_count"),
    }))
    .sort((a, b) => b.selections - a.selections || b.plannerCompletions - a.plannerCompletions);
}

export function buildCtas(facts: FactRecord[], ranges: PeriodRanges, limit = 25): CtaRow[] {
  const rows = eventRows(facts, ranges, "ga4.events").filter(
    (row) => (row.dims.event_name === "cta_click" || row.dims.event_name === "service_cta_click") && row.dims.cta_id && row.dims.cta_id !== NOT_SET,
  );
  return groupBy(
    rows,
    (row) => `${row.dims.cta_id}|${row.dims.cta_target}|${row.dims.placement}`,
    (group) => ({
      ctaId: group[0].dims.cta_id,
      ctaTarget: group[0].dims.cta_target ?? NOT_SET,
      placement: group[0].dims.placement ?? NOT_SET,
      count: sum(group, "event_count"),
    }),
  )
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function funnelSteps(entries: Array<{ key: string; label: string; count: number }>): FunnelStep[] {
  return entries.map((entry, index) => {
    if (index === 0) return { ...entry, rateFromPrevious: null };
    const previous = entries[index - 1].count;
    return { ...entry, rateFromPrevious: previous > 0 ? entry.count / previous : null };
  });
}

export function buildPlannerFunnel(facts: FactRecord[], ranges: PeriodRanges): PlannerFunnel {
  const rows = eventRows(facts, ranges, "ga4.funnel");
  const count = (predicate: (row: FactRecord) => boolean) => sum(rows.filter(predicate), "event_count");

  const steps = funnelSteps([
    { key: "planner_start", label: "Gestart", count: count((row) => row.dims.event_name === "planner_start") },
    ...plannerStepOrder.map((step) => ({
      key: `step_${step}`,
      label: `Stap ${plannerStepLabels[step]}`,
      count: count((row) => row.dims.event_name === "planner_step" && row.dims.step_name === step && row.dims.direction !== "back"),
    })),
    { key: "planner_complete", label: "Verzonden", count: count((row) => row.dims.event_name === "planner_complete") },
  ]);

  const errors: PlannerFunnel["errors"] = plannerStepOrder
    .map((step) => ({
      stepName: step as string,
      label: plannerStepLabels[step],
      count: count((row) => row.dims.event_name === "planner_error" && row.dims.step_name === step),
    }))
    .filter((entry) => entry.count > 0);

  /* Errors GA attributed to a step name the register does not know are still counted, under their own label. */
  const unknown = count((row) => row.dims.event_name === "planner_error" && !isPlannerStepName(row.dims.step_name ?? ""));
  if (unknown > 0) errors.push({ stepName: "other", label: "Onbekende stap", count: unknown });

  return { steps, errors };
}

export function buildContactFunnel(facts: FactRecord[], ranges: PeriodRanges): ContactFunnel {
  const rows = eventRows(facts, ranges, "ga4.funnel");
  const count = (name: string) => sum(rows.filter((row) => row.dims.event_name === name), "event_count");
  return {
    steps: funnelSteps([
      { key: "contact_start", label: "Begonnen met invullen", count: count("contact_start") },
      { key: "contact_submit", label: "Verzonden", count: count("contact_submit") },
    ]),
    errors: count("contact_error"),
  };
}

/** A provider's state for the dashboard: its configuration first, then the latest run of each report. */
export function buildProviderSyncStatus(
  provider: SyncedProvider,
  runs: SyncRunRecord[],
  config: { configured: boolean; missing: string[]; parts?: ProviderSyncStatus["parts"] },
  hasFacts: boolean,
): ProviderSyncStatus {
  const sorted = runs.filter((run) => run.provider === provider).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  const lastOk = sorted.find((run) => run.status === "ok");
  const lastFailed = sorted.find((run) => run.status === "failed");

  /* Rows of the batch the last success belongs to: every ok run started within five minutes of it. */
  const lastSuccess = lastOk
    ? {
        at: lastOk.finishedAt ?? lastOk.startedAt,
        rows: sorted
          .filter((run) => run.status === "ok" && Math.abs(Date.parse(run.startedAt) - Date.parse(lastOk.startedAt)) < 5 * 60_000)
          .reduce((total, run) => total + (run.rowsUpserted ?? 0), 0),
      }
    : null;

  const perReport = new Map<string, ReportStatus>();
  for (const run of sorted) {
    if (perReport.has(run.report)) continue;
    perReport.set(run.report, {
      report: run.report,
      status: run.status === "ok" ? "ok" : run.status === "failed" ? "failed" : "running",
      at: run.finishedAt ?? run.startedAt,
      rows: run.rowsUpserted,
      error: run.error,
    });
  }
  const reports = [...perReport.values()].sort((a, b) => a.report.localeCompare(b.report));

  let health: ProviderHealth;
  if (!config.configured) health = "not_configured";
  else if (reports.length === 0) health = "configured";
  else if (reports.some((report) => report.status === "failed" && isAuthFailure(report.error ?? undefined))) health = "auth_failed";
  else if (reports.some((report) => report.status === "failed")) health = "provider_error";
  else health = "ok";

  const latest = sorted[0];
  return {
    provider,
    label: providerLabels[provider],
    health,
    configured: config.configured,
    missing: config.missing,
    lastSuccess,
    lastFailure: lastFailed ? { at: lastFailed.finishedAt ?? lastFailed.startedAt, report: lastFailed.report, error: lastFailed.error ?? "onbekend" } : null,
    lastRun: latest
      ? { at: latest.finishedAt ?? latest.startedAt, report: latest.report, status: latest.status === "ok" ? "ok" : latest.status === "failed" ? "failed" : "running" }
      : null,
    reports,
    hasFacts,
    parts: config.parts ?? [],
  };
}

export function buildSyncStatus(input: {
  runs: SyncRunRecord[];
  config: ProviderConfigStatus[];
  enabled: boolean;
  hasFacts: Partial<Record<SyncedProvider, boolean>>;
  truncated?: boolean;
}): SyncStatus {
  return {
    enabled: input.enabled,
    truncated: input.truncated ?? false,
    providers: syncedProviders.map((provider) => {
      const config = input.config.find((entry) => entry.provider === provider) ?? { configured: false, missing: [] };
      return buildProviderSyncStatus(provider, input.runs, config, input.hasFacts[provider] ?? false);
    }),
  };
}

export type DashboardInput = {
  ranges: PeriodRanges;
  facts: FactRecord[];
  inquiries: InquiryRecord[];
  runs: SyncRunRecord[];
  config: ProviderConfigStatus[];
  enabled: boolean;
  hasFacts: Partial<Record<SyncedProvider, boolean>>;
  truncated?: boolean;
  /** For the links to the providers' own interfaces; not a secret. */
  gscSiteUrl?: string | null;
  /** The latest Clarity snapshot, read apart from the period (it is a rolling 72 hours). */
  clarityFacts?: FactRecord[];
};

export function buildDashboard(input: DashboardInput): AnalyticsDashboard {
  const { ranges, facts, inquiries } = input;
  const overviewRows = facts.filter((row) => row.report === "ga4.overview");
  const services = buildServices(facts, ranges);
  const googleSearch = buildGoogleSearch(facts, ranges, input.gscSiteUrl ?? null);
  const acquisition = buildAcquisition(facts, inquiries, ranges);
  return {
    ranges,
    overview: buildOverview(facts, inquiries, ranges),
    daily: { current: daily(overviewRows, ranges, "current"), previous: daily(overviewRows, ranges, "previous") },
    sources: buildSources(facts, ranges),
    inquiriesByClass: buildInquiriesByClass(inquiries, ranges),
    inquiriesBySource: buildInquiriesBySource(inquiries, ranges),
    ai: buildAiReferrals(facts, inquiries, ranges),
    geo: buildGeo(facts, ranges),
    landing: buildLanding(facts, ranges),
    services,
    packages: buildPackages(facts, ranges),
    ctas: buildCtas(facts, ranges),
    plannerFunnel: buildPlannerFunnel(facts, ranges),
    contactFunnel: buildContactFunnel(facts, ranges),
    acquisition,
    googleSearch,
    bingSearch: buildBingSearch(facts, ranges),
    clarity: buildClarity(input.clarityFacts ?? []),
    insights: buildInsights({ googleSearch, services, acquisition }),
    sync: buildSyncStatus(input),
  };
}

/** Rows from the database, made safe: only known report names and object-shaped dims/metrics. */
export function factRecordFromRow(row: { report: string; date: string; dims: unknown; metrics: unknown }): FactRecord | null {
  if (typeof row.dims !== "object" || row.dims === null || typeof row.metrics !== "object" || row.metrics === null) return null;
  const dims: Record<string, string> = {};
  for (const [key, value] of Object.entries(row.dims as Record<string, unknown>)) if (typeof value === "string") dims[key] = value;
  const metrics: Record<string, number> = {};
  for (const [key, value] of Object.entries(row.metrics as Record<string, unknown>)) if (typeof value === "number") metrics[key] = value;
  return { report: row.report, date: row.date, dims, metrics };
}

export function inquiryRecordFromRow(row: { received_at: string; origin: string; traffic_class: string | null; traffic_source: string | null }): InquiryRecord {
  return {
    receivedAt: row.received_at,
    origin: row.origin === "project_planner" || row.origin === "websitecheck" ? row.origin : "contact",
    trafficClass: isTrafficClass(row.traffic_class) ? row.traffic_class : null,
    trafficSource: row.traffic_source,
  };
}
