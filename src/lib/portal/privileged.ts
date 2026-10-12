import { toDateKey } from "@/lib/admin/format";
import { invoiceColumns, invoiceFromRow, type InvoiceRow } from "@/lib/admin/invoices/mapper";
import type { Invoice } from "@/lib/admin/invoices/types";
import { paymentsAdminClient } from "@/lib/payments/admin-client";
import { isChargeable } from "@/lib/payments/customer-status";
import {
  alreadyActiveReason,
  paidUnprocessedReason,
  pendingReason,
  requestMandateActivation,
} from "@/lib/payments/mandate-activation";
import { invoiceAmounts } from "@/lib/admin/invoices/types";
import { alreadyPaidReason, nothingDueReason } from "@/lib/payments/checkout";
import { payLinkFor } from "@/lib/payments/pay-link";
import { paymentsOfInvoice } from "@/lib/payments/repository";
import { settleInvoice } from "@/lib/payments/settlement";
import { portalInvoiceView } from "@/lib/portal/invoices/model";
import { readPortalInvoice } from "@/lib/portal/invoices/read";
import { invoicePaymentBlock, mayActivateDirectDebit } from "@/lib/portal/payments/model";
import { readPortalPaymentContext } from "@/lib/portal/payments/read";
import { readPortalServices } from "@/lib/portal/services/read";

/**
 * The portal's door to elevated rights for money. (The other portal module
 * on the system client is account-lookup.ts, which only asks whether an
 * address has a portal account.)
 *
 * Paying an invoice and activating direct debit write to tables a member
 * has no rights on (payment links, activations) and talk to Mollie, so they
 * run on the system client. That client is made here and nowhere else in
 * the portal, is never handed out, and is reached only after the member's
 * own session proved -- through the portal functions, checked again by the
 * database -- that the customer is theirs AND that the specific invoice or
 * the direct debit context belongs to that customer and allows the action.
 * Membership of some customer is never enough by itself.
 *
 * What runs on the system client is the administration's own logic,
 * unchanged: the invoice's payment link (payLinkFor -> checkout.ts) and the
 * EUR 0.01 activation link (requestMandateActivation). No amount is
 * computed here; both decide from the records, as they do for the admin.
 *
 * Callers pass the identity requirePortalMember() returned; every decision
 * below is made again from the database rather than taken from them.
 */
if (typeof window !== "undefined") throw new Error("The portal's payment boundary is server-only.");

export type PortalActor = { userId: string; customerId: string };

export type PortalActionResult = { ok: true; url: string } | { ok: false; reason: PortalActionRefusal };

export type PortalActionRefusal =
  | "not_found"
  | "nothing_due"
  | "payment_in_progress"
  | "direct_debit"
  | "unavailable"
  | "already_active"
  | "awaiting_confirmation"
  | "processing"
  | "not_needed"
  | "failed";

type Db = ReturnType<typeof paymentsAdminClient>;

async function record(db: Db, actor: PortalActor, action: "invoice_payment_started" | "mandate_activation_requested", target: { kind: "invoice" | "customer"; id: string }) {
  /* The audit trail of an action that already happened: a failure here is reported, not turned into a failed payment. */
  const { error } = await db.from("portal_events").insert({
    actor_user_id: actor.userId,
    customer_id: actor.customerId,
    action,
    target_kind: target.kind,
    target_id: target.id,
  });
  if (error) console.error("Portal event could not be recorded", { action, customerId: actor.customerId, code: error.code });
}

/**
 * The invoice as the administration holds it, bound to the customer the
 * member's session was proven for. A row of another customer cannot come
 * back, whatever id was asked.
 */
async function ownInvoice(db: Db, actor: PortalActor, invoiceId: string): Promise<Invoice | undefined> {
  const { data, error } = await db.from("invoices").select(invoiceColumns).eq("id", invoiceId).eq("customer_id", actor.customerId).maybeSingle();
  if (error) throw new Error(`Factuur laden: ${error.message}`);
  return data ? invoiceFromRow(data as unknown as InvoiceRow) : undefined;
}

/**
 * "Betalen": the invoice's payment link, the one the mails carry.
 *
 * 1. The member's session reads the invoice through portal_invoice: it has
 *    to be this customer's, visible (sent, definitive), and the ledger has
 *    to leave something open on it. portal_payment_context says whether a
 *    direct debit collects it. A refusal here never reaches Mollie.
 * 2. Only then the system client, bound to the same customer, loads the
 *    invoice and its payments and asks payLinkFor -- which checks direct
 *    debit and what is outstanding again, reuses the payable link for the
 *    same amount or makes the one link for it.
 */
export async function startInvoicePayment(actor: PortalActor, invoiceId: string): Promise<PortalActionResult> {
  const todayKey = toDateKey(new Date());
  const [invoice, context] = await Promise.all([readPortalInvoice(actor.customerId, invoiceId), readPortalPaymentContext(actor.customerId)]);
  const block = invoicePaymentBlock(portalInvoiceView(invoice, todayKey), context);
  if (block) return { ok: false, reason: block };

  const db = paymentsAdminClient();
  const own = await ownInvoice(db, actor, invoice.id);
  /* The two reads disagree only if something changed in between; the stricter answer wins. */
  if (!own || !own.issuedAt || !own.sentAt || !isChargeable(own) || own.status === "paid") return { ok: false, reason: "not_found" };

  /*
    A payment that is still running -- a bank transfer, a pending iDEAL --
    is not shown as paid yet, and a second click would let the same debt be
    paid twice through the same link. Asked of the records the admin's
    settlement reads; the button comes back once that attempt ends.
  */
  const payments = await paymentsOfInvoice(db, own.id);
  if (settleInvoice(invoiceAmounts(own).dueCents, payments).inFlight) return { ok: false, reason: "payment_in_progress" };

  const result = await payLinkFor(db, own, async () => payments);
  if (result.kind === "none") return { ok: false, reason: result.reason === "direct-debit" ? "direct_debit" : "unavailable" };
  if (result.kind === "failed") {
    /* Paid in the moment between the member's read and this one: nothing left to do, not a failure. */
    if (result.reason === alreadyPaidReason || result.reason === nothingDueReason) return { ok: false, reason: "nothing_due" };
    console.error("Portal payment link failed", { invoiceId: own.id, reason: result.reason });
    return { ok: false, reason: "failed" };
  }

  await record(db, actor, "invoice_payment_started", { kind: "invoice", id: own.id });
  return { ok: true, url: result.url };
}

/**
 * "Automatische incasso activeren": the customer's EUR 0.01 activation link.
 *
 * The member's session first reads the customer's direct debit status and
 * services: the mandate must be neither valid nor on its way, and a service
 * of this customer has to be waiting for it. Then requestMandateActivation
 * runs exactly as it does for the admin -- it asks Mollie about the mandate
 * itself, reuses the open link, and lets the database's one-open-link rule
 * settle two clicks at once. It touches no invoice, no payment and no
 * service: the cent buys a mandate, nothing else.
 */
export async function startMandateActivation(actor: PortalActor): Promise<PortalActionResult> {
  const todayKey = toDateKey(new Date());
  const [context, services] = await Promise.all([readPortalPaymentContext(actor.customerId), readPortalServices(actor.customerId)]);
  if (context.directDebit === "active") return { ok: false, reason: "already_active" };
  if (context.directDebit === "mandate_pending") return { ok: false, reason: "awaiting_confirmation" };
  if (!mayActivateDirectDebit(context.directDebit, services, todayKey)) return { ok: false, reason: "not_needed" };

  const db = paymentsAdminClient();
  const result = await requestMandateActivation(db, actor.customerId);
  if (!result.ok) {
    if (result.reason === alreadyActiveReason) return { ok: false, reason: "already_active" };
    if (result.reason === pendingReason) return { ok: false, reason: "awaiting_confirmation" };
    if (result.reason === paidUnprocessedReason) return { ok: false, reason: "processing" };
    console.error("Portal mandate activation refused", { customerId: actor.customerId, reason: result.reason });
    return { ok: false, reason: result.reason === "Mollie is niet geconfigureerd." ? "unavailable" : "failed" };
  }

  await record(db, actor, "mandate_activation_requested", { kind: "customer", id: actor.customerId });
  return { ok: true, url: result.activation.checkoutUrl };
}
