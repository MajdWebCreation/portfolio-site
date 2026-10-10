import type { SupabaseClient } from "@supabase/supabase-js";
import { adminDb } from "@/lib/admin/db";
import { invoiceAmounts, type Invoice } from "@/lib/admin/invoices/types";
import { isMollieConfigured } from "@/lib/mollie/config";
import { ensureInvoiceCheckout, type CheckoutResult, type StoredPaymentLink } from "@/lib/payments/checkout";
import { listPaymentsForInvoice } from "@/lib/payments/repository";
import { settleInvoice } from "@/lib/payments/settlement";
import { isCollecting, type Payment } from "@/lib/payments/types";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The pay-by-link for an invoice mail.
 *
 * Three outcomes, and the caller has to tell them apart:
 *
 *   link           a working checkout URL; the mail carries the button.
 *
 *   none           there deliberately is no link. Either Mollie is not
 *                  configured at all, or this invoice is collected by direct
 *                  debit -- a button beside an active mandate invites paying
 *                  the same debt twice.
 *
 *   failed         Mollie is configured and could not produce a link. That is
 *                  not a mail to send quietly without a way to pay: the caller
 *                  reports it and leaves the invoice unsent.
 */
async function collectedByDirectDebit(invoice: Invoice): Promise<boolean> {
  if (!invoice.recurringServiceId) return false;
  const db = await adminDb();
  const { data } = await db
    .from("recurring_services")
    .select("status")
    .eq("id", invoice.recurringServiceId)
    .maybeSingle();
  return data ? isCollecting({ status: data.status as never }) : false;
}

export type PayLinkResult =
  | { kind: "link"; url: string }
  | { kind: "none"; reason: "not-configured" | "direct-debit" }
  | { kind: "failed"; reason: string };

const linkColumns = "provider_payment_link_id, checkout_url, sequence_type, amount_cents";

/**
 * The payment link this invoice already has, if any.
 *
 * Our own row is the only mapping between an invoice and a Mollie payment
 * link: the Payment Links API has no metadata field, so nothing at the
 * provider can say which invoice a link belongs to.
 */
export async function readPaymentLink(
  db: SupabaseClient<Database>,
  invoiceId: string,
): Promise<{ storedLink: StoredPaymentLink } | undefined> {
  const { data, error } = await db
    .from("invoice_payment_links")
    .select(linkColumns)
    .eq("invoice_id", invoiceId)
    .eq("provider", "mollie")
    .maybeSingle();
  if (error) throw new Error(`Betaallink laden: ${error.message}`);
  if (!data) return undefined;
  return {
    storedLink: {
      providerPaymentLinkId: data.provider_payment_link_id,
      checkoutUrl: data.checkout_url,
      sequenceType: data.sequence_type as StoredPaymentLink["sequenceType"],
      amountCents: data.amount_cents,
    },
  };
}

/**
 * Records the link that is now this invoice's, replacing any earlier one.
 *
 * One row per invoice, which the unique index enforces: a second send cannot
 * leave two live links for one debt, and the row that survives is the one the
 * customer was last given.
 */
async function storePaymentLink(
  db: SupabaseClient<Database>,
  invoice: Invoice,
  link: StoredPaymentLink,
): Promise<void> {
  const row = {
    invoice_id: invoice.id,
    customer_id: invoice.customer.customerId,
    provider: "mollie",
    provider_payment_link_id: link.providerPaymentLinkId,
    checkout_url: link.checkoutUrl,
    sequence_type: link.sequenceType,
    amount_cents: link.amountCents,
  };

  const { data: found, error: readError } = await db
    .from("invoice_payment_links")
    .select("id")
    .eq("invoice_id", invoice.id)
    .eq("provider", "mollie")
    .maybeSingle();
  if (readError) throw new Error(`Betaallink vastleggen: ${readError.message}`);

  const { error } = found
    ? await db.from("invoice_payment_links").update(row).eq("id", found.id)
    : await db.from("invoice_payment_links").insert(row);
  if (error) throw new Error(`Betaallink vastleggen: ${error.message}`);
}

/** The invoice a Mollie payment link belongs to, from our own record. */
export async function invoiceIdForPaymentLink(
  db: SupabaseClient<Database>,
  providerPaymentLinkId: string,
): Promise<string | undefined> {
  const { data, error } = await db
    .from("invoice_payment_links")
    .select("invoice_id")
    .eq("provider", "mollie")
    .eq("provider_payment_link_id", providerPaymentLinkId)
    .maybeSingle();
  if (error) throw new Error(`Betaallink opzoeken: ${error.message}`);
  return data?.invoice_id;
}

/**
 * The link for an invoice, reused or made.
 *
 * Always a plain one-off payment. Paying an invoice settles that invoice and
 * nothing else; direct debit is activated on its own, through a separate
 * EUR 0.01 link (`mandate-activation.ts`), so no invoice amount or invoice
 * payment ever decides whether a customer is collected from. The first mail
 * and every reminder come through here alike.
 */
async function invoiceCheckout(
  db: SupabaseClient<Database>,
  invoice: Invoice,
  payments: readonly Payment[],
): Promise<CheckoutResult> {
  return ensureInvoiceCheckout(invoice, {
    existing: payments,
    ...((await readPaymentLink(db, invoice.id)) ?? {}),
    persistLink: (link) => storePaymentLink(db, invoice, link),
  });
}

export async function invoicePayLink(invoice: Invoice): Promise<PayLinkResult> {
  if (!isMollieConfigured()) return { kind: "none", reason: "not-configured" };
  if (await collectedByDirectDebit(invoice)) return { kind: "none", reason: "direct-debit" };

  try {
    // The admin is signed in here, so these writes go through row level
    // security like every other admin write; the webhook has its own store.
    const db = await adminDb();
    const result = await invoiceCheckout(db, invoice, await listPaymentsForInvoice(invoice.id));

    return result.ok ? { kind: "link", url: result.checkoutUrl } : { kind: "failed", reason: result.reason };
  } catch (error) {
    // The provider's own message, never the key or the request.
    const reason = error instanceof Error ? error.message : "onbekende fout";
    console.error("Could not create a payment link", { invoiceId: invoice.id, reason });
    return { kind: "failed", reason };
  }
}

/**
 * The payment button on a reminder.
 *
 * A separate entry point from `invoicePayLink` because the circumstances
 * differ, not the decision. That one runs inside an admin action, reads
 * through `adminDb()` and refuses to let an invoice go out without a working
 * button. A reminder runs in the daily job, which carries no session, and a
 * reminder without a button is still worth far more than no reminder at all
 * -- the customer already has the invoice, with the bank details on it.
 *
 * The link the invoice already has is reused when it still asks for the
 * same amount and is still payable, so a customer who kept
 * the original mail and one who opens the reminder end up at the same place
 * and a second reminder makes nothing new. A paid invoice gets no button and
 * Mollie is not asked anything.
 */
export async function reminderPayLink(
  db: SupabaseClient<Database>,
  invoice: Invoice,
  payments: readonly Payment[],
): Promise<string | undefined> {
  if (!isMollieConfigured()) return undefined;
  if (settleInvoice(invoiceAmounts(invoice).dueCents, [...payments]).settled) return undefined;

  try {
    const result = await invoiceCheckout(db, invoice, payments);
    return result.ok ? result.checkoutUrl : undefined;
  } catch (error) {
    // The reminder still goes out; only the button is missing.
    const reason = error instanceof Error ? error.message : "onbekende fout";
    console.error("Could not create a reminder payment link", { invoiceId: invoice.id, reason });
    return undefined;
  }
}
