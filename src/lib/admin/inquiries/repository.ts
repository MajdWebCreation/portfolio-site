import { adminDb, failed } from "@/lib/admin/db";
import { inquiryFromRow, statusEventFromRow } from "@/lib/admin/inquiries/mapper";
import type { Inquiry, InquiryStatusEvent } from "@/lib/admin/inquiries/types";
import { listQuotesForCustomer } from "@/lib/admin/quotes/repository";
import { calculateTotals } from "@/lib/money/tax";
import { listRecurringServicesForCustomer } from "@/lib/payments/repository";

/**
 * Read access to inquiries, backed by Supabase.
 *
 * Every function goes through `adminDb()`, which refuses a caller that is not
 * an active admin before the query is sent; row level security then decides
 * again on the server. The pages check too, but a repository that is called
 * from a server action must not depend on its caller having done so.
 */
const columns =
  "id, origin, status, status_changed_at, lost_reason, service_interest, quoted_value_cents, won_value_cents, recurring_monthly_cents, currency, received_at, locale, name, email, company, message, internal_note, phone, planner, website_url, updated_at, traffic_class, traffic_source, traffic_medium, campaign, landing_path, utm_term, utm_content, adgroup_id, match_type, gclid, gbraid, wbraid, lead_event_id, marketing_consent, consent_version, consent_decided_at";

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

/**
 * The history of one inquiry, oldest first. The admin who made a change is
 * shown by display name when the profile is readable (an admin may read its
 * own profile); anyone else's change is shown as a change by an admin.
 */
export async function listInquiryStatusEvents(inquiryId: string): Promise<InquiryStatusEvent[]> {
  const db = await adminDb();
  const { data, error } = await db
    .from("inquiry_status_events")
    .select("id, inquiry_id, from_status, to_status, lost_reason, value_cents, recurring_monthly_cents, currency, changed_at, changed_by")
    .eq("inquiry_id", inquiryId)
    .order("changed_at", { ascending: true });
  failed("Verloop laden", error);

  const rows = data ?? [];
  const userIds = [...new Set(rows.map((row) => row.changed_by).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await db.from("admin_profiles").select("user_id, display_name").in("user_id", userIds);
    for (const profile of profiles ?? []) names.set(profile.user_id, profile.display_name ?? "beheerder");
  }

  return rows.map((row) => statusEventFromRow(row, row.changed_by ? (names.get(row.changed_by) ?? "beheerder") : undefined));
}

/**
 * What the pipeline panel can propose for the value fields, from the
 * customer this inquiry became: the net total of the latest quote that was
 * sent or accepted, and the monthly amount of the active recurring
 * services. Proposals only -- a quote given by mail or phone has no record
 * here, and the admin types the value in.
 */
export type InquiryValuePrefill = {
  /** Net total (excluding VAT) of the most recent sent or accepted quote. */
  quotedValueCents?: number;
  /** Net total of the most recent accepted quote. */
  acceptedValueCents?: number;
  /** Sum of the monthly amounts of active recurring services, excluding VAT. */
  recurringMonthlyCents?: number;
};

export async function loadInquiryValuePrefill(customerId: string | null): Promise<InquiryValuePrefill> {
  if (!customerId) return {};
  const [quotes, services] = await Promise.all([listQuotesForCustomer(customerId), listRecurringServicesForCustomer(customerId)]);

  const sentOrAccepted = quotes.filter((quote) => quote.status === "sent" || quote.status === "accepted");
  const accepted = quotes.filter((quote) => quote.status === "accepted");
  const net = (quote: (typeof quotes)[number]) => calculateTotals(quote.lines).subtotalCents;
  const active = services.filter((service) => service.status === "active");

  return {
    ...(sentOrAccepted.length > 0 ? { quotedValueCents: net(sentOrAccepted[0]) } : {}),
    ...(accepted.length > 0 ? { acceptedValueCents: net(accepted[0]) } : {}),
    ...(active.length > 0 ? { recurringMonthlyCents: active.reduce((sum, service) => sum + service.amountCents, 0) } : {}),
  };
}
