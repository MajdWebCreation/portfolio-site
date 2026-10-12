import type { CustomerSnapshot, DocumentLine, DocumentNumber } from "@/lib/admin/documents/types";
import type { InvoiceDocumentFile } from "@/lib/admin/invoices/types";

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

/**
 * The stored PDF of a sent quote: the same four facts an invoice keeps about
 * its file, in the same bucket, read back the same way. One type, so the
 * viewer and the artifact reader serve both documents without a second copy.
 */
export type QuoteDocumentFile = InvoiceDocumentFile;

/** The set of general terms a quote was issued under, as docs/legal/voorwaarden registers it. */
export type QuoteTermsSet = { edition: string; publishedOn: string };

export type Quote = {
  id: string;
  number: DocumentNumber;
  status: QuoteStatus;
  customer: CustomerSnapshot;
  /** Project this quote belongs to, when it was filed under one. */
  projectId?: string;
  /** YYYY-MM-DD */
  issueDate: string;
  /** YYYY-MM-DD */
  validUntil: string;
  subject: string;
  intro: string;
  lines: DocumentLine[];
  /** Remarks and conditions printed under the totals. */
  notes: string;
  /**
   * The set of general terms this quote was issued under, snapshotted when
   * its number was taken. Absent on a concept, and on a quote sent before
   * the snapshot existed.
   */
  terms?: QuoteTermsSet;
  /**
   * The one PDF this quote is: rendered once when it was issued, stored, and
   * read back -- never re-rendered -- for the admin's preview and for every
   * mail that attaches it. Absent on a concept.
   */
  document?: QuoteDocumentFile;
  /**
   * The sent quote this one replaces, when it is a new version of one. Said
   * at creation and never changed.
   */
  supersedesQuoteId?: string;
  /**
   * Sent before documents were stored: the PDF the customer received was
   * rendered into that mail and nowhere else. Such a quote cannot be resent
   * -- there is no file to resend -- and the way on is a new version.
   */
  legacyWithoutDocument?: boolean;
  /** ISO timestamp of the moment the first mail was accepted; absent until then. */
  sentAt?: string;
  /** The address the latest send went to. */
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
 * The statuses an admin may still set by hand on a quote the customer has.
 *
 * 'draft' is not among them: a number was spent and a file exists, and the
 * database refuses the way back. 'accepted' and 'rejected' are not either:
 * those are decisions, recorded once in quote_decisions -- by the customer
 * in the portal or by an admin through "Beslissing vastleggen" -- and the
 * database refuses either status without that record. What is left is
 * marking an open quote expired, or open again.
 */
export const quoteOutcomeStatuses: readonly QuoteStatus[] = ["sent", "expired"];

/** Decided: accepted or rejected, on record in quote_decisions and fixed for good. */
export function isQuoteDecided(quote: Pick<Quote, "status">): boolean {
  return quote.status === "accepted" || quote.status === "rejected";
}

export function isQuoteOutcomeStatus(value: string): value is QuoteStatus {
  return (quoteOutcomeStatuses as readonly string[]).includes(value);
}

/**
 * Numbered, and therefore frozen: the database refuses every change to what
 * the quote says from the moment its number exists. What a screen may still
 * offer is sending, a decision, and a new version.
 */
export function isQuoteFrozen(quote: Pick<Quote, "number">): boolean {
  return !quote.number.provisional;
}

/**
 * Why this quote cannot get a new version, or null when it can. The same
 * rules the database applies at insert, as sentences: a version follows a
 * quote the customer has, and an accepted quote is an agreement rather than
 * a proposal to revise.
 */
export function quoteRevisionBlockedReason(quote: Pick<Quote, "sentAt" | "status" | "number">): string | null {
  if (!quote.sentAt) return "Een nieuwe versie maak je van een verzonden offerte.";
  if (quote.status === "accepted") return `${quote.number.value} is geaccepteerd en krijgt geen nieuwe versie.`;
  return null;
}

/**
 * Ids of records that only exist in the browser session carry this prefix.
 * Server pages use it to tell "unknown id" (404) from "session-only id"
 * (render, and let the client look it up). Kept here, outside the "use
 * client" session module, so server components get the string itself.
 */
export const sessionQuotePrefix = "quotes-sessie-";
