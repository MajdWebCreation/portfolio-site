import { calculateTotals } from "@/lib/money";
import type { Invoice } from "@/lib/admin/invoices/types";
import { companyProfile } from "@/lib/admin/documents/company";
import {
  createPayment,
  getPayment,
  paymentStatusFromMollie,
  type MolliePayment,
} from "@/lib/mollie/client";
import { getMollieConfig, invoiceRedirectUrl, isMollieConfigured, mollieWebhookUrl } from "@/lib/mollie/config";
import { settleInvoice } from "@/lib/payments/settlement";
import type { Payment } from "@/lib/payments/types";

/**
 * Getting a pay-by-link for an invoice, without ever making a second one by
 * accident.
 *
 * Resending an invoice is a normal thing to do, and every resend creating a
 * fresh Mollie payment would leave a customer holding several live links for
 * one debt. So an attempt that is still running is reused: the stored payment
 * row names the Mollie payment, Mollie is asked for its current state, and if
 * it is still payable its own checkout link is handed back.
 *
 * Only when there is nothing usable is a new payment created, and that call
 * carries an idempotency key derived from the invoice and the attempt number,
 * so a double click cannot create two either.
 */
export type CheckoutResult =
  | { ok: true; checkoutUrl: string; molliePaymentId: string; reused: boolean }
  | { ok: false; reason: string };

export function checkoutDescription(invoice: Pick<Invoice, "number">): string {
  return `${companyProfile.name} factuur ${invoice.number.value}`;
}

/** A payment row that may still lead to money arriving. */
function reusableAttempt(payments: readonly Payment[]): Payment | undefined {
  return payments.find(
    (payment) =>
      payment.source === "mollie" &&
      Boolean(payment.providerPaymentId) &&
      (payment.status === "open" || payment.status === "pending"),
  );
}

function checkoutLink(payment: MolliePayment): string | undefined {
  return payment._links?.checkout?.href;
}

export type CheckoutDependencies = {
  /** Payments already recorded against this invoice. */
  existing: readonly Payment[];
  /** Records or refreshes the row for a Mollie payment. */
  persist: (payment: MolliePayment) => Promise<void>;
};

/**
 * Written against injected dependencies rather than reaching for the database
 * itself, so the decision -- reuse or create -- is testable without a network
 * or a database.
 */
export async function ensureInvoiceCheckout(
  invoice: Invoice,
  deps: CheckoutDependencies,
): Promise<CheckoutResult> {
  if (!isMollieConfigured()) return { ok: false, reason: "Mollie is niet geconfigureerd." };

  const total = calculateTotals(invoice.lines).totalCents;
  if (total <= 0) return { ok: false, reason: "Deze factuur heeft geen te betalen bedrag." };

  const settlement = settleInvoice(total, [...deps.existing]);
  if (settlement.settled) return { ok: false, reason: "Deze factuur is al betaald." };

  const config = getMollieConfig();

  const reusable = reusableAttempt(deps.existing);
  if (reusable?.providerPaymentId) {
    const current = await getPayment(reusable.providerPaymentId, config);
    await deps.persist(current);

    const href = checkoutLink(current);
    const status = paymentStatusFromMollie(current.status);
    if (href && (status === "open" || status === "pending")) {
      return { ok: true, checkoutUrl: href, molliePaymentId: current.id, reused: true };
    }
    // Otherwise it is finished or dead, and a new attempt is the right answer.
  }

  const created = await createPayment({
    amountCents: settlement.outstandingCents,
    description: checkoutDescription(invoice),
    redirectUrl: invoiceRedirectUrl(config, invoice.number.value),
    webhookUrl: mollieWebhookUrl(config),
    metadata: { kind: "invoice", invoiceId: invoice.id, customerId: invoice.customer.customerId },
    sequenceType: "oneoff",
    // Same invoice and same attempt number means the same key, so a retried
    // request returns the payment the first one made.
    idempotencyKey: `invoice-${invoice.id}-${deps.existing.length}`,
    config,
  });

  await deps.persist(created);

  const href = checkoutLink(created);
  if (!href) return { ok: false, reason: "Mollie gaf geen betaallink terug." };

  return { ok: true, checkoutUrl: href, molliePaymentId: created.id, reused: false };
}
