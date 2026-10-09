"use server";

import { revalidatePath } from "next/cache";
import { actionFailed, type ActionResult } from "@/lib/admin/action-result";
import { resolveCustomerRecipient } from "@/lib/admin/communications/recipient";
import { adminDb } from "@/lib/admin/db";
import { documentIncompleteReason } from "@/lib/admin/documents/validation";
import { issueInvoiceDocument } from "@/lib/admin/invoices/issue";
import { getInvoice } from "@/lib/admin/invoices/repository";

/**
 * Making an invoice definitive.
 *
 * The step this administration used to skip. Sending used to do everything at
 * once -- number, payment reference, PDF, mail -- which meant the admin could
 * never see the document before it left: the preview still said
 * FAC-CONCEPT-… while the mail would carry YM-F-2026-000001.
 *
 * Now the document is made first and sent second, and "the document" is a
 * file: the PDF is rendered once here, stored, and from then on only read
 * back. What the admin opens in the preview is what the customer receives,
 * because it is the same file -- not the same data rendered twice.
 *
 * The two-step dance with storage lives in `issueInvoiceDocument`; this is
 * the admin's half of it: who may, when, and with which note frozen in.
 *
 * What this step deliberately does not do:
 *
 *   - no mail, so no customer communication is logged: making a document is
 *     not talking to anyone;
 *   - no Mollie call of any kind. The pay-by-link belongs to the mail that
 *     carries its button, and an invoice that is never sent should never have
 *     produced a payment page.
 *
 * Refusing is cheap and a wrong number is not: the number comes out of a
 * yearly sequence that never hands the same one out twice, so an invoice that
 * should not have been issued leaves a gap that has to be explained. Hence
 * the same completeness check the send flow applies, before the counter is
 * touched.
 */

export async function finalizeInvoice(id: string): Promise<ActionResult<string>> {
  const db = await adminDb();

  const invoice = await getInvoice(id);
  if (!invoice) return { ok: false, error: "Deze factuur bestaat niet (meer)." };

  // Already a document: say so with the number it has, rather than pretending
  // something happened. A second click is not an error, and never a second
  // number or a second file.
  if (invoice.issuedAt && invoice.document) return { ok: true, value: invoice.number.value };

  if (invoice.status === "cancelled") {
    return { ok: false, error: "Een geannuleerde factuur wordt niet definitief gemaakt." };
  }

  /*
    Only a concept is checked. An invoice whose finalization did not finish
    is already numbered and frozen, and there is nothing left to validate --
    running the check again could only refuse a document that has to be
    completed, which would strand it.
  */
  if (!invoice.finalizingAt) {
    const incomplete = documentIncompleteReason(invoice);
    if (incomplete) return { ok: false, error: incomplete };

    // An invoice nobody can be sent is not issued: the number would sit
    // unused. Asked of the customer as they are now, the same question the
    // send flow asks -- not of the address this concept copied.
    const addressed = await resolveCustomerRecipient(db, invoice.customer.customerId);
    if (!addressed.ok) return { ok: false, error: addressed.reason };
  }

  /*
    A new document never carries a direct debit note: paying an invoice no
    longer authorises anything, so there is nothing to promise. Only a
    finalization that was interrupted completes with what it already froze.
  */
  const activation = invoice.finalizingAt ? invoice.activationNote : undefined;

  const issued = await issueInvoiceDocument(db, id, activation);
  if (!issued.ok) return { ok: false, error: issued.error };

  revalidatePath("/admin/facturen");
  revalidatePath(`/admin/facturen/${id}`);
  revalidatePath("/admin");
  return { ok: true, value: issued.number };
}

/**
 * Withdrawing an invoice that was made definitive and then should not go out.
 *
 * The number stays used. It was taken from a sequence that hands each one out
 * once, and a gap in that sequence is an ordinary thing an administration can
 * explain -- a number quietly handed to a second document is not. So the
 * invoice keeps its number, keeps its figures, keeps existing, and says what
 * it is: cancelled.
 *
 * The stored PDF stays too, for the same reason: it is the document that
 * number was given to, and deleting it would leave a cancelled invoice whose
 * own file cannot be shown.
 *
 * No credit note is made here. A credit note answers an invoice the customer
 * received; one that never left needs nothing more than this. An invoice that
 * did go out is refused for exactly that reason.
 */
export async function cancelInvoice(id: string): Promise<ActionResult<string>> {
  const db = await adminDb();

  const invoice = await getInvoice(id);
  if (!invoice) return { ok: false, error: "Deze factuur bestaat niet (meer)." };
  if (invoice.status === "cancelled") return { ok: true, value: invoice.number.value };

  if (invoice.sentAt) {
    return {
      ok: false,
      error: `Factuur ${invoice.number.value} is al verstuurd en kan niet worden geannuleerd. Corrigeren kan alleen met een creditfactuur.`,
    };
  }

  const { error } = await db.from("invoices").update({ status: "cancelled" }).eq("id", id);
  if (error) return actionFailed(error, "De factuur kon niet worden geannuleerd.");

  revalidatePath("/admin/facturen");
  revalidatePath(`/admin/facturen/${id}`);
  revalidatePath("/admin");
  return { ok: true, value: invoice.number.value };
}
