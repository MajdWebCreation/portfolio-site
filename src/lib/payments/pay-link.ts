import type { SupabaseClient } from "@supabase/supabase-js";
import { adminDb } from "@/lib/admin/db";
import { toDateKey } from "@/lib/admin/format";
import { invoiceColumns, invoiceFromRow, type InvoiceRow } from "@/lib/admin/invoices/mapper";
import { invoiceAmounts, type Invoice } from "@/lib/admin/invoices/types";
import { archivePaymentLink, getPaymentLink, payableLink, type MandateState } from "@/lib/mollie/client";
import { getMollieConfig, isMollieConfigured } from "@/lib/mollie/config";
import { ensureInvoiceCheckout, paymentOnLinkReason, type StoredPaymentLink } from "@/lib/payments/checkout";
import { closeOpenActivation } from "@/lib/payments/mandate-activation";
import { ensureProviderCustomer, lookupMandate } from "@/lib/payments/provider-customer";
import { listPaymentsForInvoice, paymentsOfInvoice } from "@/lib/payments/repository";
import { settleInvoice, stillCollectedByDirectDebit } from "@/lib/payments/settlement";
import { awaitsDirectDebit, isCollecting, type Payment, type RecurringStatus } from "@/lib/payments/types";
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
async function collectedByDirectDebit(db: SupabaseClient<Database>, invoice: Invoice): Promise<boolean> {
  if (!invoice.recurringServiceId) return false;
  const { data, error } = await db
    .from("recurring_services")
    .select("status")
    .eq("id", invoice.recurringServiceId)
    .maybeSingle();
  /* Not knowing is not "no direct debit": a failed read must never produce a second way to pay. */
  if (error) throw new Error(`Dienst van factuur laden: ${error.message}`);
  return data ? isCollecting({ status: data.status as never }) : false;
}

export type PayLinkResult =
  | { kind: "link"; url: string; mode: InvoicePaymentMode }
  | { kind: "none"; reason: NoPaymentReason }
  | { kind: "failed"; reason: string };

/**
 * The two kinds of invoice payment.
 *
 *   oneoff   an ordinary payment of what is still owed.
 *   first    the same payment of what is still owed, which is at the same
 *            time Mollie's first payment: it gives the direct debit mandate
 *            for the customer's monthly service. One payment, one button --
 *            the customer pays the invoice and authorises the collection in
 *            one step. Never a separate amount.
 */
export type InvoicePaymentMode = "oneoff" | "first";

export type NoPaymentReason = "not-configured" | "direct-debit" | "payment-in-flight";

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

  /*
    One statement against the unique index, so two requests at once -- a
    double click in the portal, a send next to a reminder -- both land on the
    one row instead of the second failing on it. Same invoice and amount means
    the same idempotency key at Mollie, so both carry the same link.
  */
  const { error } = await db.from("invoice_payment_links").upsert(row, { onConflict: "invoice_id,customer_id" });
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
 * Whether paying an invoice of this customer is also the mandate: a service
 * of theirs waits for direct debit (awaitsDirectDebit) and Mollie reports no
 * mandate that is valid or on its way. A pending mandate is not asked for
 * again; a revoked or failed one is.
 *
 * Pure, so every surface -- invoice mail, reminder, portal, admin -- shares
 * exactly this rule through invoicePaymentDecision below.
 */
export function invoicePaymentMode(input: { awaitsMandate: boolean; mandate?: MandateState }): InvoicePaymentMode {
  return input.awaitsMandate && (input.mandate === "none" || input.mandate === "invalid") ? "first" : "oneoff";
}

/** Whether a service of this customer waits for direct debit. A failed read throws: not knowing is never "no". */
async function customerAwaitsDirectDebit(db: SupabaseClient<Database>, customerId: string, todayKey: string): Promise<boolean> {
  const { data, error } = await db.from("recurring_services").select("status, mollie_subscription_id, ends_on").eq("customer_id", customerId);
  if (error) throw new Error(`Diensten van klant laden: ${error.message}`);
  return (data ?? []).some((row) =>
    awaitsDirectDebit(
      { status: row.status as RecurringStatus, hasSubscription: Boolean(row.mollie_subscription_id), ...(row.ends_on ? { endsOn: row.ends_on } : {}) },
      todayKey,
    ),
  );
}

export type InvoicePaymentDecision =
  | { kind: "pay"; mode: InvoicePaymentMode; settled: boolean }
  | { kind: "none"; reason: NoPaymentReason };

/**
 * THE decision: may a payment of this invoice be started now, and which
 * kind. Every door asks it -- the admin's send, the first invoice mail, the
 * reminder and the portal -- so none of them can offer what another
 * refuses, or offer a one-off payment where another would ask for the
 * mandate.
 *
 *   - no Mollie, nothing;
 *   - a payment still in flight (open, pending), nothing: the same debt
 *     would be paid twice, and a running `first` payment may already be
 *     giving the mandate;
 *   - still the direct debit's to collect (stillCollectedByDirectDebit),
 *     nothing: a collection may be under way at the bank. After a failed
 *     collection that nothing repaired, an ordinary `oneoff` payment -- the
 *     mandate exists, so never `first` again;
 *   - otherwise `first` when a service of the customer waits for direct
 *     debit and Mollie has no valid or pending mandate, else `oneoff`.
 *
 * What is owed comes from the ledger (settleInvoice over the invoice's due
 * amount after credit notes). A settled invoice is never asked about a
 * mandate -- a paid invoice is not paid again to obtain one; the next real
 * invoice carries it. Every read that fails throws: a decision is never
 * made on a guess.
 */
export async function invoicePaymentDecision(
  db: SupabaseClient<Database>,
  invoice: Invoice,
  payments: readonly Payment[],
  todayKey: string = toDateKey(new Date()),
): Promise<InvoicePaymentDecision> {
  if (!isMollieConfigured()) return { kind: "none", reason: "not-configured" };

  const settlement = settleInvoice(invoiceAmounts(invoice).dueCents, [...payments]);
  if (settlement.inFlight) return { kind: "none", reason: "payment-in-flight" };
  if (stillCollectedByDirectDebit(await collectedByDirectDebit(db, invoice), settlement)) return { kind: "none", reason: "direct-debit" };
  /* Nothing owed: checkout.ts refuses it as such, and Mollie is not asked about a mandate. */
  if (settlement.settled) return { kind: "pay", mode: "oneoff", settled: true };

  const customerId = invoice.customer.customerId;
  if (!(await customerAwaitsDirectDebit(db, customerId, todayKey))) return { kind: "pay", mode: "oneoff", settled: false };
  const mandate = await lookupMandate(db, customerId);
  return { kind: "pay", mode: invoicePaymentMode({ awaitsMandate: true, mandate: mandate.state }), settled: false };
}

/**
 * The link for an invoice, reused or made, for the mode just decided.
 *
 * A `first` link attaches to this customer's own Mollie customer, and closes
 * an older EUR 0.01 activation link that might still be open -- one way to
 * authorise at a time.
 */
async function invoiceCheckout(db: SupabaseClient<Database>, invoice: Invoice, payments: readonly Payment[], mode: InvoicePaymentMode) {
  const customerId = invoice.customer.customerId;
  const providerCustomerId = mode === "first" ? await ensureProviderCustomer(db, customerId) : undefined;
  if (mode === "first") await closeOpenActivation(db, customerId);
  return ensureInvoiceCheckout(invoice, {
    sequence: mode,
    ...(providerCustomerId ? { providerCustomerId } : {}),
    existing: payments,
    ...((await readPaymentLink(db, invoice.id)) ?? {}),
    persistLink: (link) => storePaymentLink(db, invoice, link),
  });
}

export async function invoicePayLink(invoice: Invoice): Promise<PayLinkResult> {
  // The admin is signed in here, so these writes go through row level
  // security like every other admin write; the webhook has its own store.
  const db = await adminDb();
  return payLinkFor(db, invoice, () => listPaymentsForInvoice(invoice.id));
}

/**
 * The decision above and, when it allows a payment, its one link -- reused
 * when the stored link asks the same question for the same amount and can
 * still be paid, otherwise made (checkout.ts). The one entry point for the
 * admin's send on the admin session, the customer portal on its payment
 * boundary after the member's own session proved the invoice theirs, and
 * the reminder job.
 */
export async function payLinkFor(
  db: SupabaseClient<Database>,
  invoice: Invoice,
  payments: () => Promise<readonly Payment[]>,
): Promise<PayLinkResult> {
  if (!isMollieConfigured()) return { kind: "none", reason: "not-configured" };

  try {
    const known = await payments();
    const decision = await invoicePaymentDecision(db, invoice, known);
    if (decision.kind === "none") return decision;
    const result = await invoiceCheckout(db, invoice, known, decision.mode);
    /* A payment running on the previous link is a payment in flight, wherever our records stand. */
    if (!result.ok && result.reason === paymentOnLinkReason) return { kind: "none", reason: "payment-in-flight" };

    return result.ok ? { kind: "link", url: result.checkoutUrl, mode: decision.mode } : { kind: "failed", reason: result.reason };
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
 * Whether there is a button, and whether it is also the mandate, is
 * payLinkFor's decision -- the same one the first mail, the portal and the
 * admin's send get. So a reminder of an invoice that asked for the mandate
 * keeps asking for it, in the same single payment, until the customer gave
 * it; a reminder can never drop it to a one-off payment that settles the
 * invoice and loses the mandate.
 *
 * The link the invoice already has is reused when it still asks the same
 * question for the same amount and is still payable, so a customer who kept
 * the original mail and one who opens the reminder end up at the same place
 * and a second reminder makes nothing new.
 */
export async function reminderPayLink(
  db: SupabaseClient<Database>,
  invoice: Invoice,
  payments: readonly Payment[],
): Promise<{ url: string; mode: InvoicePaymentMode } | undefined> {
  if (!isMollieConfigured()) return undefined;
  /* Settled: Mollie is not even asked. Everything else is payLinkFor's to decide. */
  if (settleInvoice(invoiceAmounts(invoice).dueCents, [...payments]).settled) return undefined;

  /* A failure is reported by payLinkFor as a value, and logged there: it only costs the button; the reminder still goes out. */
  const result = await payLinkFor(db, invoice, async () => payments);
  return result.kind === "link" ? { url: result.url, mode: result.mode } : undefined;
}

/**
 * An open invoice of this customer that a payment can be started for now,
 * if there is one -- the invoice whose payment sets up the mandate. The
 * standalone EUR 0.01 activation is refused while one exists (actions.ts):
 * paying that invoice is how the customer authorises, and a second route
 * beside it would set the mandate up twice. Only issued and sent invoices
 * count; the ledger, not the status column, says what is owed.
 */
export async function openInvoiceForMandate(
  db: SupabaseClient<Database>,
  customerId: string,
): Promise<{ id: string; number: string } | undefined> {
  const { data, error } = await db
    .from("invoices")
    .select(invoiceColumns)
    .eq("customer_id", customerId)
    .in("status", ["sent", "overdue"]);
  if (error) throw new Error(`Openstaande facturen laden: ${error.message}`);

  for (const row of data ?? []) {
    const invoice = invoiceFromRow(row as unknown as InvoiceRow);
    if (!invoice.issuedAt || !invoice.sentAt) continue;
    const settlement = settleInvoice(invoiceAmounts(invoice).dueCents, await paymentsOfInvoice(db, invoice.id));
    if (settlement.settled) continue;
    if (stillCollectedByDirectDebit(await collectedByDirectDebit(db, invoice), settlement)) continue;
    return { id: invoice.id, number: invoice.number.value };
  }
  return undefined;
}

/**
 * Closes the invoice's stored link at Mollie when it can still be paid --
 * after money arrived outside it, by bank transfer. The mailed button would
 * otherwise still take the old amount, and while the customer's mandate is
 * missing that button even says it activates the direct debit: an
 * invitation to pay a paid invoice again. Our row stays, so a payment that
 * did go through on it is still traced to this invoice. The next payment
 * started for what is left makes a fresh link (checkout.ts).
 */
export async function closeInvoicePaymentLink(db: SupabaseClient<Database>, invoiceId: string): Promise<void> {
  if (!isMollieConfigured()) return;
  const stored = await readPaymentLink(db, invoiceId);
  if (!stored) return;
  const config = getMollieConfig();
  const current = await getPaymentLink(stored.storedLink.providerPaymentLinkId, config);
  if (payableLink(current)) await archivePaymentLink(current.id, config);
}
