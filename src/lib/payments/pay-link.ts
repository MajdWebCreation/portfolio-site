import type { SupabaseClient } from "@supabase/supabase-js";
import { adminDb } from "@/lib/admin/db";
import type { Invoice } from "@/lib/admin/invoices/types";
import { isMollieConfigured } from "@/lib/mollie/config";
import { decidePaymentSequence, type SequenceDecision } from "@/lib/payments/activation-decision";
import { ensureInvoiceCheckout, type StoredPaymentLink } from "@/lib/payments/checkout";
import { recurringServiceFromRow } from "@/lib/payments/mapper";
import { ensureProviderCustomer, hasUsableMandate } from "@/lib/payments/provider-customer";
import { listPaymentsForInvoice } from "@/lib/payments/repository";
import { isCollecting, type RecurringService } from "@/lib/payments/types";
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
  const db = await adminDb();
  const { data, error } = await db
    .from("recurring_services")
    .select(recurringColumns)
    .eq("activation_invoice_id", invoiceId)
    .maybeSingle();
  if (error) throw new Error(`Gekoppelde dienst laden: ${error.message}`);
  return data ? recurringServiceFromRow(data) : undefined;
}

export async function invoicePayLink(invoice: Invoice): Promise<PayLinkResult> {
  if (!isMollieConfigured()) return { kind: "none", reason: "not-configured" };
  if (await collectedByDirectDebit(invoice)) return { kind: "none", reason: "direct-debit" };

  try {
    const existing = await listPaymentsForInvoice(invoice.id);
    const db = await adminDb();

    /*
      Does this invoice have to establish a mandate? Only when a service hangs
      off it, that service is not already running, and the customer has not
      already authorised us. The mandate question is put to Mollie, not to our
      own column, because a customer can revoke one at their bank.
    */
    const service = await serviceActivatedBy(invoice.id);
    const mandate = service ? await hasUsableMandate(db, invoice.customer.customerId) : { has: false };
    const decision = decidePaymentSequence({ invoice, service, hasUsableMandate: mandate.has });

    const providerCustomerId =
      decision.sequence === "first"
        ? await ensureProviderCustomer(db, invoice.customer.customerId, {
            name: invoice.customer.companyName,
            email: invoice.customer.email,
          })
        : undefined;

    const result = await ensureInvoiceCheckout(invoice, {
      existing,
      sequence: decision.sequence,
      ...(providerCustomerId ? { providerCustomerId } : {}),
      ...((await readPaymentLink(db, invoice.id)) ?? {}),
      // The admin is signed in here, so this write goes through row level
      // security like every other admin write; the webhook has its own store.
      persistLink: (link) => storePaymentLink(db, invoice, link),
    });

    return result.ok ? { kind: "link", url: result.checkoutUrl, decision } : { kind: "failed", reason: result.reason };
  } catch (error) {
    // The provider's own message, never the key or the request.
    const reason = error instanceof Error ? error.message : "onbekende fout";
    console.error("Could not create a payment link", { invoiceId: invoice.id, reason });
    return { kind: "failed", reason };
  }
}
