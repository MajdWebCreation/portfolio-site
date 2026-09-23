import { createFactsStore } from "@/lib/analytics-admin/facts-store";
import {
  analyticsReadScope,
  googleTokenSource,
  readGa4Config,
  readGscConfig,
  searchConsoleReadScope,
} from "@/lib/analytics-admin/google-auth";
import { createBingAdapter, readBingConfig } from "@/lib/analytics-admin/providers/bing";
import { clarityEnv, createClarityAdapter, readClarityConfig } from "@/lib/analytics-admin/providers/clarity";
import { clarityProjectId } from "@/lib/clarity/client";
import { createGa4Adapter } from "@/lib/analytics-admin/providers/ga4";
import { createGscAdapter } from "@/lib/analytics-admin/providers/gsc";
import { createRequestGate } from "@/lib/analytics-admin/concurrency";
import { runAnalyticsSync, runDeadline } from "@/lib/analytics-admin/runner";
import type { ProviderConfigStatus } from "@/lib/analytics-admin/synced-providers";
import type { FactsStore, ProviderEntry, SyncSummary } from "@/lib/analytics-admin/types";
import { hasPaymentsAdminAccess, paymentsAdminClient } from "@/lib/payments/admin-client";

/**
 * The one entry point both the cron and the admin's "vernieuw nu" use, so
 * they cannot drift: same providers, same plans, same switch.
 *
 * The switch is `ANALYTICS_SYNC_ENABLED`, read at call time. Exactly "true"
 * writes; anything else is a dry run that fetches, counts and touches
 * nothing -- also when an admin presses the button. One switch for every
 * path that could write, and the button reports which mode it ran in, so
 * pressing it while the switch is off is informative rather than a way
 * around it.
 *
 * Configuration is per provider. Each one is either an adapter or the
 * list of its missing variables (by name, never by value), and a missing
 * one is reported in the summary while the others run: no GA4 property
 * does not stop Search Console, no Bing key does not stop Google. The
 * shared Google service account is needed by both Google providers; when
 * it is missing, both say so and Bing still runs.
 *
 * The only reason the whole run is refused is infrastructure: writing is
 * switched on but the server has no key to write with.
 */
export const ANALYTICS_SYNC_ENABLED = "ANALYTICS_SYNC_ENABLED";

type Env = Record<string, string | undefined>;

export function analyticsSyncEnabled(env: Env = process.env): boolean {
  return env[ANALYTICS_SYNC_ENABLED] === "true";
}

export { syncedProviders, type ProviderConfigStatus, type SyncedProvider } from "@/lib/analytics-admin/synced-providers";

/** What each provider lacks, for the dashboard: reads the environment, calls nothing. */
export function providerConfigStatus(env: Env = process.env): ProviderConfigStatus[] {
  const ga4 = readGa4Config(env);
  const gsc = readGscConfig(env);
  const bing = readBingConfig(env);
  const clarity = readClarityConfig(env);
  /* The tag's project id is inlined at build time; `env` is consulted first so the tests can set it. */
  const clarityTag = Boolean(env[clarityEnv.projectId] ? /^[a-z0-9]{6,20}$/i.test(env[clarityEnv.projectId]!.trim()) : clarityProjectId());
  return [
    { provider: "ga4", configured: ga4.ok, missing: ga4.ok ? [] : ga4.missing },
    { provider: "gsc", configured: gsc.ok, missing: gsc.ok ? [] : gsc.missing },
    { provider: "bing", configured: bing.ok, missing: bing.ok ? [] : bing.missing },
    {
      provider: "clarity",
      configured: clarity.ok,
      missing: clarity.ok ? [] : clarity.missing,
      parts: [
        { label: "Tracking op de website", configured: clarityTag, variable: clarityEnv.projectId },
        { label: "Export-API", configured: clarity.ok, variable: clarityEnv.apiToken },
      ],
    },
  ];
}

/**
 * Requests in flight per provider, across all its reports and days. With
 * four providers side by side that is at most twelve provider requests at
 * once (Clarity has only two reports, so in practice at most eleven), plus
 * at most one token exchange per Google scope (the token source shares one
 * exchange between concurrent callers). Report-level concurrency (runner.ts) and the day concurrency of
 * gsc.queries only decide who gets the slots; they cannot raise this.
 */
export const PROVIDER_REQUEST_CONCURRENCY = 3;

/** Adapters for the configured providers; the others as their missing variables. */
export function providerEntries(env: Env = process.env, options: { fetch?: typeof fetch; pastDeadline?: () => boolean } = {}): ProviderEntry[] {
  const entries: ProviderEntry[] = [];
  const gate = () => createRequestGate({ concurrency: PROVIDER_REQUEST_CONCURRENCY, pastDeadline: options.pastDeadline });
  const fetchOption = { fetch: options.fetch };

  const ga4 = readGa4Config(env);
  entries.push(
    ga4.ok
      ? {
          key: "ga4",
          configured: true,
          adapter: createGa4Adapter({
            propertyId: ga4.propertyId,
            token: googleTokenSource(ga4.account, [analyticsReadScope], fetchOption),
            fetch: options.fetch,
            gate: gate(),
          }),
        }
      : { key: "ga4", configured: false, missing: ga4.missing },
  );

  const gsc = readGscConfig(env);
  entries.push(
    gsc.ok
      ? {
          key: "gsc",
          configured: true,
          adapter: createGscAdapter({
            siteUrl: gsc.siteUrl,
            token: googleTokenSource(gsc.account, [searchConsoleReadScope], fetchOption),
            fetch: options.fetch,
            gate: gate(),
          }),
        }
      : { key: "gsc", configured: false, missing: gsc.missing },
  );

  const bing = readBingConfig(env);
  entries.push(
    bing.ok
      ? { key: "bing", configured: true, adapter: createBingAdapter({ siteUrl: bing.siteUrl, auth: bing.auth, fetch: options.fetch, gate: gate() }) }
      : { key: "bing", configured: false, missing: bing.missing },
  );

  const clarity = readClarityConfig(env);
  entries.push(
    clarity.ok
      ? { key: "clarity", configured: true, adapter: createClarityAdapter({ token: clarity.token, fetch: options.fetch, gate: gate() }) }
      : { key: "clarity", configured: false, missing: clarity.missing },
  );

  return entries;
}

/** A store that must never be reached: a dry run does not touch it, and this makes sure of it. */
const noStore: FactsStore = {
  upsert: async () => {
    throw new Error("Dry run wrote to the store");
  },
  deleteStale: async () => {
    throw new Error("Dry run wrote to the store");
  },
  startRun: async () => {
    throw new Error("Dry run wrote to the store");
  },
  finishRun: async () => {
    throw new Error("Dry run wrote to the store");
  },
  failStaleRuns: async () => {
    throw new Error("Dry run wrote to the store");
  },
  deleteOlderThan: async () => {
    throw new Error("Dry run wrote to the store");
  },
};

export type SyncOutcome =
  | { ok: true; summary: SyncSummary }
  | { ok: false; reason: "store_not_configured"; missing: string[] };

export async function executeAnalyticsSync(
  options: { now?: Date; ignoreCadence?: boolean; env?: Env; fetch?: typeof fetch; store?: FactsStore; pastDeadline?: () => boolean } = {},
): Promise<SyncOutcome> {
  const env = options.env ?? process.env;
  const apply = analyticsSyncEnabled(env);
  if (apply && !options.store && !hasPaymentsAdminAccess()) return { ok: false, reason: "store_not_configured", missing: ["SUPABASE_SECRET_KEY"] };

  const store = apply ? (options.store ?? createFactsStore(paymentsAdminClient())) : noStore;
  /* One deadline for the run, shared by the runner (no new report) and the request gates (no new request). */
  const pastDeadline = options.pastDeadline ?? runDeadline();
  const summary = await runAnalyticsSync({
    providers: providerEntries(env, { fetch: options.fetch, pastDeadline }),
    store,
    apply,
    pastDeadline,
    now: options.now ?? new Date(),
    ignoreCadence: options.ignoreCadence ?? false,
  });

  return { ok: true, summary };
}
