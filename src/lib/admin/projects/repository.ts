import { adminDb, failed } from "@/lib/admin/db";
import { projectFromRow } from "@/lib/admin/projects/mapper";
import type { Project } from "@/lib/admin/projects/types";

/** Read access to projects; see inquiries/repository.ts for the access rules. */
const columns =
  "id, customer_id, name, status, start_date, deadline, notes, created_at, updated_at";

export async function listProjects(): Promise<Project[]> {
  const db = await adminDb();
  const { data, error } = await db.from("projects").select(columns).order("updated_at", { ascending: false });
  failed("Projecten laden", error);
  return (data ?? []).map(projectFromRow);
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await adminDb();
  const { data, error } = await db.from("projects").select(columns).eq("id", id).maybeSingle();
  failed("Project laden", error);
  return data ? projectFromRow(data) : undefined;
}

/**
 * The projects of one customer, oldest first so the customer page reads as a
 * history. Scoped in the query rather than filtered afterwards: a customer
 * page has no reason to pull every project in the database.
 */
export async function listProjectsForCustomer(customerId: string): Promise<Project[]> {
  const db = await adminDb();
  const { data, error } = await db
    .from("projects")
    .select(columns)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: true });
  failed("Projecten van klant laden", error);
  return (data ?? []).map(projectFromRow);
}
