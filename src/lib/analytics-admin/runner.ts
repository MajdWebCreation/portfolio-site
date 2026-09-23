import {
  isAuthFailure,
  safeErrorLabel,
  type FactRow,
  type FactsStore,
  type ProviderAdapter,
  type ProviderEntry,
  type ProviderRunResult,
  type ReportRunResult,
  type SyncSummary,
  type SyncWindow,
} from "@/lib/analytics-admin/types";
import { mapWithLimit } from "@/lib/analytics-admin/concurrency";
import { analyticsRetentionTargets, retentionClassOf, retentionClasses } from "@/lib/analytics-admin/retention";
import { shiftDate, shiftMonths } from "@/lib/analytics-admin/schedule";
import { toDateKey } from "@/lib/admin/format";

export { shiftDate };

/**
 * The synchronisation, separated from where the data comes from and where
 * it goes.
 *
 * Per provider: a provider without configuration is reported as
 * `not_configured` and skipped; nothing about it can stop another one.
 * Per report of a configured provider: ask the adapter which ranges are
 * due (`plan`; none means the cadence says not today), check the report if
 * the provider can, fetch every planned range, normalise and dedupe, and
 * -- only when `apply` is true -- record a run, upsert the rows and remove
 * the rows of the same days this run no longer has. A failure is that
 * report's failure: it is recorded (in an applied run) and reported, and
 * the next report runs as if nothing happened. The one exception is a
 * refused credential: once a provider answers `auth`, its remaining
 * reports are failed with the same class without asking again, because
 * the answer will not change within the run and repeating it only spends
 * the provider's patience. Other providers are untouched by it.
 *
 * In a dry run nothing is written, no run is recorded and nothing is
 * deleted; the summary still says exactly what an applied run would have
 * upserted.
 *
 * Providers run side by side and a provider's reports at most three at a
 * time, so one slow provider does not hold up the others and nobody fires
 * dozens of requests at once. Results come back in provider and report
 * order, not in the order they finished.
 *
 * After an applied run with at least one success, facts past their
 * retention class are removed (retention.ts): 26 months for aggregates,
 * 16 for facts that carry search-query text.
 *
 * The runner knows no provider: no Google, no scope, no token. What it
 * logs, the caller logs, from the summary: provider, report, mode, count,
 * status, dates and duration. No dimension value ever reaches a log line.
 */
export const FACTS_RETENTION_MONTHS = retentionClasses.aggregate.months;

export type SyncOptions = {
  providers: ProviderEntry[];
  store: FactsStore;
  /** True writes; false fetches and counts only. */
  apply: boolean;
  now?: Date;
  /** Plan every report regardless of its cadence (the manual refresh). */
  ignoreCadence?: boolean;
  /** Milliseconds since the epoch, for the deadline; replaceable in tests. */
  clock?: () => number;
  /**
   * The run's deadline, when the caller shares it with the providers'
   * request gates (sync.ts); otherwise one is made from `clock`.
   */
  pastDeadline?: () => boolean;
  reportConcurrency?: number;
};

/** The last `days` calendar days up to and including today, Amsterdam time: GA4's window. */
export function syncWindow(now: Date, days = 3): SyncWindow {
  const end = toDateKey(now);
  const start = shiftDate(end, -(days - 1));
  return { start, end };
}

export function retentionCutoffDate(now: Date, months = FACTS_RETENTION_MONTHS): string {
  return shiftMonths(toDateKey(now), -months);
}

/** Reports of one provider run at most this many at a time; providers run side by side. */
export const REPORT_CONCURRENCY = 3;

/**
 * The hard deadline of a run. After 40 seconds no report is started and no
 * provider request is sent (the request gates check the same deadline);
 * what is under way finishes. A request started just before it ends at
 * the latest 10 seconds later (http.ts), which leaves the last 10 of the
 * cron's 60 for writing and recording. Work refused this way fails as
 * `deadline` and is picked up by the next run.
 */
export const RUN_DEADLINE_MS = 40_000;

export function runDeadline(clock: () => number = Date.now, ms: number = RUN_DEADLINE_MS): () => boolean {
  const startedAt = clock();
  return () => clock() - startedAt >= ms;
}

/**
 * A run still `running` this long after it started belongs to an
 * invocation that was cut off (a serverless timeout leaves no chance to
 * finish it). The cron and the button both end within a minute, so a
 * quarter of an hour is far past any live run.
 */
export const STALE_RUN_AFTER_MS = 15 * 60_000;

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

type ReportContext = {
  store: FactsStore;
  apply: boolean;
  now: Date;
  ignoreCadence: boolean;
  /** Set once the provider refused its credentials in this run. */
  authFailure: () => string | null;
  /** True once the start budget is spent. */
  pastDeadline: () => boolean;
};

async function runReport(adapter: ProviderAdapter, report: string, context: ReportContext): Promise<ReportRunResult> {
  const { store, apply, now } = context;
  const started = Date.now();
  let runId: string | null = null;
  let windows: SyncWindow[] = [];

  try {
    const plans = adapter.plan(report, { now, ignoreCadence: context.ignoreCadence });
    windows = plans.map((plan) => plan.window);
    if (plans.length === 0) {
      return { provider: adapter.key, report, status: "skipped", windows, rows: 0, durationMs: Date.now() - started };
    }

    if (apply) runId = await store.startRun(adapter.key, report);
    const refused = context.authFailure();
    if (refused) throw new NotAttempted(refused);
    if (context.pastDeadline()) throw new NotAttempted("deadline");
    if (adapter.check) await adapter.check(report);

    const fetched: FactRow[] = [];
    let filtered = 0;
    for (const plan of plans) {
      const result = await adapter.fetch(report, plan);
      if (Array.isArray(result)) fetched.push(...result);
      else {
        fetched.push(...result.rows);
        filtered += result.filtered;
      }
    }
    const rows = dedupeFactRows(fetched);

    /* A search query may only be stored under a report whose retention is the shorter query class. */
    if (rows.some((row) => "query" in row.dims) && retentionClassOf(report) !== "query_text") throw new NotAttempted("retention: unclassified query report");

    let upserted = rows.length;
    if (apply) {
      const syncedAt = now.toISOString();
      upserted = await store.upsert(rows, syncedAt);
      const dates = [...new Set(rows.map((row) => row.date))].sort();
      if (dates.length > 0) await store.deleteStale({ provider: adapter.key, report, dates, syncedAt });
      if (runId) await store.finishRun(runId, { status: "ok", rows: upserted });
    }
    return { provider: adapter.key, report, status: "ok", windows, rows: upserted, ...(filtered > 0 ? { filtered } : {}), durationMs: Date.now() - started };
  } catch (error) {
    const label = error instanceof NotAttempted ? error.label : safeErrorLabel(error);
    if (apply && runId) {
      await store.finishRun(runId, { status: "failed", rows: 0, error: label }).catch(() => undefined);
    }
    return { provider: adapter.key, report, status: "failed", windows, rows: 0, durationMs: Date.now() - started, error: label };
  }
}

/** A report failed with a fixed label by the runner itself: credentials already refused, the start budget spent, or no retention class for its queries. */
class NotAttempted extends Error {
  constructor(public readonly label: string) {
    super(label);
    this.name = "NotAttempted";
  }
}

export function providerHealthFrom(results: ReportRunResult[]): ProviderRunResult["health"] {
  const failed = results.filter((result) => result.status === "failed");
  if (failed.some((result) => isAuthFailure(result.error))) return "auth_failed";
  if (failed.length > 0) return "provider_error";
  return "ok";
}

async function runProvider(adapter: ProviderAdapter, base: Omit<ReportContext, "authFailure">, concurrency: number): Promise<ReportRunResult[]> {
  let authFailure: string | null = null;
  return mapWithLimit(adapter.reports, concurrency, async (report) => {
    const result = await runReport(adapter, report, { ...base, authFailure: () => authFailure });
    if (result.status === "failed" && isAuthFailure(result.error)) authFailure ??= result.error ?? "auth";
    return result;
  });
}

/**
 * Removes facts past their class's retention: every report after 26
 * months, the query-text reports after 16. Only after an applied run, and
 * only as a second line: the general retention job enforces the same
 * targets daily, sync or no sync.
 */
async function applyRetention(store: FactsStore, now: Date): Promise<NonNullable<SyncSummary["retention"]>> {
  const outcome: NonNullable<SyncSummary["retention"]> = [];
  for (const target of analyticsRetentionTargets(toDateKey(now))) {
    const deleted = await store.deleteOlderThan(target.cutoff, target.reports ?? undefined);
    outcome.push({ retentionClass: target.retentionClass, cutoff: target.cutoff, deleted });
  }
  return outcome;
}

export async function runAnalyticsSync(options: SyncOptions): Promise<SyncSummary> {
  const { providers, store, apply, now = new Date(), ignoreCadence = false } = options;
  const pastDeadline = options.pastDeadline ?? runDeadline(options.clock);
  const base = { store, apply, now, ignoreCadence, pastDeadline };

  /* Runs a cut-off invocation left behind; a store failure here must not stop the sync. */
  let staleRunsRecovered: number | undefined;
  if (apply) {
    staleRunsRecovered = await store
      .failStaleRuns(new Date(now.getTime() - STALE_RUN_AFTER_MS).toISOString())
      .catch(() => undefined);
  }

  /* Providers side by side (there are three); within one, a bounded number of reports at a time. */
  const perProvider = await Promise.all(
    providers.map(async (entry) => {
      if (!entry.configured) {
        return { provider: { provider: entry.key, health: "not_configured" as const, missing: entry.missing }, results: [] as ReportRunResult[] };
      }
      const results = await runProvider(entry.adapter, base, options.reportConcurrency ?? REPORT_CONCURRENCY);
      return { provider: { provider: entry.key, health: providerHealthFrom(results) }, results };
    }),
  );

  const providerResults: ProviderRunResult[] = perProvider.map((entry) => entry.provider);
  const results = perProvider.flatMap((entry) => entry.results);
  const summary: SyncSummary = {
    mode: apply ? "applied" : "dry-run",
    providers: providerResults,
    results,
    ...(staleRunsRecovered ? { staleRunsRecovered } : {}),
  };

  if (apply && results.some((result) => result.status === "ok")) {
    summary.retention = await applyRetention(store, now);
  }

  return summary;
}

/** The lines a caller may log: no values, only counts and classes. */
export function summaryLogFields(summary: SyncSummary) {
  return {
    mode: summary.mode,
    providers: summary.providers.map((provider) => ({
      provider: provider.provider,
      health: provider.health,
      ...(provider.missing ? { missing: provider.missing } : {}),
    })),
    reports: summary.results.map((result) => ({
      provider: result.provider,
      report: result.report,
      status: result.status,
      windows: result.windows.map((window) => `${window.start}..${window.end}`),
      rows: result.rows,
      ...(result.filtered ? { filtered: result.filtered } : {}),
      ms: result.durationMs,
      ...(result.error ? { error: result.error } : {}),
    })),
    ...(summary.retention ? { retention: summary.retention } : {}),
    ...(summary.staleRunsRecovered ? { staleRunsRecovered: summary.staleRunsRecovered } : {}),
  };
}
