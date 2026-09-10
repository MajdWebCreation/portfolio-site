import type { Inquiry, InquiryStatus, PlannerSubmission } from "@/lib/admin/inquiries/types";
import type { Database } from "@/lib/supabase/database.types";

export type InquiryRow = Database["public"]["Tables"]["inquiries"]["Row"];

/**
 * Row to domain. The union in `Inquiry` is reconstructed from `origin`; the
 * database enforces with a check constraint that a planner row carries its
 * payload and a contact row does not.
 */
export function inquiryFromRow(row: InquiryRow): Inquiry {
  const base = {
    id: row.id,
    status: row.status as InquiryStatus,
    receivedAt: row.received_at,
    locale: row.locale as "nl" | "en",
    name: row.name,
    email: row.email,
    message: row.message,
    ...(row.company ? { company: row.company } : {}),
    ...(row.internal_note ? { internalNote: row.internal_note } : {}),
  };

  if (row.origin === "project_planner") {
    return {
      ...base,
      origin: "project_planner",
      ...(row.phone ? { phone: row.phone } : {}),
      planner: row.planner as unknown as PlannerSubmission,
    };
  }

  return { ...base, origin: "contact" };
}
