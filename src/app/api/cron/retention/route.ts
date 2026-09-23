import { isAuthorisedCronRequest } from "@/lib/cron/auth";
import { hasPaymentsAdminAccess, paymentsAdminClient } from "@/lib/payments/admin-client";
import { createRetentionStore } from "@/lib/retention/retention-store";
import { runRetention } from "@/lib/retention/retention-runner";

/**
 * The daily retention pass: see lib/retention/policy.ts for the rules.
 *
 * Its own route and its own schedule, before the two mailing jobs, and with
 * nothing in common with them: a retention run that fails must not stop an
 * invoice from going out, and the other way round.
 *
 * Nothing is deleted or redacted unless the deployment says so: the
 * environment variable RETENTION_ENABLED must be exactly "true". Missing,
 * empty or anything else means a dry run -- the selection is made and
 * counted, the counts are logged and returned, and every row stays. So a
 * first deployment cannot remove anything before its selection has been read
 * in production, and the switch to a real run is a deliberate, single act.
 *
 * Idempotent by construction. A row that was deleted is not there to delete
 * again, and a body that was redacted no longer qualifies; two runs on the
 * same day do the work once.
 *
 * Deleting and redacting is system work that belongs to no admin, so it
 * runs through the elevated client, like the other jobs. The log line
 * carries the mode, the cutoff and counts only.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Read at call time, so a change in Vercel takes effect on the next run without a rebuild. */
function retentionEnabled(): boolean {
  return process.env.RETENTION_ENABLED === "true";
}

async function handle(request: Request): Promise<Response> {
  if (!isAuthorisedCronRequest(request)) {
    return new Response("Not found", { status: 404 });
  }

  if (!hasPaymentsAdminAccess()) {
    console.error("Retention job ran without SUPABASE_SECRET_KEY");
    return new Response("Not configured", { status: 503 });
  }

  const apply = retentionEnabled();

  try {
    const summary = await runRetention(createRetentionStore(paymentsAdminClient()), { apply });

    if (apply) {
      console.info("Retention run finished", summary);
    } else {
      console.info('Retention dry run finished: RETENTION_ENABLED is not "true", nothing was deleted or redacted', summary);
    }

    return Response.json(summary, { status: 200 });
  } catch (error) {
    console.error("Retention run failed", { mode: apply ? "applied" : "dry-run", error });
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
