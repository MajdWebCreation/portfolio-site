import { documentDateLabel } from "@/lib/admin/documents/email";
import { toDateKey } from "@/lib/admin/format";
import { formatCents } from "@/lib/money";
import { isAuthorisedCronRequest } from "@/lib/cron/auth";
import { hasPaymentsAdminAccess, paymentsAdminClient } from "@/lib/payments/admin-client";
import { reminderPayLink } from "@/lib/payments/pay-link";
import { reminderSubject, sendReminderMail } from "@/lib/payments/reminder-email";
import { createReminderStore } from "@/lib/payments/reminder-store";
import { runPaymentReminders } from "@/lib/payments/reminder-runner";
import type { ReminderStage } from "@/lib/payments/collection-policy";

/**
 * The daily payment reminder pass.
 *
 * Its own route rather than a second half of the pre-notification job, and on
 * its own schedule an hour later. The two jobs have nothing to say to each
 * other, and a reminder run that falls over must never be able to stop
 * invoices from going out.
 *
 * The work is idempotent: one row per invoice per stage, so two calls on the
 * same day, a retry after a timeout, or two instances at once all end at the
 * unique index, and a customer is reminded once.
 *
 * Nothing here decides anything. Which invoice gets which mail today comes
 * from `invoiceCollectionView`, the same function the admin screen reads, so
 * the screen cannot promise something this job would not do.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const categories: Record<ReminderStage, "payment_reminder_first" | "payment_reminder_second" | "payment_final_notice"> = {
  first_reminder: "payment_reminder_first",
  second_reminder: "payment_reminder_second",
  final_notice: "payment_final_notice",
};

async function handle(request: Request): Promise<Response> {
  if (!isAuthorisedCronRequest(request)) {
    // Say nothing about why; an unauthenticated caller learns only that it
    // is not welcome.
    return new Response("Not found", { status: 404 });
  }

  if (!hasPaymentsAdminAccess()) {
    console.error("Payment reminder job ran without SUPABASE_SECRET_KEY");
    return new Response("Not configured", { status: 503 });
  }

  /*
    The job carries no admin session, so the communication log and the payment
    link are written through the elevated client. Built on the first mail: a
    run with nothing to chase should not open a client to discover that.
  */
  let elevated: ReturnType<typeof paymentsAdminClient> | undefined;
  const client = () => (elevated ??= paymentsAdminClient());

  try {
    const summary = await runPaymentReminders(
      createReminderStore(),
      async ({ invoice, stage, recipientEmail, contactName, daysOverdue, outstandingCents, finalDateKey, payments }) => {
        /*
          The button the customer sees. The link the invoice already carries
          is reused when it still fits; a reminder never establishes a
          mandate, and it never asks for a cent more than the invoice does.
          No link is not a reason to stay silent -- the customer has the
          invoice, with the bank details on it.
        */
        const payUrl = await reminderPayLink(client(), invoice, payments);

        return sendReminderMail(
          recipientEmail,
          {
            stage,
            contactName,
            invoiceNumber: invoice.number.value,
            dueDateLabel: documentDateLabel(invoice.dueDate),
            daysOverdue,
            outstandingLabel: formatCents(outstandingCents),
            finalDateLabel: documentDateLabel(finalDateKey),
            ...(payUrl ? { payUrl } : {}),
          },
          {
            db: client(),
            customerId: invoice.customer.customerId,
            category: categories[stage],
            invoiceId: invoice.id,
            ...(invoice.quoteId ? { quoteId: invoice.quoteId } : {}),
            ...(invoice.projectId ? { projectId: invoice.projectId } : {}),
            ...(invoice.recurringServiceId ? { recurringServiceId: invoice.recurringServiceId } : {}),
          },
        );
      },
      reminderSubject,
      toDateKey(new Date()),
    );

    // Counts and invoice ids only: no customer, no address, no amount.
    console.info("Payment reminder run finished", {
      considered: summary.considered,
      sent: summary.sent,
      skipped: summary.skipped,
      failed: summary.failed,
      collectionReady: summary.collectionReady.length,
      problems: summary.problems.length,
    });

    return Response.json(summary, { status: 200 });
  } catch (error) {
    console.error("Payment reminder run failed", { error });
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
