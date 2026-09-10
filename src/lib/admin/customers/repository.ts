import { adminDb, failed } from "@/lib/admin/db";
import { customerFromRow } from "@/lib/admin/customers/mapper";
import type { Customer } from "@/lib/admin/customers/types";

/** Read access to customers; see inquiries/repository.ts for the access rules. */
const columns =
  "id, company_name, contact_name, email, phone, street, postal_code, city, country, kvk_number, vat_number, notes, status, source_inquiry_id, source_lead_id, created_at, updated_at";

export async function listCustomers(): Promise<Customer[]> {
  const db = await adminDb();
  const { data, error } = await db.from("customers").select(columns).order("company_name");
  failed("Klanten laden", error);
  return (data ?? []).map(customerFromRow);
}

export async function getCustomer(id: string): Promise<Customer | undefined> {
  const db = await adminDb();
  const { data, error } = await db.from("customers").select(columns).eq("id", id).maybeSingle();
  failed("Klant laden", error);
  return data ? customerFromRow(data) : undefined;
}

/**
 * The customer that came from an inquiry or a lead, if one was made. Used by
 * the detail pages so the conversion button can say whether there is already
 * a customer to open.
 */
export async function getCustomerIdForSource(
  source: "inquiry" | "lead",
  sourceId: string,
): Promise<string | null> {
  const db = await adminDb();
  const column = source === "inquiry" ? "source_inquiry_id" : "source_lead_id";
  const { data, error } = await db.from("customers").select("id").eq(column, sourceId).maybeSingle();
  failed("Klantkoppeling laden", error);
  return data?.id ?? null;
}
