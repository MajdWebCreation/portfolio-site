import { calculateTotals } from "@/lib/money";
import type { Invoice } from "@/lib/admin/invoices/types";
import { companyProfile } from "@/lib/admin/documents/company";
import {
  archivePaymentLink,
  createPaymentLink,
  getPaymentLink,
  payableLink,
  type MolliePaymentLink,
} from "@/lib/mollie/client";
import { getMollieConfig, invoiceRedirectUrl, isMollieConfigured, mollieWebhookUrl } from "@/lib/mollie/config";
import { settleInvoice } from "@/lib/payments/settlement";
import type { Payment } from "@/lib/payments/types";

/**
 * The pay-by-link for an invoice mail.
 *
 * A Mollie *payment link* rather than the checkout URL of a Payments-API
 * payment. The difference matters for a mail: a checkout URL is short-lived
 * and belongs to one attempt, so a customer opening the mail a week later
 * would find a dead button, while a payment link stays valid until it is paid.
 * It is always a one-off payment: paying an invoice never establishes a
 * direct debit mandate. That has its own EUR 0.01 link, see
 * `mandate-activation.ts`.
 *
 * Sending the same invoice twice must not hand out two live links for one
 * debt, so the link that already exists is reused: our own row names it,
 * Mollie is asked for its current state, and if it is still payable its own
 * URL is handed back. A new link is created only when there is nothing usable
 * -- the old one was paid, expired or archived, the outstanding amount
 * changed, or it is a `first` link from before invoices stopped asking for
 * a mandate.
 *
 * A link that is replaced while it could still be paid is archived first.
 * One invoice has at most one payable link, so a customer holding an older
 * mail cannot pay the same debt twice -- and a payment can only arrive on the
 * link our own row names, which is the only link the webhook will accept.
 */
export type CheckoutResult =
  | { ok: true; checkoutUrl: string; paymentLinkId: string; reused: boolean }
  | { ok: false; reason: string };

export function checkoutDescription(invoice: Pick<Invoice, "number">): string {
  return `${companyProfile.name} factuur ${invoice.number.value}`;
}

/** The link we already handed out for this invoice, as we recorded it. */
export type StoredPaymentLink = {
  providerPaymentLinkId: string;
  checkoutUrl: string;
  sequenceType: "oneoff" | "first";
  amountCents: number;
};

export type CheckoutDependencies = {
  /** Payments already recorded against this invoice. */
  existing: readonly Payment[];
  /** The link recorded for this invoice, if one was ever made. */
  storedLink?: StoredPaymentLink;
  /** Records the link that is now the invoice's; replaces any earlier one. */
  persistLink: (link: StoredPaymentLink) => Promise<void>;
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

  const stored = deps.storedLink;
  /*
    Only a one-off link for the same amount may be reused. One made before a
    part payment asks too much; a `first` link from before would also
    authorise direct debit, which an invoice payment no longer does.
  */
  if (stored) {
    const current: MolliePaymentLink = await getPaymentLink(stored.providerPaymentLinkId, config);
    const href = payableLink(current);
    const fits = stored.sequenceType === "oneoff" && stored.amountCents === settlement.outstandingCents;
    if (href && fits) {
      return { ok: true, checkoutUrl: href, paymentLinkId: current.id, reused: true };
    }
    /*
      Still payable but asking the wrong question. It is closed before its
      replacement exists: if closing fails, this throws and no second link is
      made, so there is never a moment with two payable links for one debt.
      A link that is spent or dead needs nothing.
    */
    if (href) await archivePaymentLink(current.id, config);
  }

  /*
    The amount is the invoice's outstanding gross total. A monthly price is
    never added here: that is collected by the subscription.
  */
  const created = await createPaymentLink({
    amountCents: settlement.outstandingCents,
    description: checkoutDescription(invoice),
    redirectUrl: invoiceRedirectUrl(config, invoice.id),
    /*
      Mollie sends the status of the payments a link produces here. The
      invoice is named in the query string because the Payment Links API has
      no metadata field -- and it is only a hint: the route verifies with
      Mollie that the payment really belongs to this invoice's link before
      anything is written.
    */
    webhookUrl: `${mollieWebhookUrl(config)}?invoice=${encodeURIComponent(invoice.id)}`,
    // An invoice link only ever settles the invoice. Mandates are obtained
    // through their own link, never through an invoice payment.
    sequenceType: "oneoff",
    // Same invoice and same amount means the same key, so a retried request
    // returns the link the first one made.
    idempotencyKey: `invoice-link-${invoice.id}-oneoff-${settlement.outstandingCents}`,
    config,
  });

  const href = created._links?.paymentLink?.href;
  if (!href) return { ok: false, reason: "Mollie gaf geen betaallink terug." };

  await deps.persistLink({
    providerPaymentLinkId: created.id,
    checkoutUrl: href,
    sequenceType: "oneoff",
    amountCents: settlement.outstandingCents,
  });

  return { ok: true, checkoutUrl: href, paymentLinkId: created.id, reused: false };
}
