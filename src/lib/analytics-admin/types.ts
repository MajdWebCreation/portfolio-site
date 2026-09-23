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
 * What a provider has to offer: which reports it knows, an optional check
 * that a report is askable at all (GA's compatibility check), and the fetch
 * itself. The runner calls these and nothing else, so a Search Console or
 * Bing adapter later is a new file, not a change to the runner.
 */
export type ProviderAdapter = {
  key: AnalyticsProvider;
  reports: readonly string[];
  check?(report: string): Promise<void>;
  fetch(report: string, window: SyncWindow): Promise<FactRow[]>;
};

export type ProviderErrorKind =
  | "not_configured"
  | "auth"
  | "quota"
  | "compatibility"
  | "http"
  | "network"
  | "invalid_response"
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

export type ReportRunStatus = "ok" | "failed";

export type ReportRunResult = {
  provider: AnalyticsProvider;
  report: string;
  status: ReportRunStatus;
  /** Rows fetched and normalised; in an applied run also the rows upserted. */
  rows: number;
  durationMs: number;
  /** Safe failure class, see `safeErrorLabel`. */
  error?: string;
};

export type SyncSummary = {
  mode: "applied" | "dry-run";
  window: SyncWindow;
  results: ReportRunResult[];
  /** Only in an applied run with at least one successful report. */
  retention?: { cutoff: string; deleted: number };
};

/** Where facts and run records go. Only the runner talks to it. */
export type FactsStore = {
  upsert(rows: FactRow[]): Promise<number>;
  startRun(provider: AnalyticsProvider, report: string): Promise<string>;
  finishRun(id: string, outcome: { status: ReportRunStatus; rows: number; error?: string }): Promise<void>;
  deleteOlderThan(cutoffDate: string): Promise<number>;
};

/** The failure class that may be logged and stored: never a message from outside. */
export function safeErrorLabel(error: unknown): string {
  if (error instanceof ProviderError) return error.message;
  if (error instanceof Error && error.name === "FactsStoreError") return `store: ${error.message.slice(0, 160)}`;
  return "unexpected";
}
