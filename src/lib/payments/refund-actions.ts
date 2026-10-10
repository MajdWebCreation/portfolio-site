"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/access";
import type { ActionResult } from "@/lib/admin/action-result";
import { getCreditNote } from "@/lib/admin/credit-notes/repository";
import type { Refund } from "@/lib/admin/credit-notes/types";
import { adminDb } from "@/lib/admin/db";
import { isDateKey } from "@/lib/admin/format";
import { markManualRefund, refreshRefund, refundViaMollie } from "@/lib/payments/refunds";

/**
 * The three refund buttons. Each is a deliberate admin action on the credit
 * note's page and nothing else triggers them; the rules live in refunds.ts.
 */
export type RefundActionOutcome = { refund: Refund; warning?: string };

async function revalidateFor(creditNoteId: string): Promise<void> {
  const note = await getCreditNote(creditNoteId);
  revalidatePath("/admin/betalingen");
  revalidatePath(`/admin/betalingen/creditnotas/${creditNoteId}`);
  if (note) {
    revalidatePath(`/admin/facturen/${note.invoiceId}`);
    revalidatePath(`/admin/klanten/${note.customer.customerId}`);
  }
}

function failure(error: unknown, fallback: string): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : fallback };
}

/** "€ X terugbetalen via Mollie". */
export async function refundCreditNoteViaMollie(creditNoteId: string, amountCents: number): Promise<ActionResult<RefundActionOutcome>> {
  try {
    const admin = await requireAdmin();
    const db = await adminDb();
    const result = await refundViaMollie(db, creditNoteId, amountCents, { userId: admin.userId });
    await revalidateFor(creditNoteId);
    if (!result.ok) return { ok: false, error: result.reason };
    return { ok: true, value: { refund: result.refund, ...(result.warning ? { warning: result.warning } : {}) } };
  } catch (error) {
    console.error("Could not refund via Mollie", { creditNoteId, error });
    return failure(error, "De terugbetaling via Mollie is niet gelukt.");
  }
}

/** "Handmatig terugbetaald markeren". */
export async function markCreditNoteRefundedManually(
  creditNoteId: string,
  input: { amountCents: number; settledOn: string; note: string },
): Promise<ActionResult<RefundActionOutcome>> {
  if (!isDateKey(input.settledOn)) return { ok: false, error: "De datum is geen geldige datum." };
  try {
    const admin = await requireAdmin();
    const db = await adminDb();
    const result = await markManualRefund(db, creditNoteId, input, { userId: admin.userId });
    await revalidateFor(creditNoteId);
    if (!result.ok) return { ok: false, error: result.reason };
    return { ok: true, value: { refund: result.refund } };
  } catch (error) {
    console.error("Could not record a manual refund", { creditNoteId, error });
    return failure(error, "De terugbetaling kon niet worden vastgelegd.");
  }
}

/** "Status controleren" on one refund. */
export async function refreshRefundStatus(creditNoteId: string, refundId: string): Promise<ActionResult<RefundActionOutcome>> {
  try {
    const db = await adminDb();
    const result = await refreshRefund(db, refundId);
    await revalidateFor(creditNoteId);
    if (!result.ok) return { ok: false, error: result.reason };
    return { ok: true, value: { refund: result.refund } };
  } catch (error) {
    console.error("Could not refresh a refund", { refundId, error });
    return failure(error, "De status kon niet worden opgehaald.");
  }
}
