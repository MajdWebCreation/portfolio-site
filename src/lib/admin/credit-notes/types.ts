import type { StatusTone } from "@/components/admin/status-badge";
import type { CustomerSnapshot, DocumentLine, DocumentNumber } from "@/lib/admin/documents/types";
import type { InvoiceDocumentFile } from "@/lib/admin/invoices/types";
import type { Cents } from "@/lib/money";

/**
 * A credit note corrects an issued invoice. The invoice does not move: it is
 * frozen the moment it is numbered, and this document is the only way to
 * say that less is owed on it. It has its own number in its own series
 * (YM-C-YYYY-NNNNNN), its own PDF, and it stays in the administration for
 * good.
 *
 * Whether the money side is finished is deliberately not a status here. It
 * follows from the invoice's payments and the refunds against the note --
 * see settlement.ts -- so there is one answer to "is this done", and it is
 * computed, never ticked.
 */
export type CreditNoteStatus = "issued" | "sent";

export type CreditNoteSource = "manual" | "cancellation_credit";

export type CreditNote = {
  id: string;
  number: DocumentNumber;
  status: CreditNoteStatus;
  customer: CustomerSnapshot;
  invoiceId: string;
  reason: string;
  /** YYYY-MM-DD */
  issueDate: string;
  source: CreditNoteSource;
  /** The monthly service whose undelivered days this credits, for a cancellation credit. */
  recurringServiceId?: string;
  lines: DocumentLine[];
  /** Frozen result of calculateTotals over the lines, as the database holds it. */
  subtotalCents: Cents;
  vatCents: Cents;
  totalCents: Cents;
  finalizingAt?: string;
  issuedAt?: string;
  document?: InvoiceDocumentFile;
  sentAt?: string;
  recipientEmail?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * The one definition of "this credit note counts".
 *
 * A credit note takes its number before its PDF is stored, and the two can
 * come apart: a numbered note without a document is a half-finished one.
 * Until the document exists it corrects nothing -- it lowers no balance,
 * stops no reminder, allows no refund -- and every reader asks this
 * function rather than looking at a column of its own. The database says
 * the same (`credit_notes_issued_has_document`): `issued_at` is only ever
 * set together with the document.
 */
export function isFinanciallyIssued(note: Pick<CreditNote, "issuedAt" | "document">): boolean {
  return Boolean(note.issuedAt && note.document);
}

/** The same question, of a database row. */
export function isFinanciallyIssuedRow(row: { issued_at: string | null; document_path: string | null }): boolean {
  return Boolean(row.issued_at && row.document_path);
}

export const creditNoteStatusLabels: Record<CreditNoteStatus, string> = {
  issued: "Definitief",
  sent: "Verzonden",
};

export const creditNoteStatusTone: Record<CreditNoteStatus, StatusTone> = {
  issued: "accent",
  sent: "success",
};

export const creditNoteSourceLabels: Record<CreditNoteSource, string> = {
  manual: "Handmatig",
  cancellation_credit: "Proratering na opzegging",
};

// ---------------------------------------------------------------- refunds

export type RefundMethod = "mollie" | "manual";

/** Mollie's own states, plus the one a manual refund is born in. `queued` at Mollie is `pending` here. */
export type RefundStatus = "pending" | "processing" | "refunded" | "failed" | "canceled";

export type Refund = {
  id: string;
  creditNoteId: string;
  invoiceId: string;
  customerId: string;
  amountCents: Cents;
  method: RefundMethod;
  status: RefundStatus;
  /** The local payment refunded, for a Mollie refund. */
  paymentId?: string;
  providerPaymentId?: string;
  providerRefundId?: string;
  idempotencyKey: string;
  /** Set before Mollie was asked; cleared once its answer was written. */
  claimedAt?: string;
  settledAt?: string;
  settledBy?: string;
  note: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
};

export const refundMethodLabels: Record<RefundMethod, string> = {
  mollie: "Via Mollie",
  manual: "Handmatig",
};

export const refundStatusLabels: Record<RefundStatus, string> = {
  pending: "In behandeling",
  processing: "Wordt verwerkt",
  refunded: "Terugbetaald",
  failed: "Refund mislukt",
  canceled: "Geannuleerd",
};

export const refundStatusTone: Record<RefundStatus, StatusTone> = {
  pending: "accent",
  processing: "accent",
  refunded: "success",
  failed: "danger",
  canceled: "neutral",
};

export function isRefundStatus(value: string): value is RefundStatus {
  return ["pending", "processing", "refunded", "failed", "canceled"].includes(value);
}

/** Money that went back, or may still be on its way. Failed and cancelled attempts count for nothing. */
export function isLiveRefund(refund: Pick<Refund, "status">): boolean {
  return refund.status !== "failed" && refund.status !== "canceled";
}

export function isSettledRefund(refund: Pick<Refund, "status">): boolean {
  return refund.status === "refunded";
}
