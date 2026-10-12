import type { ProfileFields } from "@/lib/portal/profile/model";
import { portalReader, portalResult } from "@/lib/portal/rpc";

/** The editable details of this customer, and the version an edit has to name. */
export type PortalProfile = { fields: ProfileFields; version: string };

/** Throws PortalDenied when the caller may not act for this customer. */
export async function readPortalProfile(customerId: string): Promise<PortalProfile> {
  const db = await portalReader();
  const rows = portalResult("Gegevens laden", await db.rpc("portal_customer_profile", { p_customer_id: customerId }));
  const row = rows[0];
  if (!row) throw new Error("Gegevens laden: geen antwoord");
  return {
    fields: {
      companyName: row.company_name,
      contactName: row.contact_name,
      email: row.email,
      billingEmail: row.billing_email ?? "",
      phone: row.phone ?? "",
      street: row.street,
      postalCode: row.postal_code,
      city: row.city,
      country: row.country,
      kvkNumber: row.kvk_number ?? "",
      vatNumber: row.vat_number ?? "",
    },
    version: row.updated_at,
  };
}
