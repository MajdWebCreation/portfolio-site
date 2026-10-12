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
import { readPortalRequest } from "@/lib/portal/requests/read";
import { portalReader, portalResult, requireResourceId } from "@/lib/portal/rpc";
import { notifyQuoteDecisionOn, type NotifyOutcome } from "@/lib/quotes/decision-notify";
import { announceRequestOn, type AnnounceOutcome } from "@/lib/requests/announce";
import { attachmentRules, bytesMatchMime, type AttachmentMime } from "@/lib/requests/model";

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

/**
 * The announcement of a request this member's customer owns: the customer's
 * confirmation and, the first time, YM Creations' own notice. Runs on the
 * system client because the member has no write on the request; the lease
 * and the bookkeeping are in announceRequestOn. Nothing here can undo the
 * request: a failed mail only leaves it unannounced, for the next retry.
 */
export async function announceRequest(actor: PortalActor, requestId: string): Promise<AnnounceOutcome> {
  return announceRequestOn(paymentsAdminClient(), actor.customerId, requestId);
}

/**
 * The mails of a decision this member's customer just made on a quote: the
 * customer's confirmation and YM Creations' notice. Runs on the system
 * client because the member has no write on the notification row; the
 * lease and the bookkeeping are in notifyQuoteDecisionOn, and the row is
 * claimed only together with the member's own customer. The decision is on
 * record before this runs and nothing here can touch it: a failed mail only
 * leaves the notification unmarked, for the next retry.
 */
export async function notifyQuoteDecision(actor: PortalActor, decisionId: string): Promise<NotifyOutcome> {
  return notifyQuoteDecisionOn(paymentsAdminClient(), actor.customerId, requireResourceId(decisionId));
}

const requestBucket = "request-attachments";

export type RequestUploadResult =
  | { ok: true; attachment: { id: string; fileName: string; mimeType: string; bytes: number } }
  | { ok: false; reason: "denied" | "content" | "size" | "type" | "limit" | "closed" | "failed" };

/**
 * A file the member just stored becomes an attachment of their request.
 *
 * The member's own session proves first, through portal_request, that the
 * request is this customer's; the path has to be that request's own. Only
 * then the system client reads the object -- members cannot read the bucket
 * at all, so no member can sign a URL that outlives their access -- checks
 * its first bytes against the type, and registers it through
 * service_register_request_attachment, which checks the member's membership
 * again under a lock on the request. An object that does not make it is
 * removed; one that cannot be, the daily retention pass removes.
 */
export async function registerRequestUpload(
  actor: PortalActor,
  input: { requestId: string; storagePath: string; fileName: string; mimeType: AttachmentMime },
): Promise<RequestUploadResult> {
  await readPortalRequest(actor.customerId, input.requestId);
  if (!input.storagePath.startsWith(`${actor.customerId}/${input.requestId}/`)) return { ok: false, reason: "failed" };

  const db = paymentsAdminClient();
  /* A refused upload is given up -- its slot takes nothing more -- and removed, unless a registration of the same path got there first. */
  const discard = async (): Promise<"removed" | "registered" | "unknown"> => {
    const { data: removable, error: releaseError } = await db.rpc("service_release_request_upload", { p_customer_id: actor.customerId, p_storage_path: input.storagePath });
    if (releaseError) return "unknown";
    if (!removable) return "registered";
    const { error } = await db.storage.from(requestBucket).remove([input.storagePath]);
    if (error) console.error("Unregistered upload could not be removed", { requestId: input.requestId });
    return "removed";
  };

  const { data: file, error: readError } = await db.storage.from(requestBucket).download(input.storagePath);
  if (readError || !file) return { ok: false, reason: "failed" };
  if (file.size > attachmentRules.maxBytes) {
    await discard();
    return { ok: false, reason: "size" };
  }
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  if (!bytesMatchMime(head, input.mimeType)) {
    await discard();
    return { ok: false, reason: "content" };
  }

  const { data, error } = await db.rpc("service_register_request_attachment", {
    p_user_id: actor.userId,
    p_customer_id: actor.customerId,
    p_request_id: input.requestId,
    p_storage_path: input.storagePath,
    p_file_name: input.fileName,
    p_mime_type: input.mimeType,
  });
  if (error) {
    /* A registration that went through while its answer was lost: the attachment stands, and saying so keeps the browser from uploading it twice. */
    if ((await discard()) === "registered" && error.code !== "42501") {
      const { data: stored } = await db.from("customer_request_attachments").select("id, file_name").eq("storage_path", input.storagePath).eq("request_id", input.requestId).maybeSingle();
      if (stored) return { ok: true, attachment: { id: stored.id, fileName: stored.file_name, mimeType: input.mimeType, bytes: file.size } };
    }
    if (error.code === "42501") return { ok: false, reason: "denied" };
    const reason = error.message.replace("invalid:", "");
    if (reason === "limit" || reason === "closed" || reason === "type" || reason === "size") return { ok: false, reason };
    console.error("Attachment registration failed", { requestId: input.requestId, code: error.code });
    return { ok: false, reason: "failed" };
  }
  const row = data?.[0];
  if (!row) return { ok: false, reason: "failed" };
  const { data: stored } = await db.from("customer_request_attachments").select("file_name").eq("id", row.attachment_id).maybeSingle();
  return { ok: true, attachment: { id: row.attachment_id, fileName: stored?.file_name ?? input.fileName, mimeType: input.mimeType, bytes: file.size } };
}

/**
 * The bytes of one registered attachment, for the download route: the
 * member's session proves through portal_request_attachment that it is this
 * customer's and where it is; the system client then reads exactly that
 * object. Throws PortalDenied for anything else.
 */
export async function readRequestAttachment(actor: Pick<PortalActor, "customerId">, attachmentId: string): Promise<{ fileName: string; mimeType: string; bytes: ArrayBuffer }> {
  const db = await portalReader();
  const rows = portalResult(
    "Bijlage laden",
    await db.rpc("portal_request_attachment", { p_customer_id: actor.customerId, p_attachment_id: requireResourceId(attachmentId) }),
  );
  const row = rows[0];
  if (!row) throw new Error("Bijlage laden: geen antwoord");
  const { data, error } = await paymentsAdminClient().storage.from(requestBucket).download(row.storage_path);
  if (error || !data) throw new Error(`Bijlage laden: ${error?.message ?? "geen bestand"}`);
  return { fileName: row.file_name, mimeType: row.mime_type, bytes: await data.arrayBuffer() };
}
