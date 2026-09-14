import { hasPaymentsAdminAccess, paymentsAdminClient } from "@/lib/payments/admin-client";
import { isInvoiceStatus } from "@/lib/admin/invoices/types";
import { isPaymentStatus } from "@/lib/payments/types";
import { paymentReturnState, type PaymentReturnState, type ReturnAttempt } from "@/lib/payments/return-state";
import { readPaymentReturnToken } from "@/lib/payments/return-token";

/**
 * Turning the `state` token in the return URL into something sayable.
 *
 * The order is the security property. The token is verified first -- our own
 * signature, our own encryption, still in date -- and only a token that
 * passes yields an invoice id to look up. Nothing a visitor typed is ever
 * used as an identifier: a forged, edited, expired or absent token produces
 * no query at all, which is what stops the page being a way to ask "does
 * invoice N exist?".
 *
 * What comes back out is one of four words. No number, no amount, no
 * customer, no id -- so the page reads the same for a stranger as the URL it
 * was given, and the same for every kind of failure.
 *
 * The read runs on the system client, the same one the webhook uses. The
 * payment tables are admin-only under row level security and stay that way;
 * giving `anon` read access so that a thank-you page could work would be the
 * wrong trade entirely.
 *
 * No call to the provider. The webhook has already written what it knows, and
 * a page that asked Mollie on every visit would make a thank-you screen
 * depend on a third party being up.
 */
export async function readPaymentReturnState(token: string | undefined): Promise<PaymentReturnState> {
  const verified = readPaymentReturnToken(token);
  if (!verified) return "unknown";
  if (!hasPaymentsAdminAccess()) return "unknown";

  try {
    const db = paymentsAdminClient();

    const { data: invoice, error: invoiceError } = await db
      .from("invoices")
      .select("id, status")
      .eq("id", verified.invoiceId)
      .maybeSingle();
    if (invoiceError) throw new Error(invoiceError.message);
    if (!invoice || !isInvoiceStatus(invoice.status)) return "unknown";

    const { data: payments, error: paymentsError } = await db
      .from("payments")
      .select("status, paid_at, updated_at")
      .eq("invoice_id", invoice.id);
    if (paymentsError) throw new Error(paymentsError.message);

    const attempts: ReturnAttempt[] = (payments ?? [])
      .filter((row) => isPaymentStatus(row.status))
      .map((row) => ({ status: row.status as ReturnAttempt["status"], at: row.paid_at ?? row.updated_at }));

    return paymentReturnState({ invoiceStatus: invoice.status, attempts });
  } catch (error) {
    /*
      A database that cannot be reached is not a failed payment. The page falls
      back to the message that claims nothing, and the reason stays in the log
      rather than on a customer's screen.
    */
    console.error("Could not read the payment return state", { error });
    return "unknown";
  }
}
