import type { Attribution } from "@/lib/attribution/types";
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
 * writes null in all five columns. Nothing about a visitor is stored that
 * was not checked first.
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
};

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Throws when the row was not stored, so the caller cannot report success. */
export async function storeInquiry(submission: InquirySubmission): Promise<void> {
  const isPlanner = submission.origin === "project_planner";
  const isWebsitecheck = submission.origin === "websitecheck";

  const { error } = await createSupabasePublicClient()
    .from("inquiries")
    .insert({
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
    });

  if (error) {
    throw new Error(`Aanvraag opslaan: ${error.message}`);
  }
}
