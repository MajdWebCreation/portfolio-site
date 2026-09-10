"use server";

import { revalidatePath } from "next/cache";
import { actionFailed, type ActionResult } from "@/lib/admin/action-result";
import { adminDb, orNull } from "@/lib/admin/db";
import { isInquiryStatus } from "@/lib/admin/inquiries/types";

/**
 * Handling of an inquiry: the status and the internal note. The rest of an
 * inquiry is what the website sent and is never edited here.
 *
 * `adminDb()` checks the session and the admin row before the query is sent;
 * row level security checks again on the server.
 */
export async function saveInquiryHandling(
  id: string,
  input: { status: string; internalNote: string },
): Promise<ActionResult> {
  if (!isInquiryStatus(input.status)) {
    return { ok: false, error: "Onbekende status." };
  }

  const db = await adminDb();
  const { error } = await db
    .from("inquiries")
    .update({ status: input.status, internal_note: orNull(input.internalNote) })
    .eq("id", id);

  if (error) return actionFailed(error, "Opslaan mislukt.");

  revalidatePath("/admin/aanvragen");
  revalidatePath(`/admin/aanvragen/${id}`);
  revalidatePath("/admin");
  return { ok: true };
}
