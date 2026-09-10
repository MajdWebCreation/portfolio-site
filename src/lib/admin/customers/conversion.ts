"use server";

import { revalidatePath } from "next/cache";
import { actionFailed, type ActionResult } from "@/lib/admin/action-result";
import { adminDb, orNull } from "@/lib/admin/db";

/**
 * Turning an inquiry or a lead into a customer.
 *
 * Only what the source actually holds is copied. A customer needs an address
 * for its documents, and neither an inquiry nor a lead has one, so those
 * fields are created empty and the admin completes them on the customer page.
 * Nothing is guessed: no invented street, no invented VAT number.
 *
 * Running twice cannot produce two customers. The check below catches the
 * ordinary case; a unique index on `source_inquiry_id` and `source_lead_id`
 * catches the race, and the 23505 that raises is resolved into the customer
 * that already exists. Either way the admin ends up on the same record.
 */
type Conversion = ActionResult<{ customerId: string; created: boolean }>;

/** Duplicate insert (23505) resolved into the customer that won the race. */
async function existingFor(
  db: Awaited<ReturnType<typeof adminDb>>,
  column: "source_inquiry_id" | "source_lead_id",
  sourceId: string,
): Promise<string | null> {
  const { data } = await db.from("customers").select("id").eq(column, sourceId).maybeSingle();
  return data?.id ?? null;
}

export async function createCustomerFromInquiry(inquiryId: string): Promise<Conversion> {
  const db = await adminDb();

  const already = await existingFor(db, "source_inquiry_id", inquiryId);
  if (already) return { ok: true, value: { customerId: already, created: false } };

  const { data: inquiry, error: readError } = await db
    .from("inquiries")
    .select("id, name, email, company, phone")
    .eq("id", inquiryId)
    .maybeSingle();

  if (readError) return actionFailed(readError, "Aanvraag laden mislukt.");
  if (!inquiry) return { ok: false, error: "Deze aanvraag bestaat niet (meer)." };

  const { data: created, error } = await db
    .from("customers")
    .insert({
      // A one-person business fills in its own name; that is the only company
      // name the request carries, and it is not an invention.
      company_name: (inquiry.company ?? inquiry.name).trim(),
      contact_name: inquiry.name.trim(),
      email: inquiry.email.trim(),
      phone: orNull(inquiry.phone ?? undefined),
      street: "",
      postal_code: "",
      city: "",
      country: "Nederland",
      notes: "",
      status: "active",
      source_inquiry_id: inquiryId,
    })
    .select("id")
    .single();

  if (error || !created) {
    if (error?.code === "23505") {
      const raced = await existingFor(db, "source_inquiry_id", inquiryId);
      if (raced) return { ok: true, value: { customerId: raced, created: false } };
    }
    return actionFailed(error, "Klant aanmaken mislukt.");
  }

  // The inquiry became a customer, which is what "gekwalificeerd" means in
  // the existing status flow. A failure here does not undo the customer; the
  // status can be set by hand and the link is already there.
  await db.from("inquiries").update({ status: "qualified" }).eq("id", inquiryId);

  revalidatePath("/admin/aanvragen");
  revalidatePath(`/admin/aanvragen/${inquiryId}`);
  revalidatePath("/admin/klanten");
  revalidatePath("/admin");
  return { ok: true, value: { customerId: created.id, created: true } };
}

export async function createCustomerFromLead(leadId: string): Promise<Conversion> {
  const db = await adminDb();

  const already = await existingFor(db, "source_lead_id", leadId);
  if (already) return { ok: true, value: { customerId: already, created: false } };

  const { data: lead, error: readError } = await db
    .from("leads")
    .select("id, company_name, contact_name, email, phone, notes")
    .eq("id", leadId)
    .maybeSingle();

  if (readError) return actionFailed(readError, "Lead laden mislukt.");
  if (!lead) return { ok: false, error: "Deze lead bestaat niet (meer)." };

  // A lead may exist without an e-mail address; a customer may not, and one
  // is not something to make up.
  const email = lead.email?.trim();
  if (!email) return { ok: false, error: "Deze lead heeft geen e-mailadres. Vul dat eerst aan." };

  const { data: created, error } = await db
    .from("customers")
    .insert({
      company_name: lead.company_name.trim(),
      contact_name: lead.contact_name.trim(),
      email,
      phone: orNull(lead.phone ?? undefined),
      street: "",
      postal_code: "",
      city: "",
      country: "Nederland",
      notes: lead.notes,
      status: "active",
      source_lead_id: leadId,
    })
    .select("id")
    .single();

  if (error || !created) {
    if (error?.code === "23505") {
      const raced = await existingFor(db, "source_lead_id", leadId);
      if (raced) return { ok: true, value: { customerId: raced, created: false } };
    }
    return actionFailed(error, "Klant aanmaken mislukt.");
  }

  await db.from("leads").update({ status: "won" }).eq("id", leadId);

  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/klanten");
  revalidatePath("/admin");
  return { ok: true, value: { customerId: created.id, created: true } };
}
