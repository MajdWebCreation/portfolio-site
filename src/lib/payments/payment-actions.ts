"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/access";
import { actionFailed, type ActionResult } from "@/lib/admin/action-result";
import { adminDb } from "@/lib/admin/db";
import { isDateKey, toDateKey } from "@/lib/admin/format";
import { getInvoice } from "@/lib/admin/invoices/repository";
import { invoiceAmounts } from "@/lib/admin/invoices/types";
import { listPaymentsForInvoice } from "@/lib/payments/repository";
import { settleInvoice } from "@/lib/payments/settlement";
import { nextInvoiceStatus } from "@/lib/payments/webhook";

/**
 * "Betaling registreren": a bank transfer the customer made, written down
 * by hand. The same row shape as a Mollie payment with `source` saying where
 * it came from, so settlement, the customer's balance and the reminder
 * ladder count it exactly as they count money Mollie reported.
 *
 * Only for an invoice the customer received: a concept has not been
 * charged, and money against a cancelled invoice is a refund waiting to
 * happen, not a payment.
 */
export async function recordManualPayment(
  invoiceId: string,
  input: { amountCents: number; paidOn: string; note: string },
): Promise<ActionResult<{ status: string }>> {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) return { ok: false, error: "Vul een bedrag hoger dan nul in." };
  if (!isDateKey(input.paidOn)) return { ok: false, error: "De betaaldatum is geen geldige datum." };

  const invoice = await getInvoice(invoiceId);
  if (!invoice) return { ok: false, error: "Deze factuur bestaat niet (meer)." };
  if (!invoice.sentAt) return { ok: false, error: "Deze factuur is nog niet verstuurd; er valt nog geen betaling op te registreren." };
  if (invoice.status === "cancelled") return { ok: false, error: "Een geannuleerde factuur ontvangt geen betaling." };

  const { dueCents } = invoiceAmounts(invoice);
  const existing = await listPaymentsForInvoice(invoiceId);
  const before = settleInvoice(dueCents, existing);
  if (input.amountCents > before.outstandingCents) {
    return {
      ok: false,
      error: `Op deze factuur staat nog ${(before.outstandingCents / 100).toFixed(2).replace(".", ",")} euro open; een hoger bedrag registreer je niet als betaling.`,
    };
  }

  await requireAdmin();
  const db = await adminDb();
  const todayKey = toDateKey(new Date());
  const { error } = await db.from("payments").insert({
    invoice_id: invoiceId,
    customer_id: invoice.customer.customerId,
    amount_cents: input.amountCents,
    currency: "EUR",
    status: "paid",
    source: "manual_bank_transfer",
    method: "banktransfer",
    paid_at: `${input.paidOn}T12:00:00+02:00`,
    description: input.note.trim() || `Bankoverschrijving voor ${invoice.number.value}`,
  });
  if (error) return actionFailed(error, "Betaling registreren mislukt.");

  const after = settleInvoice(dueCents, await listPaymentsForInvoice(invoiceId));
  const status = nextInvoiceStatus(invoice, after.settled, todayKey);
  if (status !== invoice.status) {
    const { error: statusError } = await db.from("invoices").update({ status }).eq("id", invoiceId);
    if (statusError) return actionFailed(statusError, "De betaling is vastgelegd, maar de factuurstatus kon niet worden bijgewerkt.");
  }

  revalidatePath(`/admin/facturen/${invoiceId}`);
  revalidatePath("/admin/betalingen");
  revalidatePath(`/admin/klanten/${invoice.customer.customerId}`);
  return { ok: true, value: { status } };
}
