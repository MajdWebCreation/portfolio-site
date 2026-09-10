import { adminDb, failed } from "@/lib/admin/db";
import { linesFromRows, snapshotFromRow, type LineRow } from "@/lib/admin/documents/mapper";
import type { Quote, QuoteStatus } from "@/lib/admin/quotes/types";

/**
 * Read access to quotes. Lines come back in the same query, ordered by their
 * stored position; totals are never read from the database, they are computed
 * from the lines by `calculateTotals` so there is one implementation.
 */
const columns = `
  id, number_value, number_provisional, status,
  customer_id, customer_company_name, customer_contact_name, customer_email,
  customer_street, customer_postal_code, customer_city, customer_country,
  customer_kvk_number, customer_vat_number,
  issue_date, valid_until, subject, intro, notes, sent_at, recipient_email, created_at, updated_at,
  quote_lines ( id, position, description, quantity_hundredths, unit_price_cents, vat_rate )
`;

type QuoteWithLines = Parameters<typeof quoteFromRow>[0];

function quoteFromRow(row: {
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
  issue_date: string;
  valid_until: string;
  subject: string;
  intro: string;
  notes: string;
  sent_at: string | null;
  recipient_email: string | null;
  updated_at: string;
  quote_lines: LineRow[];
}): Quote {
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
    ...(row.sent_at ? { sentAt: row.sent_at } : {}),
    ...(row.recipient_email ? { recipientEmail: row.recipient_email } : {}),
  };
}

export async function listQuotes(): Promise<Quote[]> {
  const db = await adminDb();
  const { data, error } = await db.from("quotes").select(columns).order("updated_at", { ascending: false });
  failed("Offertes laden", error);
  return ((data ?? []) as unknown as QuoteWithLines[]).map(quoteFromRow);
}

export async function getQuote(id: string): Promise<Quote | undefined> {
  const db = await adminDb();
  const { data, error } = await db.from("quotes").select(columns).eq("id", id).maybeSingle();
  failed("Offerte laden", error);
  return data ? quoteFromRow(data as unknown as QuoteWithLines) : undefined;
}
