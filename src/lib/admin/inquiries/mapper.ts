import {
  isInquiryStatus,
  isLostReason,
  isServiceKey,
  type ConsentAtCapture,
  type Inquiry,
  type InquiryStatusEvent,
  type PlannerSubmission,
} from "@/lib/admin/inquiries/types";
import { isTrafficClass, type AdClickIds, type Attribution } from "@/lib/attribution/types";
import type { Database } from "@/lib/supabase/database.types";

export type InquiryRow = Database["public"]["Tables"]["inquiries"]["Row"];
export type InquiryStatusEventRow = Database["public"]["Tables"]["inquiry_status_events"]["Row"];

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
    ...(row.utm_term ? { term: row.utm_term } : {}),
    ...(row.utm_content ? { content: row.utm_content } : {}),
    ...(row.adgroup_id ? { adgroupId: row.adgroup_id } : {}),
    ...(row.match_type ? { matchType: row.match_type } : {}),
    landingPath: row.landing_path,
  };
}

function adClickIdsFromRow(row: InquiryRow): AdClickIds | undefined {
  const ids: AdClickIds = {
    ...(row.gclid ? { gclid: row.gclid } : {}),
    ...(row.gbraid ? { gbraid: row.gbraid } : {}),
    ...(row.wbraid ? { wbraid: row.wbraid } : {}),
  };
  return Object.keys(ids).length > 0 ? ids : undefined;
}

/** The three consent columns as one value; the database keeps them together, so a partial snapshot never occurs. */
function consentFromRow(row: InquiryRow): ConsentAtCapture | undefined {
  if (row.marketing_consent === null || row.consent_version === null || !row.consent_decided_at) return undefined;
  return { marketing: row.marketing_consent, version: row.consent_version, decidedAt: row.consent_decided_at };
}

function cents(value: number | null): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

export function inquiryFromRow(row: InquiryRow): Inquiry {
  const attribution = attributionFromRow(row);
  const adClickIds = adClickIdsFromRow(row);
  const consent = consentFromRow(row);
  const quotedValueCents = cents(row.quoted_value_cents);
  const wonValueCents = cents(row.won_value_cents);
  const recurringMonthlyCents = cents(row.recurring_monthly_cents);
  const base = {
    id: row.id,
    status: isInquiryStatus(row.status) ? row.status : ("new" as const),
    statusChangedAt: row.status_changed_at,
    ...(row.lost_reason && isLostReason(row.lost_reason) ? { lostReason: row.lost_reason } : {}),
    ...(row.service_interest && isServiceKey(row.service_interest) ? { serviceInterest: row.service_interest } : {}),
    ...(quotedValueCents !== undefined ? { quotedValueCents } : {}),
    ...(wonValueCents !== undefined ? { wonValueCents } : {}),
    ...(recurringMonthlyCents !== undefined ? { recurringMonthlyCents } : {}),
    receivedAt: row.received_at,
    locale: row.locale as "nl" | "en",
    name: row.name,
    email: row.email,
    message: row.message,
    ...(row.company ? { company: row.company } : {}),
    ...(row.internal_note ? { internalNote: row.internal_note } : {}),
    ...(attribution ? { attribution } : {}),
    ...(adClickIds ? { adClickIds } : {}),
    ...(row.lead_event_id ? { leadEventId: row.lead_event_id } : {}),
    ...(consent ? { consent } : {}),
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

/** One history row; `changedBy` is resolved by the caller from admin profiles it may read. */
export function statusEventFromRow(row: InquiryStatusEventRow, changedBy: string | undefined): InquiryStatusEvent {
  const valueCents = cents(row.value_cents);
  const recurringMonthlyCents = cents(row.recurring_monthly_cents);
  return {
    id: row.id,
    ...(row.from_status && isInquiryStatus(row.from_status) ? { fromStatus: row.from_status } : {}),
    toStatus: isInquiryStatus(row.to_status) ? row.to_status : "new",
    ...(row.lost_reason && isLostReason(row.lost_reason) ? { lostReason: row.lost_reason } : {}),
    ...(valueCents !== undefined ? { valueCents } : {}),
    ...(recurringMonthlyCents !== undefined ? { recurringMonthlyCents } : {}),
    changedAt: row.changed_at,
    ...(changedBy ? { changedBy } : {}),
  };
}
