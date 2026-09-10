"use server";

import { revalidatePath } from "next/cache";
import { actionFailed, type ActionResult } from "@/lib/admin/action-result";
import { adminDb, orNull } from "@/lib/admin/db";
import { isDateKey } from "@/lib/admin/format";
import { isLeadSource, isLeadStatus } from "@/lib/admin/leads/types";

export type LeadInput = {
  companyName: string;
  contactName: string;
  email?: string;
  phone?: string;
  website?: string;
  source: string;
  status: string;
  notes: string;
  lastContactAt?: string;
  nextFollowUpAt?: string;
};

/** Shared checks; the same rules the form applies, enforced server-side too. */
function validate(input: LeadInput): string | null {
  if (!input.companyName.trim()) return "Vul een bedrijfsnaam in.";
  if (!input.contactName.trim()) return "Vul een contactpersoon in.";
  if (!isLeadSource(input.source)) return "Kies een geldige bron.";
  if (!isLeadStatus(input.status)) return "Kies een geldige status.";
  if (input.lastContactAt && !isDateKey(input.lastContactAt)) return "Laatste contact is geen geldige datum.";
  if (input.nextFollowUpAt && !isDateKey(input.nextFollowUpAt)) return "Volgende opvolging is geen geldige datum.";
  return null;
}

function toRow(input: LeadInput) {
  return {
    company_name: input.companyName.trim(),
    contact_name: input.contactName.trim(),
    email: orNull(input.email),
    phone: orNull(input.phone),
    website: orNull(input.website),
    source: input.source,
    status: input.status,
    notes: input.notes,
    last_contact_at: orNull(input.lastContactAt),
    next_follow_up_at: orNull(input.nextFollowUpAt),
  };
}

export async function createLead(input: LeadInput): Promise<ActionResult<string>> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const db = await adminDb();
  const { data, error } = await db.from("leads").insert(toRow(input)).select("id").single();
  if (error || !data) return actionFailed(error, "Lead aanmaken mislukt.");

  revalidatePath("/admin/leads");
  revalidatePath("/admin");
  return { ok: true, value: data.id };
}

/** Status, notes and follow-up dates of an existing lead. */
export async function updateLeadFollowUp(
  id: string,
  input: Pick<LeadInput, "status" | "notes" | "lastContactAt" | "nextFollowUpAt">,
): Promise<ActionResult> {
  if (!isLeadStatus(input.status)) return { ok: false, error: "Kies een geldige status." };
  if (input.lastContactAt && !isDateKey(input.lastContactAt)) return { ok: false, error: "Laatste contact is geen geldige datum." };
  if (input.nextFollowUpAt && !isDateKey(input.nextFollowUpAt)) return { ok: false, error: "Volgende opvolging is geen geldige datum." };

  const db = await adminDb();
  const { error } = await db
    .from("leads")
    .update({
      status: input.status,
      notes: input.notes,
      last_contact_at: orNull(input.lastContactAt),
      next_follow_up_at: orNull(input.nextFollowUpAt),
    })
    .eq("id", id);

  if (error) return actionFailed(error, "Opslaan mislukt.");

  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${id}`);
  revalidatePath("/admin");
  return { ok: true };
}
