import { createFactsStore } from "@/lib/analytics-admin/facts-store";
import { analyticsReadScope, createServiceAccountTokenSource, readGoogleConfig, type TokenSource } from "@/lib/analytics-admin/google-auth";
import { createGa4Adapter } from "@/lib/analytics-admin/providers/ga4";
import { runAnalyticsSync, syncWindow } from "@/lib/analytics-admin/runner";
import type { FactsStore, SyncSummary } from "@/lib/analytics-admin/types";
import { hasPaymentsAdminAccess, paymentsAdminClient } from "@/lib/payments/admin-client";

/**
 * The one entry point both the cron and the admin's "vernieuw nu" use, so
 * they cannot drift: same window, same providers, same switch.
 *
 * The switch is `ANALYTICS_SYNC_ENABLED`, read at call time. Exactly "true"
 * writes; anything else is a dry run that fetches, counts and touches
 * nothing -- also when an admin presses the button. One switch for every
 * path that could write, and the button reports which mode it ran in, so
 * pressing it while the switch is off is informative rather than a way
 * around it.
 *
 * Configuration is checked before anything is fetched, and what is missing
 * is named by variable, never by value.
 */
export const ANALYTICS_SYNC_ENABLED = "ANALYTICS_SYNC_ENABLED";

export function analyticsSyncEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[ANALYTICS_SYNC_ENABLED] === "true";
}

export type SyncPreflight =
  | { ok: true; apply: boolean }
  | { ok: false; reason: "google_not_configured" | "store_not_configured"; missing: string[] };

export function preflightAnalyticsSync(env: Record<string, string | undefined> = process.env): SyncPreflight {
  const google = readGoogleConfig(env);
  if (!google.ok) return { ok: false, reason: "google_not_configured", missing: google.missing };
  const apply = analyticsSyncEnabled(env);
  if (apply && !hasPaymentsAdminAccess()) return { ok: false, reason: "store_not_configured", missing: ["SUPABASE_SECRET_KEY"] };
  return { ok: true, apply };
}

/* One token per process: the JWT exchange is not repeated for every report. */
let tokenSource: TokenSource | null = null;
let tokenSourceFor: string | null = null;

function googleToken(email: string, privateKey: string): TokenSource {
  if (!tokenSource || tokenSourceFor !== email) {
    tokenSource = createServiceAccountTokenSource({ email, privateKey, scope: analyticsReadScope });
    tokenSourceFor = email;
  }
  return tokenSource;
}

/** A store that must never be reached: a dry run does not touch it, and this makes sure of it. */
const noStore: FactsStore = {
  upsert: async () => {
    throw new Error("Dry run wrote to the store");
  },
  startRun: async () => {
    throw new Error("Dry run wrote to the store");
  },
  finishRun: async () => {
    throw new Error("Dry run wrote to the store");
  },
  deleteOlderThan: async () => {
    throw new Error("Dry run wrote to the store");
  },
};

export type SyncOutcome = { ok: true; summary: SyncSummary } | { ok: false; preflight: Extract<SyncPreflight, { ok: false }> };

export async function executeAnalyticsSync(now = new Date()): Promise<SyncOutcome> {
  const preflight = preflightAnalyticsSync();
  if (!preflight.ok) return { ok: false, preflight };

  const google = readGoogleConfig();
  if (!google.ok) return { ok: false, preflight: { ok: false, reason: "google_not_configured", missing: google.missing } };

  const ga4 = createGa4Adapter({ propertyId: google.propertyId, token: googleToken(google.email, google.privateKey) });
  const store = preflight.apply ? createFactsStore(paymentsAdminClient()) : noStore;

  const summary = await runAnalyticsSync({
    providers: [ga4],
    store,
    window: syncWindow(now),
    apply: preflight.apply,
    now,
  });

  return { ok: true, summary };
}
