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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    return "Dit is geen geldig e-mailadres; offertes en facturen gaan er naartoe.";
  }
  if (!input.street.trim() || !input.postalCode.trim() || !input.city.trim()) {
    return "Vul het volledige adres in; offertes en facturen gebruiken het.";
  }
  if (input.status !== "active" && input.status !== "inactive") return "Kies een geldige status.";
  return null;
}

function toRow(input: CustomerInput) {
  return {
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
  };
}

/**
 * A customer entered by hand.
 *
 * Not every customer starts on the website: some come from a phone call, a
 * referral or a meeting, and there is no inquiry or lead to convert. Such a
 * customer carries no `source_inquiry_id` and no `source_lead_id`, and that
 * empty pair is the whole record of where it came from -- inventing a source
 * would say more than is known.
 *
 * The same checks as the edit form apply, so a hand-made customer is as
 * complete as a converted one and can be invoiced straight away.
 */
export async function createCustomer(input: CustomerInput): Promise<ActionResult<string>> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const db = await adminDb();
  const { data, error } = await db.from("customers").insert(toRow(input)).select("id").single();

  if (error || !data) return actionFailed(error, "Klant aanmaken mislukt.");

  revalidatePath("/admin/klanten");
  revalidatePath("/admin");
  return { ok: true, value: data.id };
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
  const { error } = await db.from("customers").update(toRow(input)).eq("id", id);

  if (error) return actionFailed(error, "Opslaan mislukt.");

  revalidatePath("/admin/klanten");
  revalidatePath(`/admin/klanten/${id}`);
  return { ok: true };
}
