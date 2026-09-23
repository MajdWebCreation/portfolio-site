import {
  safeErrorLabel,
  type FactRow,
  type FactsStore,
  type ProviderAdapter,
  type ReportRunResult,
  type SyncSummary,
  type SyncWindow,
} from "@/lib/analytics-admin/types";
import { toDateKey } from "@/lib/admin/format";

/**
 * The synchronisation, separated from where the data comes from and where
 * it goes.
 *
 * For every provider and every report it knows: check the report if the
 * provider can, fetch the window, normalise, and -- only when `apply` is
 * true -- record a run and upsert the rows. A failure is that report's
 * failure: it is recorded (in an applied run) and reported, and the next
 * report runs as if nothing happened. In a dry run nothing is written and
 * no run is recorded; the summary still says exactly what an applied run
 * would have upserted.
 *
 * After an applied run with at least one success, facts older than the
 * retention period are removed. They are aggregates without identifiers,
 * so this is housekeeping rather than a privacy term, but 26 months is
 * enough for a year-on-year view and more is clutter.
 *
 * The runner knows no provider: no Google, no scope, no token. What it
 * logs, the caller logs, from the summary: provider, report, mode, count,
 * status and duration. No dimension value ever reaches a log line.
 */
export const FACTS_RETENTION_MONTHS = 26;

export type SyncOptions = {
  providers: ProviderAdapter[];
  store: FactsStore;
  window: SyncWindow;
  /** True writes; false fetches and counts only. */
  apply: boolean;
  now?: Date;
};

/** The last `days` calendar days up to and including today, Amsterdam time. */
export function syncWindow(now: Date, days = 3): SyncWindow {
  const end = toDateKey(now);
  const start = shiftDate(end, -(days - 1));
  return { start, end };
}

export function shiftDate(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export function retentionCutoffDate(now: Date, months = FACTS_RETENTION_MONTHS): string {
  const [year, month, day] = toDateKey(now).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 - months, day)).toISOString().slice(0, 10);
}

/** Canonical identity of a fact row: sorted dimension keys, so `{a,b}` and `{b,a}` are one row. */
export function factKey(row: FactRow): string {
  const dims = Object.keys(row.dims)
    .sort()
    .map((key) => `${key}=${row.dims[key]}`)
    .join("&");
  return `${row.provider}|${row.report}|${row.date}|${dims}`;
}

/**
 * One row per key. A provider that hands the same combination twice (it
 * happens across pages) would otherwise make Postgres refuse the whole
 * batch: "cannot affect row a second time". Later rows win.
 */
export function dedupeFactRows(rows: FactRow[]): FactRow[] {
  const byKey = new Map<string, FactRow>();
  for (const row of rows) byKey.set(factKey(row), row);
  return [...byKey.values()];
}

export async function runAnalyticsSync(options: SyncOptions): Promise<SyncSummary> {
  const { providers, store, window, apply, now = new Date() } = options;
  const results: ReportRunResult[] = [];

  for (const provider of providers) {
    for (const report of provider.reports) {
      const started = Date.now();
      let runId: string | null = null;
      try {
        if (apply) runId = await store.startRun(provider.key, report);
        if (provider.check) await provider.check(report);
        const rows = dedupeFactRows(await provider.fetch(report, window));
        const upserted = apply ? await store.upsert(rows) : rows.length;
        if (apply && runId) await store.finishRun(runId, { status: "ok", rows: upserted });
        results.push({ provider: provider.key, report, status: "ok", rows: upserted, durationMs: Date.now() - started });
      } catch (error) {
        const label = safeErrorLabel(error);
        if (apply && runId) {
          await store.finishRun(runId, { status: "failed", rows: 0, error: label }).catch(() => undefined);
        }
        results.push({ provider: provider.key, report, status: "failed", rows: 0, durationMs: Date.now() - started, error: label });
      }
    }
  }

  const summary: SyncSummary = { mode: apply ? "applied" : "dry-run", window, results };

  if (apply && results.some((result) => result.status === "ok")) {
    const cutoff = retentionCutoffDate(now);
    const deleted = await store.deleteOlderThan(cutoff);
    summary.retention = { cutoff, deleted };
  }

  return summary;
}

/** The lines a caller may log: no values, only counts and classes. */
export function summaryLogFields(summary: SyncSummary) {
  return {
    mode: summary.mode,
    window: summary.window,
    reports: summary.results.map((result) => ({
      provider: result.provider,
      report: result.report,
      status: result.status,
      rows: result.rows,
      ms: result.durationMs,
      ...(result.error ? { error: result.error } : {}),
    })),
    ...(summary.retention ? { retention: summary.retention } : {}),
  };
}
