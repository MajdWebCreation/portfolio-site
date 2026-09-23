"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/access";
import { executeAnalyticsSync } from "@/lib/analytics-admin/sync";
import { rateLimit } from "@/lib/payments/rate-limit";
import { providerLabels } from "@/lib/admin/analytics/providers";

/**
 * "Vernieuw nu": the same synchronisation the cron runs, started by hand.
 *
 * Behind the admin check, and at most once per ten minutes per admin: the
 * Google quota is generous, but a button that can be held down is not a
 * feature. The run plans every report, the weekly ones included. The switch is the same as the cron's -- ANALYTICS_SYNC_ENABLED
 * exactly "true" -- so pressing the button while the switch is off runs a
 * dry run and says so, rather than being a way to write around the switch.
 * The result names counts and failure classes only.
 */
export type RefreshState =
  | { status: "idle" }
  | { status: "limited"; retryAfterSeconds: number }
  | { status: "not_configured"; missing: string[] }
  | {
      status: "done";
      mode: "applied" | "dry-run";
      rows: number;
      failed: string[];
      /** Providers left out for missing variables, by name. */
      unconfigured: string[];
    };

export async function refreshAnalytics(): Promise<RefreshState> {
  const admin = await requireAdmin();

  const limit = rateLimit(`analytics-refresh:${admin.userId}`, 1, 600);
  if (!limit.allowed) return { status: "limited", retryAfterSeconds: limit.retryAfterSeconds };

  /* A manual run plans the weekly reports too: whoever presses the button wants everything current. */
  const outcome = await executeAnalyticsSync({ ignoreCadence: true });
  if (!outcome.ok) return { status: "not_configured", missing: outcome.missing };

  revalidatePath("/admin/analytics");
  return {
    status: "done",
    mode: outcome.summary.mode,
    rows: outcome.summary.results.reduce((total, result) => total + result.rows, 0),
    failed: outcome.summary.results.filter((result) => result.status === "failed").map((result) => `${result.report}: ${result.error ?? "onbekend"}`),
    unconfigured: outcome.summary.providers.filter((provider) => provider.health === "not_configured").map((provider) => (providerLabels as Record<string, string>)[provider.provider] ?? provider.provider),
  };
}

/** The shape `useActionState` wants: previous state in, new state out. */
export async function refreshAnalyticsAction(): Promise<RefreshState> {
  return refreshAnalytics();
}
