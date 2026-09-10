import type { ContactPayload } from "@/lib/contact/payload";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Storing a website request.
 *
 * Called from the contact route after its own validation has passed, with the
 * values that route already normalised. Only fields a visitor actually sent
 * are written: `status`, `received_at` and everything the admin owns are not
 * passed at all, and cannot be — `anon` holds an INSERT grant on exactly the
 * eight columns below, so a column outside that list is refused by Postgres
 * before any policy runs. See the inquiry_public_intake migration.
 *
 * A contact request has no phone number and no planner payload, matching the
 * table's own check constraint; the planner sends its structured block
 * verbatim, prices included as the formatted strings the visitor saw.
 */
export type InquirySubmission = {
  origin: "contact" | "project_planner";
  locale: "nl" | "en";
  name: string;
  email: string;
  company: string;
  message: string;
  phone: string;
  planner?: ContactPayload["planner"];
};

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Throws when the row was not stored, so the caller cannot report success. */
export async function storeInquiry(submission: InquirySubmission): Promise<void> {
  const isPlanner = submission.origin === "project_planner";

  const { error } = await createSupabasePublicClient()
    .from("inquiries")
    .insert({
      origin: submission.origin,
      locale: submission.locale,
      name: submission.name,
      email: submission.email,
      company: orNull(submission.company),
      message: submission.message,
      phone: isPlanner ? orNull(submission.phone) : null,
      planner: isPlanner ? ((submission.planner ?? {}) as unknown as Json) : null,
    });

  if (error) {
    throw new Error(`Aanvraag opslaan: ${error.message}`);
  }
}
