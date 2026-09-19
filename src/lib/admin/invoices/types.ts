import type { CustomerSnapshot, DocumentLine, DocumentNumber, IssuedActivation } from "@/lib/admin/documents/types";

/**
 * The stored PDF of a definitive invoice.
 *
 * The bytes live in Supabase Storage; the row keeps where they are, how big
 * they are and what they hash to. The hash is the point: it is checked
 * against the bytes before they are mailed, so "the file the admin approved"
 * and "the file the customer received" is a claim with an answer rather than
 * an assumption.
 */
export type InvoiceDocumentFile = {
  /** Object path in the invoice-documents bucket. */
  path: string;
  /** SHA-256 of the file, lowercase hex. */
  sha256: string;
  bytes: number;
  /** ISO timestamp. */
  generatedAt: string;
};

/**
 * Where an invoice stands, as one list.
 *
 * `issued` is the state this administration used to lack: a document that is
 * definitive -- numbered, frozen, countable as an invoice -- but that has not
 * gone to the customer yet. It sits between the concept the admin edits and
 * the mail that leaves.
 */
export type InvoiceStatus = "draft" | "issued" | "sent" | "paid" | "overdue" | "cancelled";

export type Invoice = {
  id: string;
  number: DocumentNumber;
  status: InvoiceStatus;
  customer: CustomerSnapshot;
  /** Project this invoice belongs to, when it was filed under one. */
  projectId?: string;
  /** YYYY-MM-DD */
  issueDate: string;
  /** YYYY-MM-DD */
  dueDate: string;
  /** Reference the customer quotes when paying; the number when empty. */
  paymentReference: string;
  lines: DocumentLine[];
  notes: string;
  /**
   * ISO timestamp of the moment the definitive number was taken and the
   * figures froze. Absent while it is still a concept. Set before
   * `issuedAt`: between the two the PDF is being made.
   */
  finalizingAt?: string;
  /**
   * ISO timestamp of the moment this became a document: its PDF was rendered
   * once, stored and recorded. Absent while it is a concept, and absent on an
   * invoice whose finalization never finished.
   */
  issuedAt?: string;
  /** What the document says about a monthly service, frozen when it was issued. */
  activationNote?: IssuedActivation;
  /**
   * The one PDF this invoice is. Rendered at the moment it was issued, stored
   * in the invoice-documents bucket, and read back -- never re-rendered --
   * for the admin's preview and for the mail attachment.
   */
  document?: InvoiceDocumentFile;
  /** ISO timestamp of the moment the mail was accepted; absent until then. */
  sentAt?: string;
  /** The address the PDF was delivered to. */
  recipientEmail?: string;
  /** Quote this invoice follows from, when known. */
  quoteId?: string;
  /** The recurring service this invoice bills, for a monthly charge. */
  recurringServiceId?: string;
  /** First day of the period billed; set exactly when recurringServiceId is. */
  billingPeriodStart?: string;
  /** Last day of that period. */
  billingPeriodEnd?: string;
  /** ISO timestamp. */
  updatedAt: string;
};

export const invoiceStatusOrder: readonly InvoiceStatus[] = ["draft", "issued", "sent", "paid", "overdue", "cancelled"];

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  draft: "Concept",
  issued: "Definitief",
  sent: "Verzonden",
  paid: "Betaald",
  overdue: "Te laat",
  cancelled: "Geannuleerd",
};

export const invoiceStatusTone: Record<InvoiceStatus, "neutral" | "accent" | "success" | "danger"> = {
  draft: "neutral",
  issued: "accent",
  sent: "accent",
  paid: "success",
  overdue: "danger",
  cancelled: "neutral",
};

/**
 * The statuses an admin may set by hand on a concept.
 *
 * The rest are the flow's to give: `issued` comes from making the document
 * definitive and `sent` from actually mailing it, and letting either be
 * picked from a dropdown would produce an invoice that claims to exist
 * without a number behind it.
 */
export const selectableInvoiceStatuses: readonly InvoiceStatus[] = ["draft", "cancelled"];

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
