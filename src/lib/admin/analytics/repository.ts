import { adminDb, failed } from "@/lib/admin/db";
import { periodRanges } from "@/lib/admin/analytics/periods";
import { buildDashboard, factRecordFromRow, inquiryRecordFromRow } from "@/lib/admin/analytics/queries";
import type { AnalyticsDashboard, FactRecord, InquiryRecord, Period, SyncRunRecord } from "@/lib/admin/analytics/types";
import { readGoogleConfig } from "@/lib/analytics-admin/google-auth";
import { analyticsSyncEnabled } from "@/lib/analytics-admin/sync";

/**
 * Everything the analytics page reads, in four reads that travel together.
 *
 * Only the database is consulted: the synced facts, the inquiries (four
 * columns, never a name or an address), the run log, and whether a fact
 * exists at all. No provider is called while a page renders; that is what
 * the sync is for. `adminDb()` refuses a non-admin before the first query,
 * and the tables' policies refuse again on the server.
 */
const ga4Reports = ["ga4.overview", "ga4.sources", "ga4.geo", "ga4.landing", "ga4.events", "ga4.funnel"] as const;

export async function loadAnalyticsDashboard(period: Period, now: Date = new Date()): Promise<AnalyticsDashboard> {
  const ranges = periodRanges(period, now);
  const db = await adminDb();

  const [factRows, inquiryRows, runRows, anyFact] = await Promise.all([
    db
      .from("analytics_facts")
      .select("report, date, dims, metrics")
      .eq("provider", "ga4")
      .in("report", [...ga4Reports])
      .gte("date", ranges.previous.start)
      .lte("date", ranges.current.end),
    db
      .from("inquiries")
      .select("received_at, origin, traffic_class, traffic_source")
      .gte("received_at", `${ranges.previous.start}T00:00:00Z`),
    db.from("analytics_sync_runs").select("report, status, started_at, finished_at, rows_upserted, error").eq("provider", "ga4").order("started_at", { ascending: false }).limit(60),
    db.from("analytics_facts").select("date").eq("provider", "ga4").limit(1),
  ]);

  failed("Analytics laden", factRows.error);
  failed("Aanvragen laden", inquiryRows.error);
  failed("Sync-status laden", runRows.error);
  failed("Analytics laden", anyFact.error);

  const facts: FactRecord[] = (factRows.data ?? []).map(factRecordFromRow).filter((row): row is FactRecord => row !== null);
  const inquiries: InquiryRecord[] = (inquiryRows.data ?? []).map(inquiryRecordFromRow);
  const runs: SyncRunRecord[] = (runRows.data ?? []).map((row) => ({
    report: row.report,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    rowsUpserted: row.rows_upserted,
    error: row.error,
  }));

  const google = readGoogleConfig();

  return buildDashboard({
    ranges,
    facts,
    inquiries,
    runs,
    config: { configured: google.ok, missing: google.ok ? [] : google.missing, enabled: analyticsSyncEnabled() },
    hasFacts: (anyFact.data ?? []).length > 0,
  });
}
