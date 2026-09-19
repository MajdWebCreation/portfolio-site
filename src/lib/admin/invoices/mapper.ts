import { linesFromRows, snapshotFromRow, type LineRow } from "@/lib/admin/documents/mapper";
import type { IssuedActivation } from "@/lib/admin/documents/types";
import type { Invoice, InvoiceDocumentFile, InvoiceStatus } from "@/lib/admin/invoices/types";

/**
 * One invoice row to one Invoice. Extracted from the repository because the
 * payment webhook reads the same shape through a different client, and two
 * copies of this mapping would be two places to forget a column.
 */
export type InvoiceRow = {
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
  recurring_service_id: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  issue_date: string;
  due_date: string;
  finalizing_at: string | null;
  issued_at: string | null;
  activation_note: unknown;
  document_path: string | null;
  document_sha256: string | null;
  document_bytes: number | null;
  document_generated_at: string | null;
  payment_reference: string;
  notes: string;
  quote_id: string | null;
  sent_at: string | null;
  recipient_email: string | null;
  updated_at: string;
  invoice_lines: LineRow[];
};

export const invoiceColumns = `
  id, number_value, number_provisional, status,
  customer_id, customer_company_name, customer_contact_name, customer_email,
  customer_street, customer_postal_code, customer_city, customer_country,
  customer_kvk_number, customer_vat_number, project_id,
  recurring_service_id, billing_period_start, billing_period_end,
  issue_date, due_date, finalizing_at, issued_at, activation_note,
  document_path, document_sha256, document_bytes, document_generated_at,
  payment_reference, notes, quote_id, sent_at, recipient_email, created_at, updated_at,
  invoice_lines ( id, position, description, quantity_hundredths, unit_price_cents, vat_rate )
`;

/**
 * The activation note as it was frozen, or nothing.
 *
 * Read defensively: it is jsonb, so the column can hold anything a future
 * hand-written query puts there, and a half-filled note would print a
 * sentence about a service with no name or no amount. Either all five fields
 * are there or the document simply has no note.
 */
export function activationNoteFromJson(value: unknown): IssuedActivation | undefined {
  if (!value || typeof value !== "object") return undefined;
  const note = value as Record<string, unknown>;
  const { serviceId, serviceName, monthlyNetCents, monthlyGrossCents, firstDebitOn } = note;
  if (typeof serviceId !== "string" || typeof serviceName !== "string" || typeof firstDebitOn !== "string") {
    return undefined;
  }
  if (typeof monthlyNetCents !== "number" || typeof monthlyGrossCents !== "number") return undefined;
  return { serviceId, serviceName, monthlyNetCents, monthlyGrossCents, firstDebitOn };
}

/** The four artifact columns as one fact, or nothing: the constraint keeps them together. */
function documentFromRow(row: InvoiceRow): InvoiceDocumentFile | undefined {
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

export function invoiceFromRow(row: InvoiceRow): Invoice {
  const activationNote = activationNoteFromJson(row.activation_note);
  const document = documentFromRow(row);
  return {
    id: row.id,
    number: { value: row.number_value, provisional: row.number_provisional },
    status: row.status as InvoiceStatus,
    customer: snapshotFromRow(row),
    issueDate: row.issue_date,
    dueDate: row.due_date,
    paymentReference: row.payment_reference,
    lines: linesFromRows(row.invoice_lines ?? []),
    notes: row.notes,
    updatedAt: row.updated_at,
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.recurring_service_id ? { recurringServiceId: row.recurring_service_id } : {}),
    ...(row.billing_period_start ? { billingPeriodStart: row.billing_period_start } : {}),
    ...(row.billing_period_end ? { billingPeriodEnd: row.billing_period_end } : {}),
    ...(row.quote_id ? { quoteId: row.quote_id } : {}),
    ...(row.finalizing_at ? { finalizingAt: row.finalizing_at } : {}),
    ...(row.issued_at ? { issuedAt: row.issued_at } : {}),
    ...(activationNote ? { activationNote } : {}),
    ...(document ? { document } : {}),
    ...(row.sent_at ? { sentAt: row.sent_at } : {}),
    ...(row.recipient_email ? { recipientEmail: row.recipient_email } : {}),
  };
}
