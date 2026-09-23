import { summaryLogFields } from "@/lib/analytics-admin/runner";
import { executeAnalyticsSync } from "@/lib/analytics-admin/sync";
import { isAuthorisedCronRequest } from "@/lib/cron/auth";

/**
 * The daily analytics synchronisation: Google Analytics day aggregates into
 * analytics_facts, see lib/analytics-admin.
 *
 * Its own route and schedule, with nothing in common with the mailing
 * jobs or the retention pass: an analytics failure must not stop an invoice
 * from going out, and the other way round.
 *
 * Nothing is written unless the deployment says so: ANALYTICS_SYNC_ENABLED
 * must be exactly "true". Missing, empty or anything else is a dry run --
 * the reports are fetched and counted, the counts are logged and returned,
 * and no row is written, updated or removed, and no run is recorded. A
 * first deployment can therefore be watched before it stores anything.
 *
 * The log line carries the mode, the window and per report the provider,
 * status, row count, duration and failure class. Never a dimension value.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request): Promise<Response> {
  if (!isAuthorisedCronRequest(request)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const outcome = await executeAnalyticsSync();

    if (!outcome.ok) {
      console.error("Analytics sync not configured", { reason: outcome.preflight.reason, missing: outcome.preflight.missing });
      return Response.json({ ok: false, reason: outcome.preflight.reason, missing: outcome.preflight.missing }, { status: 503 });
    }

    const fields = summaryLogFields(outcome.summary);
    if (outcome.summary.mode === "applied") {
      console.info("Analytics sync finished", fields);
    } else {
      console.info('Analytics sync dry run finished: ANALYTICS_SYNC_ENABLED is not "true", nothing was written', fields);
    }

    return Response.json(outcome.summary, { status: 200 });
  } catch (error) {
    /* Only the class of the failure: a message could carry provider output. */
    console.error("Analytics sync failed", { error: error instanceof Error ? error.name : "unknown" });
    return new Response("Run failed", { status: 500 });
  }
}

/** Vercel Cron issues a GET; POST is accepted for a manual, authorised rerun. */
export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
