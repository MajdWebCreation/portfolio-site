/**
 * The shapes the synchronisation works with, independent of any provider.
 *
 * A fact is one row of `analytics_facts`: a provider, a report, a day, the
 * dimension values that row is about, and the numbers for them. That is all
 * a provider adapter may produce, and all the runner ever stores. Nothing
 * here can hold an event, a session or a visitor.
 */
export const analyticsProviders = ["ga4", "gsc", "bing", "clarity", "site"] as const;
export type AnalyticsProvider = (typeof analyticsProviders)[number];

export function isAnalyticsProvider(value: string): value is AnalyticsProvider {
  return (analyticsProviders as readonly string[]).includes(value);
}

export type FactRow = {
  provider: AnalyticsProvider;
  /** `<provider>.<report>`, e.g. `ga4.sources`. */
  report: string;
  /** Calendar day, YYYY-MM-DD, in the provider's reporting timezone. */
  date: string;
  dims: Record<string, string>;
  metrics: Record<string, number>;
};

/** Inclusive calendar range, YYYY-MM-DD. */
export type SyncWindow = { start: string; end: string };

/**
 * One range of one report that is due in this run, as the provider plans
 * it. `phase` says what kind of range it is, in the provider's own terms:
 * GA4 re-reads its last days as they are (`recent`); Search Console reads
 * its freshest days including preliminary data (`recent`) and, separately,
 * the days that have since settled (`final`); a report that aggregates a
 * whole range into one row is a `snapshot`. The runner does not interpret
 * the phase; it hands the plan back to the adapter's fetch.
 */
export type SyncPhase = "recent" | "final" | "snapshot";
export type SyncPlan = { phase: SyncPhase; window: SyncWindow };

/** What the runner tells a provider when it asks for plans. */
export type PlanContext = {
  now: Date;
  /**
   * True for a manual run: every report is planned regardless of its
   * cadence, so an admin who presses "vernieuw nu" gets the weekly reports
   * too. The cron passes false and the cadence decides.
   */
  ignoreCadence: boolean;
};

/**
 * What a provider has to offer: which reports it knows, which ranges of a
 * report are due now (`plan`; empty when its cadence says not today), an
 * optional check that a report is askable at all (GA's compatibility
 * check), and the fetch of one planned range. The runner calls these and
 * nothing else; a new provider is a new file, not a change to the runner.
 */
export type ProviderAdapter = {
  key: AnalyticsProvider;
  reports: readonly string[];
  plan(report: string, context: PlanContext): SyncPlan[];
  check?(report: string): Promise<void>;
  fetch(report: string, plan: SyncPlan): Promise<FactRow[] | FetchResult>;
};

/**
 * A fetch that filtered rows out before they became facts says how many,
 * and nothing else about them (see query-filter.ts).
 */
export type FetchResult = { rows: FactRow[]; filtered: number };

/**
 * A provider as the sync sees it before anything is fetched: either an
 * adapter, or the environment variables that are missing for it. A missing
 * provider is reported as such and never stops another one.
 */
export type ProviderEntry =
  | { key: AnalyticsProvider; configured: true; adapter: ProviderAdapter }
  | { key: AnalyticsProvider; configured: false; missing: string[] };

/**
 * A provider's outcome in one run. `not_configured`: variables missing,
 * nothing attempted. `auth_failed`: the provider refused the credentials.
 * `provider_error`: at least one report failed for another reason. `ok`:
 * every due report succeeded (or none was due). `configured` is what the
 * dashboard shows for a provider that is set up but has no run yet.
 */
export const providerHealthStates = ["configured", "not_configured", "auth_failed", "provider_error", "ok"] as const;
export type ProviderHealth = (typeof providerHealthStates)[number];

export type ProviderErrorKind =
  | "not_configured"
  | "auth"
  | "quota"
  | "compatibility"
  | "http"
  | "network"
  | "timeout"
  | "deadline"
  | "invalid_response"
  | "empty_response"
  | "unknown_report";

/**
 * A provider failure, reduced to a class and at most an HTTP status. The
 * message is composed here from those two, never from what the provider
 * sent back, so it can be logged and stored as it is.
 */
export class ProviderError extends Error {
  constructor(
    public readonly kind: ProviderErrorKind,
    public readonly status?: number,
  ) {
    super(status ? `${kind} ${status}` : kind);
    this.name = "ProviderError";
  }
}

/** What is recorded in `analytics_sync_runs`. */
export type ReportRunStatus = "ok" | "failed";

export type ReportRunResult = {
  provider: AnalyticsProvider;
  report: string;
  /** `skipped`: not due under the report's cadence; nothing was fetched or recorded. */
  status: ReportRunStatus | "skipped";
  /** The ranges fetched, dates only. */
  windows: SyncWindow[];
  /** Rows fetched and normalised; in an applied run also the rows upserted. */
  rows: number;
  /** Query rows the filter kept out of the database; a count only. */
  filtered?: number;
  durationMs: number;
  /** Safe failure class, see `safeErrorLabel`. */
  error?: string;
};

export type ProviderRunResult = {
  provider: AnalyticsProvider;
  health: Exclude<ProviderHealth, "configured">;
  /** Only for `not_configured`: variable names, never values. */
  missing?: string[];
};

export type SyncSummary = {
  mode: "applied" | "dry-run";
  providers: ProviderRunResult[];
  results: ReportRunResult[];
  /** Only in an applied run with at least one successful report: per retention class, the cutoff and the rows removed. */
  retention?: Array<{ retentionClass: string; cutoff: string; deleted: number }>;
  /** Earlier runs left `running` by a cut-off invocation and now closed as `stale_run`; a count only. */
  staleRunsRecovered?: number;
};

/** Where facts and run records go. Only the runner talks to it. */
export type FactsStore = {
  /** Upserts on (provider, report, date, dims) and stamps every row with `syncedAt`. */
  upsert(rows: FactRow[], syncedAt: string): Promise<number>;
  /**
   * Removes the rows of one report on the given days that this run did not
   * write (synced before `syncedAt`): a query that dropped out of a day's
   * top list, or a preliminary row the final data no longer has.
   */
  deleteStale(input: { provider: AnalyticsProvider; report: string; dates: string[]; syncedAt: string }): Promise<number>;
  startRun(provider: AnalyticsProvider, report: string): Promise<string>;
  finishRun(id: string, outcome: { status: ReportRunStatus; rows: number; error?: string }): Promise<void>;
  /** Closes runs still `running` that started before `startedBefore` as failed, `stale_run`; returns how many. */
  failStaleRuns(startedBefore: string): Promise<number>;
  /** Removes facts dated before the cutoff; only of the given reports when `reports` is passed, otherwise of every report. */
  deleteOlderThan(cutoffDate: string, reports?: readonly string[]): Promise<number>;
};

export function isAuthFailure(label: string | undefined): boolean {
  return typeof label === "string" && /^auth(\s|$)/.test(label);
}

/** The failure class that may be logged and stored: never a message from outside. */
export function safeErrorLabel(error: unknown): string {
  if (error instanceof ProviderError) return error.message;
  if (error instanceof Error && error.name === "FactsStoreError") return `store: ${error.message.slice(0, 160)}`;
  return "unexpected";
}
