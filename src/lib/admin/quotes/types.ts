import type { CustomerSnapshot, DocumentLine, DocumentNumber } from "@/lib/admin/documents/types";

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

export type Quote = {
  id: string;
  number: DocumentNumber;
  status: QuoteStatus;
  customer: CustomerSnapshot;
  /** YYYY-MM-DD */
  issueDate: string;
  /** YYYY-MM-DD */
  validUntil: string;
  subject: string;
  intro: string;
  lines: DocumentLine[];
  /** Remarks and conditions printed under the totals. */
  notes: string;
  /** ISO timestamp of the moment the mail was accepted; absent until then. */
  sentAt?: string;
  /** The address the PDF was delivered to. */
  recipientEmail?: string;
  /** ISO timestamp. */
  updatedAt: string;
};

export const quoteStatusOrder: readonly QuoteStatus[] = ["draft", "sent", "accepted", "rejected", "expired"];

export const quoteStatusLabels: Record<QuoteStatus, string> = {
  draft: "Concept",
  sent: "Verzonden",
  accepted: "Geaccepteerd",
  rejected: "Afgewezen",
  expired: "Verlopen",
};

export const quoteStatusTone: Record<QuoteStatus, "neutral" | "accent" | "success" | "danger"> = {
  draft: "neutral",
  sent: "accent",
  accepted: "success",
  rejected: "danger",
  expired: "danger",
};

export function isQuoteStatus(value: string): value is QuoteStatus {
  return (quoteStatusOrder as readonly string[]).includes(value);
}

/**
 * Ids of records that only exist in the browser session carry this prefix.
 * Server pages use it to tell "unknown id" (404) from "session-only id"
 * (render, and let the client look it up). Kept here, outside the "use
 * client" session module, so server components get the string itself.
 */
export const sessionQuotePrefix = "quotes-sessie-";
