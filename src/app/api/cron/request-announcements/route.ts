import { isAuthorisedCronRequest } from "@/lib/cron/auth";
import { hasPaymentsAdminAccess, paymentsAdminClient } from "@/lib/payments/admin-client";
import { notifyPendingQuoteDecisions } from "@/lib/quotes/decision-notify";
import { announcePendingRequests } from "@/lib/requests/announce-sweep";

/**
 * The daily pass over the portal's mails that did not go out: customer
 * requests (lib/requests/announce-sweep.ts) and decisions on quotes
 * (notifyPendingQuoteDecisions in lib/quotes/decision-notify.ts). Its own
 * route and schedule, like the other jobs, so a failure here stops nothing
 * else; and the two passes run apart, so one failing does not stop the
 * other.
 *
 * Idempotent: a request is announced under its lease and marked per mail
 * once it went, so a second run, a retry or the admin's button at the same
 * moment sends nothing twice. The log line carries counts only.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request): Promise<Response> {
  if (!isAuthorisedCronRequest(request)) {
    return new Response("Not found", { status: 404 });
  }

  if (!hasPaymentsAdminAccess()) {
    console.error("Request announcement job ran without SUPABASE_SECRET_KEY");
    return new Response("Not configured", { status: 503 });
  }

  const db = paymentsAdminClient();
  let failed = false;

  let requests;
  try {
    requests = await announcePendingRequests(db);
    console.info("Request announcement run finished", requests);
  } catch (error) {
    failed = true;
    console.error("Request announcement run failed", { error: error instanceof Error ? error.message : error });
  }

  let quoteDecisions;
  try {
    quoteDecisions = await notifyPendingQuoteDecisions(db);
    console.info("Quote decision mail run finished", quoteDecisions);
  } catch (error) {
    failed = true;
    console.error("Quote decision mail run failed", { error: error instanceof Error ? error.message : error });
  }

  if (failed) return new Response("Run failed", { status: 500 });
  return Response.json({ ...requests, quoteDecisions }, { status: 200 });
}

/** Vercel Cron issues a GET; POST is accepted for a manual, authorised rerun. */
export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
