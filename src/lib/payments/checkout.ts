import { invoiceAmounts, type Invoice } from "@/lib/admin/invoices/types";
import { companyProfile } from "@/lib/admin/documents/company";
import {
  archivePaymentLink,
  createPaymentLink,
  getPaymentLink,
  listPaymentLinkPayments,
  payableLink,
  type MolliePaymentLink,
} from "@/lib/mollie/client";
import { getMollieConfig, invoiceRedirectUrl, isMollieConfigured, mollieWebhookUrl } from "@/lib/mollie/config";
import { settleInvoice } from "@/lib/payments/settlement";
import { isSuccessful, type Payment } from "@/lib/payments/types";

/**
 * The pay-by-link for an invoice mail.
 *
 * A Mollie *payment link* rather than the checkout URL of a Payments-API
 * payment. The difference matters for a mail: a checkout URL is short-lived
 * and belongs to one attempt, so a customer opening the mail a week later
 * would find a dead button, while a payment link stays valid until it is paid.
 * Its sequence is the caller's decision (pay-link.ts): `oneoff`, or `first`
 * when this payment of the invoice is also the customer's direct debit
 * mandate. Either way the amount is what is still owed on the invoice.
 *
 * Sending the same invoice twice must not hand out two live links for one
 * debt, so the link that already exists is reused: our own row names it,
 * Mollie is asked for its current state, and if it is still payable its own
 * URL is handed back. A new link is created only when there is nothing usable
 * -- the old one was paid, expired or archived, the outstanding amount
 * changed, or it asks a different question (`first` where a mandate is no
 * longer needed, `oneoff` where it now is).
 *
 * A link that is replaced while it could still be paid is archived first.
 * One invoice has at most one payable link, so a customer holding an older
 * mail cannot pay the same debt twice -- and a payment can only arrive on the
 * link our own row names, which is the only link the webhook will accept.
 */
export type CheckoutResult =
  | { ok: true; checkoutUrl: string; paymentLinkId: string; reused: boolean }
  | { ok: false; reason: string };

/** The two refusals that mean "nothing to pay", named so callers can tell them from a failure. */
export const nothingDueReason = "Deze factuur heeft geen te betalen bedrag.";
export const alreadyPaidReason = "Deze factuur is al betaald.";
/**
 * The stored link has a payment on it that is still running, or paid while
 * our records do not show it yet (its webhook is late). Replacing the link
 * now would orphan that payment -- the webhook only traces payments of the
 * link our row names -- and hand out a second way to pay the same debt.
 */
export const paymentOnLinkReason = "Er loopt nog een betaling via de vorige betaallink van deze factuur.";

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
  /**
   * `first`: paying this link also gives the direct debit mandate, attached
   * to `providerCustomerId`. Decided by pay-link.ts, never here.
   */
  sequence: "oneoff" | "first";
  providerCustomerId?: string;
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

  const total = invoiceAmounts(invoice).dueCents;
  if (total <= 0) return { ok: false, reason: nothingDueReason };

  const settlement = settleInvoice(total, [...deps.existing]);
  if (settlement.settled) return { ok: false, reason: alreadyPaidReason };

  if (deps.sequence === "first" && !deps.providerCustomerId) {
    return { ok: false, reason: "Een machtigingsbetaling heeft een klantprofiel bij Mollie nodig." };
  }

  const config = getMollieConfig();

  const stored = deps.storedLink;
  /*
    Only a link asking the same question for the same amount may be reused.
    One made before a part payment asks too much; a `first` link where the
    mandate is no longer needed would ask for it twice, and a `oneoff` link
    where it is needed would collect the money and lose the mandate.
  */
  if (stored) {
    const current: MolliePaymentLink = await getPaymentLink(stored.providerPaymentLinkId, config);
    const href = payableLink(current);
    const fits = stored.sequenceType === deps.sequence && stored.amountCents === settlement.outstandingCents;
    if (href && fits) {
      return { ok: true, checkoutUrl: href, paymentLinkId: current.id, reused: true };
    }
    /*
      About to be replaced. Not while a payment on it is open, pending or
      authorized, or paid without our records knowing: the row is about to
      name another link, and that payment could no longer be traced to this
      invoice. It ends by itself, or its webhook arrives; then the next
      request may replace the link.
    */
    const recorded = new Set(deps.existing.filter(isSuccessful).flatMap((payment) => (payment.providerPaymentId ? [payment.providerPaymentId] : [])));
    const started = (await listPaymentLinkPayments(current.id, config)).some(
      (payment) =>
        payment.status === "open" ||
        payment.status === "pending" ||
        payment.status === "authorized" ||
        (payment.status === "paid" && !recorded.has(payment.id)),
    );
    if (started) return { ok: false, reason: paymentOnLinkReason };

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
    /*
      `first` settles the invoice and gives the mandate in one payment; the
      mandate attaches to our own Mollie customer for this customer, never
      to one a payment names.
    */
    sequenceType: deps.sequence,
    ...(deps.sequence === "first" && deps.providerCustomerId ? { customerId: deps.providerCustomerId } : {}),
    // Same invoice, same amount and the same link replaced means the same
    // key, so a retried request returns the link the first one made. The
    // replaced link is part of it: an amount that comes back to an earlier
    // figure must not be answered with that earlier, archived link.
    idempotencyKey: `invoice-link-${invoice.id}-${deps.sequence}-${settlement.outstandingCents}${stored ? `-after-${stored.providerPaymentLinkId}` : ""}`,
    config,
  });

  /* Only a link that can be paid is handed out; anything else is a failure to report, never a dead button. */
  const href = payableLink(created);
  if (!href) return { ok: false, reason: "Mollie gaf geen betaalbare betaallink terug." };

  await deps.persistLink({
    providerPaymentLinkId: created.id,
    checkoutUrl: href,
    sequenceType: deps.sequence,
    amountCents: settlement.outstandingCents,
  });

  return { ok: true, checkoutUrl: href, paymentLinkId: created.id, reused: false };
}
