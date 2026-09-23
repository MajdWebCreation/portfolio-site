import type { Inquiry, InquiryStatus, PlannerSubmission } from "@/lib/admin/inquiries/types";
import { isTrafficClass, type Attribution } from "@/lib/attribution/types";
import type { Database } from "@/lib/supabase/database.types";

export type InquiryRow = Database["public"]["Tables"]["inquiries"]["Row"];

/**
 * Row to domain. The union in `Inquiry` is reconstructed from `origin`; the
 * database enforces with a check constraint that a planner row carries its
 * payload, a websitecheck row its address, and a contact row neither.
 */
/** The five columns as one value, or nothing: the database keeps them together, so a class without a path never occurs. */
function attributionFromRow(row: InquiryRow): Attribution | undefined {
  if (!isTrafficClass(row.traffic_class) || !row.landing_path) return undefined;
  return {
    trafficClass: row.traffic_class,
    trafficSource: row.traffic_source,
    trafficMedium: row.traffic_medium,
    campaign: row.campaign,
    landingPath: row.landing_path,
  };
}

export function inquiryFromRow(row: InquiryRow): Inquiry {
  const attribution = attributionFromRow(row);
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
    ...(attribution ? { attribution } : {}),
  };

  if (row.origin === "project_planner") {
    return {
      ...base,
      origin: "project_planner",
      ...(row.phone ? { phone: row.phone } : {}),
      planner: row.planner as unknown as PlannerSubmission,
    };
  }

  if (row.origin === "websitecheck") {
    return {
      ...base,
      origin: "websitecheck",
      websiteUrl: row.website_url ?? "",
      ...(row.phone ? { phone: row.phone } : {}),
    };
  }

  return { ...base, origin: "contact" };
}
