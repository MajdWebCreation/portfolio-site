import { linesFromRows, snapshotFromRow, type LineRow } from "@/lib/admin/documents/mapper";
import type { Quote, QuoteDocumentFile, QuoteStatus } from "@/lib/admin/quotes/types";

/**
 * One quote row to one Quote. Extracted from the repository the way the
 * invoice mapper was, because issuing reads the row back through the same
 * client right after numbering it, and two copies of this mapping would be
 * two places to forget a column.
 */
export type QuoteRow = {
  id: string;
  number_value: string;
  number_provisional: boolean;
  status: string;
  customer_id: string;
  customer_company_name: string;
  customer_contact_name: string;
  customer_email: string;
  customer_street: string;
  customer_postal_code: string;
  customer_city: string;
  customer_country: string;
  customer_kvk_number: string | null;
  customer_vat_number: string | null;
  project_id: string | null;
  issue_date: string;
  valid_until: string;
  subject: string;
  intro: string;
  notes: string;
  terms_edition: string | null;
  terms_published_on: string | null;
  document_path: string | null;
  document_sha256: string | null;
  document_bytes: number | null;
  document_generated_at: string | null;
  supersedes_quote_id: string | null;
  legacy_sent_without_document: boolean;
  sent_at: string | null;
  recipient_email: string | null;
  updated_at: string;
  quote_lines: LineRow[];
};

export const quoteColumns = `
  id, number_value, number_provisional, status,
  customer_id, customer_company_name, customer_contact_name, customer_email,
  customer_street, customer_postal_code, customer_city, customer_country,
  customer_kvk_number, customer_vat_number, project_id,
  issue_date, valid_until, subject, intro, notes,
  terms_edition, terms_published_on,
  document_path, document_sha256, document_bytes, document_generated_at,
  supersedes_quote_id, legacy_sent_without_document,
  sent_at, recipient_email, created_at, updated_at,
  quote_lines ( id, position, description, quantity_hundredths, unit_price_cents, vat_rate )
`;

/** The four artifact columns as one fact, or nothing: the constraint keeps them together. */
function documentFromRow(row: QuoteRow): QuoteDocumentFile | undefined {
  if (!row.document_path || !row.document_sha256 || !row.document_bytes || !row.document_generated_at) {
    return undefined;
  }
  return {
    path: row.document_path,
    sha256: row.document_sha256,
    bytes: row.document_bytes,
    generatedAt: row.document_generated_at,
  };
}

export function quoteFromRow(row: QuoteRow): Quote {
  const document = documentFromRow(row);
  return {
    id: row.id,
    number: { value: row.number_value, provisional: row.number_provisional },
    status: row.status as QuoteStatus,
    customer: snapshotFromRow(row),
    issueDate: row.issue_date,
    validUntil: row.valid_until,
    subject: row.subject,
    intro: row.intro,
    lines: linesFromRows(row.quote_lines ?? []),
    notes: row.notes,
    updatedAt: row.updated_at,
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.terms_edition && row.terms_published_on
      ? { terms: { edition: row.terms_edition, publishedOn: row.terms_published_on } }
      : {}),
    ...(document ? { document } : {}),
    ...(row.supersedes_quote_id ? { supersedesQuoteId: row.supersedes_quote_id } : {}),
    ...(row.legacy_sent_without_document ? { legacyWithoutDocument: true } : {}),
    ...(row.sent_at ? { sentAt: row.sent_at } : {}),
    ...(row.recipient_email ? { recipientEmail: row.recipient_email } : {}),
  };
}
