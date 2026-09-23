import { adminDb, failed } from "@/lib/admin/db";
import { periodRanges } from "@/lib/admin/analytics/periods";
import { buildDashboard, factRecordFromRow, inquiryRecordFromRow } from "@/lib/admin/analytics/queries";
import type { AnalyticsDashboard, FactRecord, InquiryRecord, Period, SyncRunRecord } from "@/lib/admin/analytics/types";
import { readGscConfig } from "@/lib/analytics-admin/google-auth";
import { analyticsSyncEnabled, providerConfigStatus } from "@/lib/analytics-admin/sync";
import { syncedProviders, type SyncedProvider } from "@/lib/analytics-admin/synced-providers";

/**
 * Everything the analytics page reads, in reads that travel together.
 *
 * Only the database is consulted: the synced facts of every provider, the
 * inquiries (four columns, never a name or an address), the run log per
 * provider, and per provider whether a fact exists at all. No provider is
 * called while a page renders; that is what the sync is for. The
 * configuration shown is read from the environment by variable name.
 * `adminDb()` refuses a non-admin before the first query, and the tables'
 * policies refuse again on the server.
 *
 * Facts are read in pages: the API returns at most a thousand rows per
 * request, and a 90-day window with its previous period holds more than
 * that once Search Console queries are in. A ceiling keeps a runaway
 * table from stalling the page; reaching it is shown in the sync block.
 */
const dashboardReports = [
  "ga4.overview",
  "ga4.sources",
  "ga4.geo",
  "ga4.landing",
  "ga4.events",
  "ga4.funnel",
  "gsc.totals",
  "gsc.queries",
  "gsc.pages",
  "gsc.countries",
  "gsc.devices",
  "gsc.appearance",
  "bing.traffic",
  "bing.queries",
  "bing.pages",
  "bing.crawl",
] as const;

const FACT_PAGE = 1_000;
export const FACT_READ_CEILING = 100_000;
const RUNS_PER_PROVIDER = 80;

type Db = Awaited<ReturnType<typeof adminDb>>;

async function readFacts(db: Db, from: string, to: string): Promise<{ rows: FactRecord[]; truncated: boolean }> {
  const rows: FactRecord[] = [];
  for (let offset = 0; offset < FACT_READ_CEILING; offset += FACT_PAGE) {
    const { data, error } = await db
      .from("analytics_facts")
      .select("report, date, dims, metrics")
      .in("provider", [...syncedProviders])
      .in("report", [...dashboardReports])
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false })
      .order("report")
      .order("dims_key")
      .range(offset, offset + FACT_PAGE - 1);
    failed("Analytics laden", error);
    for (const row of data ?? []) {
      const record = factRecordFromRow(row);
      if (record) rows.push(record);
    }
    if ((data ?? []).length < FACT_PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

async function readRuns(db: Db, provider: SyncedProvider): Promise<SyncRunRecord[]> {
  const { data, error } = await db
    .from("analytics_sync_runs")
    .select("report, status, started_at, finished_at, rows_upserted, error")
    .eq("provider", provider)
    .order("started_at", { ascending: false })
    .limit(RUNS_PER_PROVIDER);
  failed("Sync-status laden", error);
  return (data ?? []).map((row) => ({
    provider,
    report: row.report,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    rowsUpserted: row.rows_upserted,
    error: row.error,
  }));
}

/** The latest Clarity snapshot: its day, then its rows. Two small reads, whatever the page's period. */
async function readLatestClarity(db: Db): Promise<FactRecord[]> {
  const latest = await db.from("analytics_facts").select("date").eq("provider", "clarity").order("date", { ascending: false }).limit(1);
  failed("Clarity laden", latest.error);
  const date = latest.data?.[0]?.date;
  if (!date) return [];
  const { data, error } = await db.from("analytics_facts").select("report, date, dims, metrics").eq("provider", "clarity").eq("date", date).limit(FACT_PAGE);
  failed("Clarity laden", error);
  return (data ?? []).map(factRecordFromRow).filter((row): row is FactRecord => row !== null);
}

async function hasAnyFact(db: Db, provider: SyncedProvider): Promise<boolean> {
  const { data, error } = await db.from("analytics_facts").select("date").eq("provider", provider).limit(1);
  failed("Analytics laden", error);
  return (data ?? []).length > 0;
}

export async function loadAnalyticsDashboard(period: Period, now: Date = new Date()): Promise<AnalyticsDashboard> {
  const ranges = periodRanges(period, now);
  const db = await adminDb();

  const [facts, inquiryRows, runs, factFlags, clarityFacts] = await Promise.all([
    readFacts(db, ranges.previous.start, ranges.current.end),
    db
      .from("inquiries")
      .select("received_at, origin, traffic_class, traffic_source")
      .gte("received_at", `${ranges.previous.start}T00:00:00Z`),
    Promise.all(syncedProviders.map((provider) => readRuns(db, provider))),
    Promise.all(syncedProviders.map((provider) => hasAnyFact(db, provider))),
    readLatestClarity(db),
  ]);

  failed("Aanvragen laden", inquiryRows.error);
  const inquiries: InquiryRecord[] = (inquiryRows.data ?? []).map(inquiryRecordFromRow);
  const gsc = readGscConfig();

  return buildDashboard({
    ranges,
    facts: facts.rows,
    inquiries,
    runs: runs.flat(),
    config: providerConfigStatus(),
    enabled: analyticsSyncEnabled(),
    hasFacts: Object.fromEntries(syncedProviders.map((provider, index) => [provider, factFlags[index]])),
    truncated: facts.truncated,
    gscSiteUrl: gsc.ok ? gsc.siteUrl : null,
    clarityFacts,
  });
}
