import type { AdClickIds, Attribution } from "@/lib/attribution/types";
import type { ContactMode, ContactPayload } from "@/lib/contact/payload";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Storing a website request.
 *
 * Called from the contact route after its own validation has passed, with the
 * values that route already normalised. Only fields a visitor actually sent
 * are written: `status`, `received_at` and everything the admin owns are not
 * passed at all, and cannot be — `anon` holds an INSERT grant on exactly the
 * columns below, so a column outside that list is refused by Postgres before
 * any policy runs. See the inquiry_public_intake migration.
 *
 * Three origins, three shapes, matching the table's own check constraint: a
 * contact request has no phone number and no planner payload; the planner
 * sends its structured block verbatim, prices included as the formatted
 * strings the visitor saw; a websitecheck carries the normalised address of
 * the website and, optionally, a phone number, and no message.
 *
 * The attribution is the route's already validated value or null; null
 * writes null in all five columns. `utm_term`/`utm_content`, Google Ads'
 * `adgroup_id`/`match_type` and the click identifiers go in columns of
 * their own, written only when there is a value (the click identifiers only
 * with marketing consent, which the route checks and the database enforces
 * against the consent snapshot). Nothing about a visitor is stored that was
 * not checked first.
 *
 * Two more things travel with every insert: the lead event id the route
 * hands the browser for the primary Lead, so the row and the platforms name
 * the same event; and the consent snapshot the request's own cookie carried
 * (marketing yes or no, the text version, the moment of the choice), or
 * nothing when there was no current choice. Provenance, not tracking.
 */
export type ConsentSnapshot = { marketing: boolean; version: number; decidedAt: string };

export type InquirySubmission = {
  origin: ContactMode;
  locale: "nl" | "en";
  name: string;
  email: string;
  company: string;
  message: string;
  phone: string;
  planner?: ContactPayload["planner"];
  /** Already normalised by the route; required when the origin is "websitecheck". */
  websiteUrl?: string;
  attribution: Attribution | null;
  /** Already checked by the route, and null unless the request carried a yes to marketing. */
  adClickIds?: AdClickIds | null;
  /** The id the route returns to the browser for this lead; made before the insert so both agree. */
  leadEventId?: string;
  /** The request's current consent choice at capture, or null when it had none. */
  consent?: ConsentSnapshot | null;
};

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/*
  PostgREST's "column not in the schema cache", Postgres' "undefined column"
  and "insufficient privilege": what an insert gets from a database whose
  schema is not the one this code was written for (a migration not applied,
  a grant missing). One canonical schema, one canonical insert: such a
  mismatch is reported loudly and the request fails, rather than a row with
  fewer attribution or consent columns being stored in silence.
*/
const schemaMismatchCodes = new Set(["PGRST204", "42703", "42501"]);

/** Throws when the row was not stored, so the caller cannot report success. */
export async function storeInquiry(submission: InquirySubmission): Promise<void> {
  const isPlanner = submission.origin === "project_planner";
  const isWebsitecheck = submission.origin === "websitecheck";

  const base = {
    origin: submission.origin,
    locale: submission.locale,
    name: submission.name,
    email: submission.email,
    company: orNull(submission.company),
    message: submission.message,
    phone: isPlanner || isWebsitecheck ? orNull(submission.phone) : null,
    planner: isPlanner ? ((submission.planner ?? {}) as unknown as Json) : null,
    website_url: isWebsitecheck ? (submission.websiteUrl ?? null) : null,
    traffic_class: submission.attribution?.trafficClass ?? null,
    traffic_source: submission.attribution?.trafficSource ?? null,
    traffic_medium: submission.attribution?.trafficMedium ?? null,
    campaign: submission.attribution?.campaign ?? null,
    landing_path: submission.attribution?.landingPath ?? null,
  };
  const row = {
    ...base,
    utm_term: submission.attribution?.term ?? null,
    utm_content: submission.attribution?.content ?? null,
    adgroup_id: submission.attribution?.adgroupId ?? null,
    match_type: submission.attribution?.matchType ?? null,
    gclid: submission.adClickIds?.gclid ?? null,
    gbraid: submission.adClickIds?.gbraid ?? null,
    wbraid: submission.adClickIds?.wbraid ?? null,
    lead_event_id: submission.leadEventId ?? null,
    marketing_consent: submission.consent?.marketing ?? null,
    consent_version: submission.consent?.version ?? null,
    consent_decided_at: submission.consent?.decidedAt ?? null,
  };

  const client = createSupabasePublicClient();
  const { error } = await client.from("inquiries").insert(row);

  if (error && schemaMismatchCodes.has(error.code)) {
    /* The code only: the message may name a column, never a visitor. */
    console.error("Inquiry schema mismatch: the database does not match the intake columns; apply the pending migration", { code: error.code });
    throw new Error(`Aanvraag opslaan: schema mismatch (${error.code})`);
  }

  if (error) {
    throw new Error(`Aanvraag opslaan: ${error.message}`);
  }
}
