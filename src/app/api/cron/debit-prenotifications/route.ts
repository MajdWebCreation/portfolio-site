import { isAuthorisedCronRequest } from "@/lib/cron/auth";
import { toDateKey } from "@/lib/admin/format";
import { hasPaymentsAdminAccess, paymentsAdminClient } from "@/lib/payments/admin-client";
import { invoiceLinks } from "@/lib/admin/communications/links";
import { documentDateLabel, sendDocumentMail } from "@/lib/admin/documents/email";
import { documentFileName } from "@/lib/admin/pdf/to-buffer";
import { readInvoiceArtifact } from "@/lib/admin/invoices/artifact";
import type { Invoice } from "@/lib/admin/invoices/types";
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

async function handle(request: Request): Promise<Response> {
  if (!isAuthorisedCronRequest(request)) {
    // Say nothing about why; an unauthenticated caller learns only that it
    // is not welcome.
    return new Response("Not found", { status: 404 });
  }

  if (!hasPaymentsAdminAccess()) {
    console.error("Pre-notification job ran without SUPABASE_SECRET_KEY");
    return new Response("Not configured", { status: 503 });
  }

  /*
    The daily job carries no admin session either, so the communication log is
    written through the same elevated client the store uses. Built on the
    first mail rather than up front: a run with nothing to announce should not
    open a database client to discover that.
  */
  let logClient: ReturnType<typeof paymentsAdminClient> | undefined;
  const communicationsDb = () => (logClient ??= paymentsAdminClient());

  /*
    The attachment is the PDF that was stored when the term was issued, read
    back and checked against its hash -- never a fresh render, which would be
    a different file from the one this invoice is. A term whose file is
    missing or altered throws, and the runner marks that announcement failed
    and tries again tomorrow rather than mailing something else.
  */
  const storedPdf = async (invoice: Invoice) => {
    const artifact = await readInvoiceArtifact(communicationsDb(), invoice);
    if (!artifact.ok) throw new Error(artifact.reason);
    return artifact.pdf;
  };

  try {
    const summary = await runPrenotifications(
      createPrenotificationStore(),
      storedPdf,
      /*
        The invoice mail, with the PDF attached and no payment button: this
        term is collected by direct debit, and a button would invite paying
        it twice.
      */
      async ({ invoice, serviceName, debitOn, recipientEmail, contactName, pdf }) =>
        sendDocumentMail({
          kind: "invoice",
          number: invoice.number.value,
          /* This mail *is* the pre-notification, so that is what it is filed
             as. `debit_prenotifications` stays the record of the announcement
             itself; this is the record that the customer was written to. */
          log: {
            db: communicationsDb(),
            customerId: invoice.customer.customerId,
            category: "recurring_invoice_prenotification",
            ...invoiceLinks(invoice),
          },
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
