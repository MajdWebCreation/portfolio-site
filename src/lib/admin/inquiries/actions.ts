"use server";

import { revalidatePath } from "next/cache";
import { actionFailed, type ActionResult } from "@/lib/admin/action-result";
import { adminDb, orNull } from "@/lib/admin/db";
import { validateInquiryHandling, type InquiryHandlingInput } from "@/lib/admin/inquiries/handling";

/**
 * Handling of an inquiry: the lifecycle status with what belongs to it (a
 * reason when lost, the current business values when a quote was sent or
 * the deal was won), the service it is about, and the internal note. The
 * rest of an inquiry is what the website sent and is never edited here.
 *
 * One update, so the database trigger that logs the change sees the status
 * and the values together and writes them onto the same event row. The
 * rules (a lost status needs a reason, values are whole cents) are checked
 * here first and enforced by the database again.
 *
 * `adminDb()` checks the session and the admin row before the query is sent;
 * row level security checks again on the server.
 */
export async function saveInquiryHandling(id: string, input: InquiryHandlingInput): Promise<ActionResult> {
  const checked = validateInquiryHandling(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  const { value } = checked;

  const db = await adminDb();
  const { error } = await db
    .from("inquiries")
    .update({
      status: value.status,
      lost_reason: value.lostReason ?? null,
      service_interest: value.serviceInterest ?? null,
      quoted_value_cents: value.quotedValueCents ?? null,
      won_value_cents: value.wonValueCents ?? null,
      recurring_monthly_cents: value.recurringMonthlyCents ?? null,
      internal_note: orNull(value.internalNote),
    })
    .eq("id", id);

  if (error) return actionFailed(error, "Opslaan mislukt.");

  revalidatePath("/admin/aanvragen");
  revalidatePath(`/admin/aanvragen/${id}`);
  revalidatePath("/admin");
  return { ok: true };
}
