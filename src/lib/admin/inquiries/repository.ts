import { adminDb, failed } from "@/lib/admin/db";
import { inquiryFromRow } from "@/lib/admin/inquiries/mapper";
import type { Inquiry } from "@/lib/admin/inquiries/types";

/**
 * Read access to inquiries, backed by Supabase.
 *
 * Every function goes through `adminDb()`, which refuses a caller that is not
 * an active admin before the query is sent; row level security then decides
 * again on the server. The pages check too, but a repository that is called
 * from a server action must not depend on its caller having done so.
 */
const columns = "id, origin, status, received_at, locale, name, email, company, message, internal_note, phone, planner, updated_at";

export async function listInquiries(): Promise<Inquiry[]> {
  const db = await adminDb();
  const { data, error } = await db.from("inquiries").select(columns).order("received_at", { ascending: false });
  failed("Aanvragen laden", error);
  return (data ?? []).map(inquiryFromRow);
}

export async function getInquiry(id: string): Promise<Inquiry | undefined> {
  const db = await adminDb();
  const { data, error } = await db.from("inquiries").select(columns).eq("id", id).maybeSingle();
  failed("Aanvraag laden", error);
  return data ? inquiryFromRow(data) : undefined;
}
