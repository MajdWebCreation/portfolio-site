import type { InvoiceStatus } from "@/lib/admin/invoices/types";
import type { PaymentStatus } from "@/lib/payments/types";

/**
 * What the return page may honestly tell a customer who just came back from
 * the checkout.
 *
 * The provider sends everyone back to the same URL -- someone who paid,
 * someone who cancelled, someone whose bank refused -- so arriving here proves
 * nothing. What money actually did is settled by the webhook, which writes to
 * our own tables, and that is what this reads.
 *
 * The one thing it must never do is confirm a payment that did not happen. So
 * the states are asymmetric on purpose:
 *
 *   paid        the invoice itself says paid. Nothing weaker counts: a
 *               payment row that says paid while the invoice does not is a
 *               webhook mid-flight, or a part payment, and neither is a
 *               settled debt.
 *
 *   processing  we do not know yet, and that is normal. The browser regularly
 *               wins the race against the webhook, so an invoice that is not
 *               paid *yet* is not a failed payment -- and an invoice with no
 *               payment recorded at all is the most ordinary case of that.
 *
 *   failed      the last attempt on this invoice ended badly and nothing has
 *               replaced it. Only then is a customer told to try again.
 *
 *   unknown     we cannot tell which invoice this is. Says nothing about
 *               anyone's payment, because it knows nothing about it.
 */
export type PaymentReturnState = "paid" | "processing" | "failed" | "unknown";

/** An attempt, reduced to the two things this decision needs. */
export type ReturnAttempt = {
  status: PaymentStatus;
  /** When it last changed; `paid_at` where there is one, else `updated_at`. */
  at: string;
};

/** Ended, and ended badly. `expired` is a customer who never finished. */
const terminalFailures: readonly PaymentStatus[] = ["failed", "canceled", "expired"];

export function paymentReturnState(input: {
  /** The invoice the `doc` hint resolved to; absent when it resolved to none. */
  invoiceStatus?: InvoiceStatus;
  attempts: readonly ReturnAttempt[];
}): PaymentReturnState {
  const { invoiceStatus, attempts } = input;

  if (!invoiceStatus) return "unknown";
  if (invoiceStatus === "paid") return "paid";

  // An attempt that is still running outranks an older failure: the customer
  // may be halfway through paying it right now.
  if (attempts.some((attempt) => attempt.status === "open" || attempt.status === "pending")) return "processing";

  /*
    Nothing recorded at all. Almost always the race -- the redirect beat the
    webhook by a second -- and never evidence of a failure, so it may not be
    reported as one.
  */
  if (attempts.length === 0) return "processing";

  const latest = [...attempts].sort((a, b) => a.at.localeCompare(b.at)).at(-1)!;
  if (terminalFailures.includes(latest.status)) return "failed";

  /*
    What is left is an attempt that succeeded while the invoice still does not
    say paid: the webhook is partway through its work, or this was a part
    payment. Either way the debt is not settled, so it is still in progress.
  */
  return "processing";
}
