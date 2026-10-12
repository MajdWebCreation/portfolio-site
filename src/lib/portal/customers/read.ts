import { portalReader, portalResult } from "@/lib/portal/rpc";

/**
 * The customer's details as they stand now, the fields a customer may see:
 * no notes, status, source or attribution -- portal_customer does not
 * return them.
 */
export type PortalCustomerDetails = {
  companyName: string;
  contactName: string;
  email: string;
  phone: string | null;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  kvkNumber: string | null;
  vatNumber: string | null;
};

/** Throws PortalDenied when the caller may not act for this customer. */
export async function readPortalCustomer(customerId: string): Promise<PortalCustomerDetails> {
  const db = await portalReader();
  const rows = portalResult("Gegevens laden", await db.rpc("portal_customer", { p_customer_id: customerId }));
  const row = rows[0];
  if (!row) throw new Error("Gegevens laden: geen antwoord");
  return {
    companyName: row.company_name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    street: row.street,
    postalCode: row.postal_code,
    city: row.city,
    country: row.country,
    kvkNumber: row.kvk_number,
    vatNumber: row.vat_number,
  };
}
