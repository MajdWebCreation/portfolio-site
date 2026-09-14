import { calculateTotals } from "@/lib/money";
import type { Invoice } from "@/lib/admin/invoices/types";
import { companyProfile } from "@/lib/admin/documents/company";
import {
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
 * The link is also where the sequence lives -- `oneoff`, or `first` when
 * paying the invoice has to establish a direct debit mandate as well.
 *
 * Sending the same invoice twice must not hand out two live links for one
 * debt, so the link that already exists is reused: our own row names it,
 * Mollie is asked for its current state, and if it is still payable its own
 * URL is handed back. A new link is created only when there is nothing usable
 * -- the old one was paid, expired or archived, the outstanding amount
 * changed, or the sequence has to change because a mandate is now needed.
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
  /**
   * "first" turns this into a link that also establishes a mandate, for an
   * invoice that switches a monthly service on. It needs the customer's
   * identity at the provider; "oneoff" needs neither.
   */
  sequence?: "oneoff" | "first";
  providerCustomerId?: string;
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
  const sequence = deps.sequence ?? "oneoff";
  if (sequence === "first" && !deps.providerCustomerId) {
    return { ok: false, reason: "Er is geen Mollie-klant om de machtiging aan te koppelen." };
  }

  const stored = deps.storedLink;
  /*
    Only a link that asks the same question for the same amount may be reused.
    A link made before a monthly service was attached asks `oneoff` and would
    never produce a mandate; one made before a part payment asks too much.
  */
  if (stored && stored.sequenceType === sequence && stored.amountCents === settlement.outstandingCents) {
    const current: MolliePaymentLink = await getPaymentLink(stored.providerPaymentLinkId, config);
    const href = payableLink(current);
    if (href) {
      return { ok: true, checkoutUrl: href, paymentLinkId: current.id, reused: true };
    }
    // Otherwise it is spent or dead, and a new link is the right answer.
  }

  /*
    The amount is the invoice's outstanding gross total, whichever sequence
    this is. A monthly price is never added here: that is collected later by
    the subscription, and adding it would charge the customer twice for the
    first month.
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
    sequenceType: sequence,
    ...(sequence === "first" ? { customerId: deps.providerCustomerId } : {}),
    // Same invoice, same sequence and same amount means the same key, so a
    // retried request returns the link the first one made.
    idempotencyKey: `invoice-link-${invoice.id}-${sequence}-${settlement.outstandingCents}`,
    config,
  });

  const href = created._links?.paymentLink?.href;
  if (!href) return { ok: false, reason: "Mollie gaf geen betaallink terug." };

  await deps.persistLink({
    providerPaymentLinkId: created.id,
    checkoutUrl: href,
    sequenceType: sequence,
    amountCents: settlement.outstandingCents,
  });

  return { ok: true, checkoutUrl: href, paymentLinkId: created.id, reused: false };
}
