import type { Project, ProjectStatus } from "@/lib/admin/projects/types";
import type { Database } from "@/lib/supabase/database.types";

export type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];

export function projectFromRow(row: ProjectRow): Project {
  return {
    id: row.id,
    customerId: row.customer_id,
    name: row.name,
    status: row.status as ProjectStatus,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.start_date ? { startDate: row.start_date } : {}),
    ...(row.deadline ? { deadline: row.deadline } : {}),
  };
}
