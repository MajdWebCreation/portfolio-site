import type { SupabaseClient } from "@supabase/supabase-js";
import { adminDb } from "@/lib/admin/db";
import type { Invoice } from "@/lib/admin/invoices/types";
import { isMollieConfigured } from "@/lib/mollie/config";
import { calculateTotals } from "@/lib/money";
import {
  decidePaymentSequence,
  linkSequence,
  type PaymentSequence,
  type SequenceDecision,
} from "@/lib/payments/activation-decision";
import { ensureInvoiceCheckout, type CheckoutResult, type StoredPaymentLink } from "@/lib/payments/checkout";
import { recurringServiceFromRow } from "@/lib/payments/mapper";
import { ensureProviderCustomer, hasUsableMandate } from "@/lib/payments/provider-customer";
import { listPaymentsForInvoice } from "@/lib/payments/repository";
import { settleInvoice } from "@/lib/payments/settlement";
import { isCollecting, type Payment, type RecurringService } from "@/lib/payments/types";
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
  | { kind: "link"; url: string; decision: SequenceDecision }
  | { kind: "none"; reason: "not-configured" | "direct-debit" }
  | { kind: "failed"; reason: string };

const recurringColumns =
  "id, customer_id, name, description, amount_cents, currency, vat_rate, billing_interval, starts_on, status, project_id, activation_invoice_id, mollie_subscription_id, created_at, updated_at";

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

/** The service this invoice is meant to switch on, if it is meant to. */
export async function serviceActivatedBy(invoiceId: string): Promise<RecurringService | undefined> {
  return activatedService(await adminDb(), invoiceId);
}

async function activatedService(
  db: SupabaseClient<Database>,
  invoiceId: string,
): Promise<RecurringService | undefined> {
  const { data, error } = await db
    .from("recurring_services")
    .select(recurringColumns)
    .eq("activation_invoice_id", invoiceId)
    .maybeSingle();
  if (error) throw new Error(`Gekoppelde dienst laden: ${error.message}`);
  return data ? recurringServiceFromRow(data) : undefined;
}

/**
 * What a payment link for this invoice has to be, decided in one place.
 *
 * The first mail and every reminder ask this same function, so they cannot
 * disagree about whether paying establishes a mandate. It answers four
 * questions in order:
 *
 *   - does a monthly service hang off this invoice;
 *   - does the customer already have a mandate Mollie calls valid -- asked of
 *     Mollie, never of our own column, because a mandate can be revoked at
 *     the bank and a pending one cannot be collected against;
 *   - therefore `oneoff` or `first` (`linkSequence`);
 *   - and for `first`, which Mollie customer the mandate attaches to.
 *
 * Whether the existing link can be handed out again is the next step's
 * business: `ensureInvoiceCheckout` reuses it when it asks this same question
 * for the same amount and can still be paid.
 */
export type PaymentIntent = {
  decision: SequenceDecision;
  sequence: PaymentSequence;
  providerCustomerId?: string;
};

export async function invoicePaymentIntent(db: SupabaseClient<Database>, invoice: Invoice): Promise<PaymentIntent> {
  const service = await activatedService(db, invoice.id);
  const mandate = service ? await hasUsableMandate(db, invoice.customer.customerId) : { has: false };
  const decision = decidePaymentSequence({ invoice, service, hasUsableMandate: mandate.has });
  const sequence = linkSequence(decision, Boolean(invoice.activationNote));

  const providerCustomerId =
    sequence === "first" ? await ensureProviderCustomer(db, invoice.customer.customerId) : undefined;
  return { decision, sequence, ...(providerCustomerId ? { providerCustomerId } : {}) };
}

/** The link for an invoice, reused or made, through the intent above. */
async function invoiceCheckout(
  db: SupabaseClient<Database>,
  invoice: Invoice,
  payments: readonly Payment[],
): Promise<{ result: CheckoutResult; intent: PaymentIntent }> {
  const intent = await invoicePaymentIntent(db, invoice);
  const result = await ensureInvoiceCheckout(invoice, {
    existing: payments,
    sequence: intent.sequence,
    ...(intent.providerCustomerId ? { providerCustomerId: intent.providerCustomerId } : {}),
    ...((await readPaymentLink(db, invoice.id)) ?? {}),
    persistLink: (link) => storePaymentLink(db, invoice, link),
  });
  return { result, intent };
}

export async function invoicePayLink(invoice: Invoice): Promise<PayLinkResult> {
  if (!isMollieConfigured()) return { kind: "none", reason: "not-configured" };
  if (await collectedByDirectDebit(invoice)) return { kind: "none", reason: "direct-debit" };

  try {
    // The admin is signed in here, so these writes go through row level
    // security like every other admin write; the webhook has its own store.
    const db = await adminDb();
    const { result, intent } = await invoiceCheckout(db, invoice, await listPaymentsForInvoice(invoice.id));

    return result.ok
      ? { kind: "link", url: result.checkoutUrl, decision: intent.decision }
      : { kind: "failed", reason: result.reason };
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
 * What the link asks for is decided by `invoicePaymentIntent`, exactly as for
 * the first mail. An invoice that announced the first direct debit keeps
 * asking for that authorisation until the customer has given it: a reminder
 * that fell back to `oneoff` would collect the money and silently lose the
 * mandate the invoice promised.
 *
 * The link the invoice already has is reused when it still asks the same
 * question for the same amount and is still payable, so a customer who kept
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
  if (settleInvoice(calculateTotals(invoice.lines).totalCents, [...payments]).settled) return undefined;

  try {
    const { result } = await invoiceCheckout(db, invoice, payments);
    return result.ok ? result.checkoutUrl : undefined;
  } catch (error) {
    // The reminder still goes out; only the button is missing.
    const reason = error instanceof Error ? error.message : "onbekende fout";
    console.error("Could not create a reminder payment link", { invoiceId: invoice.id, reason });
    return undefined;
  }
}
