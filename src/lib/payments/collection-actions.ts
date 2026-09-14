"use server";

import { revalidatePath } from "next/cache";
import { actionFailed, referenceFailed, type ActionResult } from "@/lib/admin/action-result";
import { adminDb } from "@/lib/admin/db";
import { isCollectionState } from "@/lib/payments/collection-state";

/**
 * Changing what happens to an invoice that is not being paid.
 *
 * The only writable part of the whole reminder system. Everything else --
 * which reminders went out, how far along an invoice is, whether it is ready
 * to hand over -- is either an event the job wrote or a conclusion drawn from
 * the invoice itself, and neither is something an admin edits.
 *
 * One row per invoice, so pressing "pause" twice is the same as pressing it
 * once. `active` deletes the row rather than storing the default: an invoice
 * nobody has touched and an invoice someone resumed are the same situation,
 * and keeping two ways to say it would eventually make them disagree.
 */
export async function setInvoiceCollectionState(
  invoiceId: string,
  state: string,
  note = "",
): Promise<ActionResult> {
  if (!isCollectionState(state)) return { ok: false, error: "Onbekende opvolgstatus." };

  const db = await adminDb();

  if (state === "active" && !note.trim()) {
    const { error } = await db.from("invoice_collections").delete().eq("invoice_id", invoiceId);
    if (error) return actionFailed(error, "Opvolging hervatten mislukt.");
  } else {
    const { error } = await db
      .from("invoice_collections")
      .upsert({ invoice_id: invoiceId, state, note: note.trim() }, { onConflict: "invoice_id" });
    if (error) {
      return referenceFailed(error, "Deze factuur bestaat niet (meer).", "Opvolging bijwerken mislukt.");
    }
  }

  revalidatePath(`/admin/facturen/${invoiceId}`);
  revalidatePath("/admin/betalingen");
  revalidatePath("/admin");
  return { ok: true };
}
