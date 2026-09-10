import type { Customer, CustomerStatus } from "@/lib/admin/customers/types";
import type { Database } from "@/lib/supabase/database.types";

export type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];

export function customerFromRow(row: CustomerRow): Customer {
  return {
    id: row.id,
    companyName: row.company_name,
    contactName: row.contact_name,
    email: row.email,
    address: {
      street: row.street,
      postalCode: row.postal_code,
      city: row.city,
      country: row.country,
    },
    notes: row.notes,
    status: row.status as CustomerStatus,
    createdAt: row.created_at,
    ...(row.phone ? { phone: row.phone } : {}),
    ...(row.kvk_number ? { kvkNumber: row.kvk_number } : {}),
    ...(row.vat_number ? { vatNumber: row.vat_number } : {}),
    ...(row.source_inquiry_id ? { sourceInquiryId: row.source_inquiry_id } : {}),
    ...(row.source_lead_id ? { sourceLeadId: row.source_lead_id } : {}),
  };
}
