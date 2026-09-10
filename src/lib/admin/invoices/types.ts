import type { CustomerSnapshot, DocumentLine, DocumentNumber } from "@/lib/admin/documents/types";

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

export type Invoice = {
  id: string;
  number: DocumentNumber;
  status: InvoiceStatus;
  customer: CustomerSnapshot;
  /** YYYY-MM-DD */
  issueDate: string;
  /** YYYY-MM-DD */
  dueDate: string;
  /** Reference the customer quotes when paying; the number when empty. */
  paymentReference: string;
  lines: DocumentLine[];
  notes: string;
  /** ISO timestamp of the moment the mail was accepted; absent until then. */
  sentAt?: string;
  /** The address the PDF was delivered to. */
  recipientEmail?: string;
  /** Quote this invoice follows from, when known. */
  quoteId?: string;
  /** ISO timestamp. */
  updatedAt: string;
};

export const invoiceStatusOrder: readonly InvoiceStatus[] = ["draft", "sent", "paid", "overdue", "cancelled"];

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  draft: "Concept",
  sent: "Verzonden",
  paid: "Betaald",
  overdue: "Te laat",
  cancelled: "Geannuleerd",
};

export const invoiceStatusTone: Record<InvoiceStatus, "neutral" | "accent" | "success" | "danger"> = {
  draft: "neutral",
  sent: "accent",
  paid: "success",
  overdue: "danger",
  cancelled: "neutral",
};

export function isInvoiceStatus(value: string): value is InvoiceStatus {
  return (invoiceStatusOrder as readonly string[]).includes(value);
}

/**
 * Ids of records that only exist in the browser session carry this prefix.
 * Server pages use it to tell "unknown id" (404) from "session-only id"
 * (render, and let the client look it up). Kept here, outside the "use
 * client" session module, so server components get the string itself.
 */
export const sessionInvoicePrefix = "invoices-sessie-";
