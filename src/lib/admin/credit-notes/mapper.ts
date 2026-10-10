import { linesFromRows, snapshotFromRow, type LineRow } from "@/lib/admin/documents/mapper";
import type { CreditNote, CreditNoteSource, CreditNoteStatus, Refund, RefundMethod, RefundStatus } from "@/lib/admin/credit-notes/types";
import type { InvoiceDocumentFile } from "@/lib/admin/invoices/types";
import type { Database } from "@/lib/supabase/database.types";

export type CreditNoteRow = Database["public"]["Tables"]["credit_notes"]["Row"] & { credit_note_lines?: LineRow[] | null };
export type RefundRow = Database["public"]["Tables"]["refunds"]["Row"];

export const creditNoteColumns = `
  id, number_value, number_provisional, status, customer_id, invoice_id, reason, issue_date, source, recurring_service_id,
  customer_company_name, customer_contact_name, customer_email, customer_street, customer_postal_code, customer_city,
  customer_country, customer_kvk_number, customer_vat_number, subtotal_cents, vat_cents, total_cents, currency,
  finalizing_at, issued_at, document_path, document_sha256, document_bytes, document_generated_at,
  sent_at, recipient_email, created_by, created_at, updated_at,
  credit_note_lines ( id, position, description, quantity_hundredths, unit_price_cents, vat_rate )
`;

export const refundColumns =
  "id, credit_note_id, invoice_id, customer_id, amount_cents, currency, method, status, payment_id, provider, provider_payment_id, provider_refund_id, idempotency_key, claimed_at, settled_at, settled_by, note, failure_reason, created_by, created_at, updated_at";

function documentFromRow(row: CreditNoteRow): InvoiceDocumentFile | undefined {
  if (!row.document_path || !row.document_sha256 || !row.document_bytes || !row.document_generated_at) return undefined;
  return { path: row.document_path, sha256: row.document_sha256, bytes: row.document_bytes, generatedAt: row.document_generated_at };
}

export function creditNoteFromRow(row: CreditNoteRow): CreditNote {
  const document = documentFromRow(row);
  return {
    id: row.id,
    number: { value: row.number_value, provisional: row.number_provisional },
    status: row.status as CreditNoteStatus,
    customer: snapshotFromRow(row),
    invoiceId: row.invoice_id,
    reason: row.reason,
    issueDate: row.issue_date,
    source: row.source as CreditNoteSource,
    lines: linesFromRows(row.credit_note_lines ?? []),
    subtotalCents: row.subtotal_cents,
    vatCents: row.vat_cents,
    totalCents: row.total_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.recurring_service_id ? { recurringServiceId: row.recurring_service_id } : {}),
    ...(row.finalizing_at ? { finalizingAt: row.finalizing_at } : {}),
    ...(row.issued_at ? { issuedAt: row.issued_at } : {}),
    ...(document ? { document } : {}),
    ...(row.sent_at ? { sentAt: row.sent_at } : {}),
    ...(row.recipient_email ? { recipientEmail: row.recipient_email } : {}),
  };
}

export function refundFromRow(row: RefundRow): Refund {
  return {
    id: row.id,
    creditNoteId: row.credit_note_id,
    invoiceId: row.invoice_id,
    customerId: row.customer_id,
    amountCents: row.amount_cents,
    method: row.method as RefundMethod,
    status: row.status as RefundStatus,
    idempotencyKey: row.idempotency_key,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.payment_id ? { paymentId: row.payment_id } : {}),
    ...(row.provider_payment_id ? { providerPaymentId: row.provider_payment_id } : {}),
    ...(row.provider_refund_id ? { providerRefundId: row.provider_refund_id } : {}),
    ...(row.claimed_at ? { claimedAt: row.claimed_at } : {}),
    ...(row.settled_at ? { settledAt: row.settled_at } : {}),
    ...(row.settled_by ? { settledBy: row.settled_by } : {}),
    ...(row.failure_reason ? { failureReason: row.failure_reason } : {}),
  };
}
