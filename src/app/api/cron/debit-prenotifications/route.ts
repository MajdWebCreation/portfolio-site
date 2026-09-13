import { timingSafeEqual } from "node:crypto";
import { toDateKey } from "@/lib/admin/format";
import { hasPaymentsAdminAccess } from "@/lib/payments/admin-client";
import { documentDateLabel, sendDocumentMail } from "@/lib/admin/documents/email";
import { documentFileName, renderInvoicePdf } from "@/lib/admin/pdf/to-buffer";
import { calculateTotals, formatCents } from "@/lib/money";
import { runPrenotifications } from "@/lib/payments/prenotification-runner";
import { createPrenotificationStore } from "@/lib/payments/prenotification-store";

/**
 * The daily SEPA pre-notification pass.
 *
 * Vercel Cron calls this once a day with `Authorization: Bearer $CRON_SECRET`,
 * the secret being an environment variable this deployment and Vercel share.
 * Nothing else gets in: without a configured secret the route refuses
 * outright rather than running open, so a missing variable cannot turn this
 * into a public button that mails customers.
 *
 * The work itself is idempotent. Two calls on the same day, a retry after a
 * timeout, or two instances at once all end at the unique index on the
 * announcement, so a customer is told once.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const given = Buffer.from(header);
  const wanted = Buffer.from(expected);
  // Same length check first: timingSafeEqual throws on a mismatch.
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

async function handle(request: Request): Promise<Response> {
  if (!authorised(request)) {
    // Say nothing about why; an unauthenticated caller learns only that it
    // is not welcome.
    return new Response("Not found", { status: 404 });
  }

  if (!hasPaymentsAdminAccess()) {
    console.error("Pre-notification job ran without SUPABASE_SECRET_KEY");
    return new Response("Not configured", { status: 503 });
  }

  try {
    const summary = await runPrenotifications(
      createPrenotificationStore(),
      renderInvoicePdf,
      /*
        The invoice mail, with the PDF attached and no payment button: this
        term is collected by direct debit, and a button would invite paying
        it twice.
      */
      async ({ invoice, serviceName, debitOn, recipientEmail, contactName, pdf }) =>
        sendDocumentMail({
          kind: "invoice",
          number: invoice.number.value,
          recipientEmail,
          contactName,
          issueDateLabel: documentDateLabel(invoice.issueDate),
          deadlineLabel: documentDateLabel(debitOn),
          totalLabel: formatCents(calculateTotals(invoice.lines).totalCents),
          pdf,
          fileName: documentFileName(invoice.number.value),
          recurring: { serviceName, collection: { kind: "scheduled", debitOn } },
        }),
      toDateKey(new Date()),
    );

    // Counts and service ids only: no customer, no address, no amount.
    console.info("Pre-notification run finished", {
      considered: summary.considered,
      invoicesCreated: summary.invoicesCreated,
      announced: summary.announced,
      skipped: summary.skipped,
      failed: summary.failed,
      problems: summary.problems.length,
    });

    return Response.json(summary, { status: 200 });
  } catch (error) {
    console.error("Pre-notification run failed", { error });
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
