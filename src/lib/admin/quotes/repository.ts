import { adminDb, failed } from "@/lib/admin/db";
import { quoteColumns, quoteFromRow, type QuoteRow } from "@/lib/admin/quotes/mapper";
import type { Quote, QuoteStatus } from "@/lib/admin/quotes/types";

/**
 * Read access to quotes. Lines come back in the same query, ordered by their
 * stored position; totals are never read from the database, they are computed
 * from the lines by `calculateTotals` so there is one implementation.
 */
export async function listQuotes(): Promise<Quote[]> {
  const db = await adminDb();
  const { data, error } = await db.from("quotes").select(quoteColumns).order("updated_at", { ascending: false });
  failed("Offertes laden", error);
  return ((data ?? []) as unknown as QuoteRow[]).map(quoteFromRow);
}

/**
 * The quotes of one customer, newest change first. Scoped the same way as
 * `listInvoicesForCustomer`, and on `quotes_customer_idx`.
 */
export async function listQuotesForCustomer(customerId: string): Promise<Quote[]> {
  const db = await adminDb();
  const { data, error } = await db
    .from("quotes")
    .select(quoteColumns)
    .eq("customer_id", customerId)
    .order("updated_at", { ascending: false });
  failed("Offertes van klant laden", error);
  return ((data ?? []) as unknown as QuoteRow[]).map(quoteFromRow);
}

/** The quotes filed under one project, newest issue date first. */
export async function listQuotesForProject(projectId: string): Promise<Quote[]> {
  const db = await adminDb();
  const { data, error } = await db
    .from("quotes")
    .select(quoteColumns)
    .eq("project_id", projectId)
    .order("issue_date", { ascending: false });
  failed("Offertes van project laden", error);
  return ((data ?? []) as unknown as QuoteRow[]).map(quoteFromRow);
}

export async function getQuote(id: string): Promise<Quote | undefined> {
  const db = await adminDb();
  const { data, error } = await db.from("quotes").select(quoteColumns).eq("id", id).maybeSingle();
  failed("Offerte laden", error);
  return data ? quoteFromRow(data as unknown as QuoteRow) : undefined;
}

/**
 * The quote that replaced this one, if any: the one naming it in
 * `supersedes_quote_id`. At most one, by the unique index. Only what a screen
 * needs to say "vervangen door …" -- a concept successor is a draft the
 * customer has not seen, and is named as such.
 */
export type QuoteSuccessor = Pick<Quote, "id" | "number" | "status" | "sentAt">;

export async function findQuoteSuccessor(quoteId: string): Promise<QuoteSuccessor | undefined> {
  const db = await adminDb();
  const { data, error } = await db
    .from("quotes")
    .select("id, number_value, number_provisional, status, sent_at")
    .eq("supersedes_quote_id", quoteId)
    .maybeSingle();
  failed("Opvolger van offerte laden", error);
  if (!data) return undefined;
  return {
    id: data.id,
    number: { value: data.number_value, provisional: data.number_provisional },
    status: data.status as QuoteStatus,
    ...(data.sent_at ? { sentAt: data.sent_at } : {}),
  };
}
