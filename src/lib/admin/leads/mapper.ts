import type { Lead, LeadSource, LeadStatus } from "@/lib/admin/leads/types";
import type { Database } from "@/lib/supabase/database.types";

export type LeadRow = Database["public"]["Tables"]["leads"]["Row"];

export function leadFromRow(row: LeadRow): Lead {
  return {
    id: row.id,
    companyName: row.company_name,
    contactName: row.contact_name,
    source: row.source as LeadSource,
    status: row.status as LeadStatus,
    notes: row.notes,
    createdAt: row.created_at,
    ...(row.email ? { email: row.email } : {}),
    ...(row.phone ? { phone: row.phone } : {}),
    ...(row.website ? { website: row.website } : {}),
    ...(row.last_contact_at ? { lastContactAt: row.last_contact_at } : {}),
    ...(row.next_follow_up_at ? { nextFollowUpAt: row.next_follow_up_at } : {}),
  };
}
