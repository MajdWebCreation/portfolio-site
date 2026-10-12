import { isAuthorisedCronRequest } from "@/lib/cron/auth";
import { hasPaymentsAdminAccess, paymentsAdminClient } from "@/lib/payments/admin-client";
import { announcePendingRequests } from "@/lib/requests/announce-sweep";

/**
 * The daily pass over customer requests whose mails did not go out: see
 * lib/requests/announce-sweep.ts. Its own route and schedule, like the
 * other jobs, so a failure here stops nothing else.
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

  try {
    const summary = await announcePendingRequests(paymentsAdminClient());
    console.info("Request announcement run finished", summary);
    return Response.json(summary, { status: 200 });
  } catch (error) {
    console.error("Request announcement run failed", { error: error instanceof Error ? error.message : error });
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
