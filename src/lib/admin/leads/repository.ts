import { adminDb, failed } from "@/lib/admin/db";
import { leadFromRow } from "@/lib/admin/leads/mapper";
import type { Lead } from "@/lib/admin/leads/types";

/** Read access to leads; see inquiries/repository.ts for the access rules. */
const columns =
  "id, company_name, contact_name, email, phone, website, source, status, notes, last_contact_at, next_follow_up_at, created_at, updated_at";

export async function listLeads(): Promise<Lead[]> {
  const db = await adminDb();
  const { data, error } = await db.from("leads").select(columns).order("created_at", { ascending: false });
  failed("Leads laden", error);
  return (data ?? []).map(leadFromRow);
}

export async function getLead(id: string): Promise<Lead | undefined> {
  const db = await adminDb();
  const { data, error } = await db.from("leads").select(columns).eq("id", id).maybeSingle();
  failed("Lead laden", error);
  return data ? leadFromRow(data) : undefined;
}
