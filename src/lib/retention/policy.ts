/**
 * How long personal data is kept, as rules.
 *
 * The policy, decided by the business owner on 23 September 2026:
 *
 *   inquiries     twelve months after the last activity, unless the request
 *                 became a customer -- then it is part of that dossier
 *   leads         twelve months after the last activity, unless won or
 *                 converted; a planned follow-up counts as activity
 *   mail bodies   the text and HTML of a customer mail that is not part of
 *                 the financial administration is removed after twelve
 *                 months; the row itself (who, what, when) stays
 *   invoices and everything the fiscal retention duty covers: seven years,
 *                 and this job never touches them
 *
 * "Last activity" is `updated_at`. It is maintained by a database trigger on
 * both tables (business_core.sql: *_set_updated_at), so any edit, status
 * change or note bumps it, and it is never older than `received_at` or
 * `created_at`. For leads the planned follow-up and the last contact are
 * taken into account as well, whichever is latest.
 *
 * Every rule is a pure function of a row and a cutoff, so the job that runs
 * them (retention-runner.ts) contains no policy of its own, and the tests
 * pin the policy down without a database.
 */
import type { CommunicationCategory } from "@/lib/admin/communications/types";

export const RETENTION_MONTHS = 12;

/** What a redacted body says instead of the mail. */
export const retentionRedactedBody = "[inhoud verwijderd volgens bewaarbeleid]";

/**
 * Mail categories that belong to the financial administration and are kept
 * for the fiscal retention period, bodies included: the invoice itself, the
 * invoice that opened a direct debit, the monthly term, and the reminders
 * that chased one. Listed so that the exclusion is explicit and a category
 * added later has to be placed on one side or the other on purpose.
 */
export const fiscalCategories: readonly CommunicationCategory[] = [
  "invoice_sent",
  "invoice_activation_sent",
  "recurring_invoice_settled",
  "payment_reminder_first",
  "payment_reminder_second",
  "payment_final_notice",
];

/** Categories whose body may go after twelve months: the quote, the activation link, the pre-notification. */
export const redactableCategories: readonly CommunicationCategory[] = [
  "quote_sent",
  "direct_debit_activation",
  "recurring_invoice_prenotification",
];

/** The moment before which data has aged out, as an ISO timestamp. */
export function retentionCutoff(now: Date, months = RETENTION_MONTHS): string {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return cutoff.toISOString();
}

function latest(...timestamps: (string | null | undefined)[]): string | undefined {
  let result: string | undefined;
  for (const value of timestamps) {
    if (value && (!result || value > result)) result = value;
  }
  return result;
}

export type InquiryRetentionRow = {
  id: string;
  received_at: string;
  updated_at: string;
};

export type LeadRetentionRow = {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
};

export type CommunicationRetentionRow = {
  id: string;
  category: string;
  created_at: string;
  sent_at: string | null;
  body_text: string;
};

/** True when the request may go: not a customer's, and quiet for a year. */
export function inquiryHasExpired(row: InquiryRetentionRow, cutoff: string, convertedInquiryIds: ReadonlySet<string>): boolean {
  if (convertedInquiryIds.has(row.id)) return false;
  const lastActivity = latest(row.received_at, row.updated_at);
  return Boolean(lastActivity && lastActivity < cutoff);
}

/**
 * True when the lead may go: not won, not a customer's, and no activity --
 * no edit, no contact, no planned follow-up -- within a year. A follow-up
 * planned for the future is a running process and keeps the lead.
 */
export function leadHasExpired(row: LeadRetentionRow, cutoff: string, convertedLeadIds: ReadonlySet<string>): boolean {
  if (convertedLeadIds.has(row.id)) return false;
  if (row.status === "won") return false;
  const lastActivity = latest(row.created_at, row.updated_at, row.last_contact_at, row.next_follow_up_at);
  return Boolean(lastActivity && lastActivity < cutoff);
}

/** True when the mail's body may go: a non-fiscal category, sent over a year ago, not yet redacted. */
export function communicationBodyHasExpired(row: CommunicationRetentionRow, cutoff: string): boolean {
  if (!redactableCategories.includes(row.category as CommunicationCategory)) return false;
  if (row.body_text === retentionRedactedBody) return false;
  const sent = row.sent_at ?? row.created_at;
  return sent < cutoff;
}
