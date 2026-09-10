"use server";

import { revalidatePath } from "next/cache";
import { actionFailed, type ActionResult } from "@/lib/admin/action-result";
import { adminDb, orNull } from "@/lib/admin/db";

export type CustomerInput = {
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  kvkNumber?: string;
  vatNumber?: string;
  notes: string;
  status: string;
};

function validate(input: CustomerInput): string | null {
  if (!input.companyName.trim()) return "Vul een bedrijfsnaam in.";
  if (!input.contactName.trim()) return "Vul een contactpersoon in.";
  if (!input.email.trim()) return "Vul een e-mailadres in.";
  if (!input.street.trim() || !input.postalCode.trim() || !input.city.trim()) {
    return "Vul het volledige adres in; offertes en facturen gebruiken het.";
  }
  if (input.status !== "active" && input.status !== "inactive") return "Kies een geldige status.";
  return null;
}

/**
 * Updates a customer. The address is deliberately required: a quote or
 * invoice snapshots it, and a document without an address is not a document.
 * Existing documents keep the snapshot they were made with.
 */
export async function updateCustomer(id: string, input: CustomerInput): Promise<ActionResult> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const db = await adminDb();
  const { error } = await db
    .from("customers")
    .update({
      company_name: input.companyName.trim(),
      contact_name: input.contactName.trim(),
      email: input.email.trim(),
      phone: orNull(input.phone),
      street: input.street.trim(),
      postal_code: input.postalCode.trim(),
      city: input.city.trim(),
      country: input.country.trim() || "Nederland",
      kvk_number: orNull(input.kvkNumber),
      vat_number: orNull(input.vatNumber),
      notes: input.notes,
      status: input.status,
    })
    .eq("id", id);

  if (error) return actionFailed(error, "Opslaan mislukt.");

  revalidatePath("/admin/klanten");
  revalidatePath(`/admin/klanten/${id}`);
  return { ok: true };
}
