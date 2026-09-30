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
 * writes null in all five columns. `utm_term`/`utm_content` and the Google
 * Ads click identifiers go in columns of their own, written only when there
 * is a value (the click identifiers only with marketing consent, which the
 * route checks). Nothing about a visitor is stored that was not checked
 * first.
 */
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
};

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/*
  PostgREST's "column not in the schema cache", Postgres' "undefined column"
  and "insufficient privilege": what an insert that names the attribution
  columns of 20260930001651_inquiry_ad_attribution gets from a database that
  does not have them yet (or not the grant). See below.
*/
const missingColumnCodes = new Set(["PGRST204", "42703", "42501"]);

/** Throws when the row was not stored, so the caller cannot report success. */
export async function storeInquiry(submission: InquirySubmission): Promise<void> {
  const isPlanner = submission.origin === "project_planner";
  const isWebsitecheck = submission.origin === "websitecheck";

  const row = {
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
  const adAttribution = {
    utm_term: submission.attribution?.term ?? null,
    utm_content: submission.attribution?.content ?? null,
    gclid: submission.adClickIds?.gclid ?? null,
    gbraid: submission.adClickIds?.gbraid ?? null,
    wbraid: submission.adClickIds?.wbraid ?? null,
  };
  const hasAdAttribution = Object.values(adAttribution).some((value) => value !== null);

  const client = createSupabasePublicClient();
  let { error } = await client.from("inquiries").insert(hasAdAttribution ? { ...row, ...adAttribution } : row);

  /*
    Deploy-order safety net. If this code runs against a database where the
    ad attribution migration is not applied yet, an inquiry that carries those
    values would be refused as a whole -- and a paid lead lost. It is stored
    without them instead, and the log says why. Remove once the migration is
    applied everywhere.
  */
  if (error && hasAdAttribution && missingColumnCodes.has(error.code)) {
    console.error("Inquiry ad attribution columns unavailable; stored without them", { code: error.code });
    ({ error } = await client.from("inquiries").insert(row));
  }

  if (error) {
    throw new Error(`Aanvraag opslaan: ${error.message}`);
  }
}
