"use server";

import { revalidatePath } from "next/cache";
import { actionFailed, type ActionResult } from "@/lib/admin/action-result";
import { requireAdmin } from "@/lib/admin/access";
import { resolveCustomerRecipient } from "@/lib/admin/communications/recipient";
import { adminDb } from "@/lib/admin/db";
import { announceRequestOn } from "@/lib/requests/announce";
import { sendRequestStatusMail } from "@/lib/requests/mail";
import { isRequestCategory, isRequestStatus, type RequestStatus } from "@/lib/requests/model";

/**
 * The admin's two moves on a request: its status, and its links to a
 * project and a quote of the same customer. Nothing the customer wrote is
 * editable -- the column grants allow exactly these three columns.
 *
 * A status change is written first; the customer's update mail follows and
 * can only be reported on. A mail that fails leaves the status changed, and
 * the admin is told.
 */
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidate(id: string) {
  revalidatePath("/admin/verzoeken");
  revalidatePath(`/admin/verzoeken/${id}`);
}

export async function setRequestStatus(id: string, next: string): Promise<ActionResult<{ changed: boolean; mail?: { sent: boolean; reason?: string } }>> {
  if (!uuid.test(id)) return { ok: false, error: "Onbekend verzoek." };
  if (!isRequestStatus(next)) return { ok: false, error: "Kies een geldige status." };
  await requireAdmin();
  const db = await adminDb();

  const { data: current, error: readError } = await db.from("customer_requests").select("id, customer_id, subject, category, status").eq("id", id).maybeSingle();
  if (readError) return actionFailed(readError, "Verzoek laden mislukt.");
  if (!current) return { ok: false, error: "Dit verzoek bestaat niet (meer)." };
  if (current.status === next) return { ok: true, value: { changed: false } };

  const { data: updated, error } = await db.from("customer_requests").update({ status: next }).eq("id", id).eq("status", current.status).select("id");
  if (error) return actionFailed(error, "Status opslaan mislukt.");
  if (!updated || updated.length === 0) return { ok: false, error: "De status is intussen gewijzigd. Laad de pagina opnieuw." };
  revalidate(id);

  let mail: { sent: boolean; reason?: string };
  try {
    const recipient = await resolveCustomerRecipient(db, current.customer_id, "general");
    if (!recipient.ok) {
      mail = { sent: false, reason: recipient.reason };
    } else {
      const result = await sendRequestStatusMail({ db, customerId: current.customer_id, category: "request_status_changed" }, recipient.recipient, {
        requestId: id,
        subject: current.subject,
        category: isRequestCategory(current.category) ? current.category : "other",
        status: next as RequestStatus,
      });
      mail = result.sent ? { sent: true } : { sent: false, reason: result.reason };
    }
  } catch (caught) {
    mail = { sent: false, reason: caught instanceof Error ? caught.message : "onbekende fout" };
  }
  return { ok: true, value: { changed: true, mail } };
}

export async function linkRequest(id: string, links: { projectId: string | null; quoteId: string | null }): Promise<ActionResult> {
  if (!uuid.test(id)) return { ok: false, error: "Onbekend verzoek." };
  for (const value of [links.projectId, links.quoteId]) {
    if (value !== null && !uuid.test(value)) return { ok: false, error: "Kies een geldig project of een geldige offerte." };
  }
  await requireAdmin();
  const db = await adminDb();
  const { data, error } = await db.from("customer_requests").update({ project_id: links.projectId, quote_id: links.quoteId }).eq("id", id).select("id");
  if (error) {
    /* The composite keys refuse a project or quote of another customer. */
    if (error.code === "23503") return { ok: false, error: "Dat project of die offerte hoort niet bij de klant van dit verzoek." };
    return actionFailed(error, "Koppeling opslaan mislukt.");
  }
  if (!data || data.length === 0) return { ok: false, error: "Dit verzoek bestaat niet (meer)." };
  revalidate(id);
  return { ok: true };
}

/**
 * "Bevestiging opnieuw versturen": the customer's confirmation of a request
 * whose earlier send failed. Through the same lease as the portal's, so it
 * never sends a second confirmation and never races a send in progress.
 */
export async function retryRequestAnnouncement(id: string): Promise<ActionResult<"sent" | "skipped">> {
  if (!uuid.test(id)) return { ok: false, error: "Onbekend verzoek." };
  await requireAdmin();
  const db = await adminDb();
  const { data, error } = await db.from("customer_requests").select("customer_id").eq("id", id).maybeSingle();
  if (error) return actionFailed(error, "Verzoek laden mislukt.");
  if (!data) return { ok: false, error: "Dit verzoek bestaat niet (meer)." };

  const outcome = await announceRequestOn(db, data.customer_id, id);
  revalidate(id);
  if (outcome.state === "failed") return { ok: false, error: `Versturen mislukt: ${outcome.reason.replace(/\.$/, "")}.` };
  if (outcome.state === "sent" && !outcome.internal.sent) return { ok: false, error: `Interne melding mislukt: ${outcome.internal.reason.replace(/\.$/, "")}.` };
  return { ok: true, value: outcome.state };
}
