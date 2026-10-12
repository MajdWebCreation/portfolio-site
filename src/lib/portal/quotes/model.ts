import { calculateTotals, type DocumentTotals } from "@/lib/money";
import { isQuoteDecisionKind, isQuoteDecisionSource, type QuoteDecisionKind, type QuoteDecisionSource } from "@/lib/quotes/decision";
import { records, text, textOrNull } from "@/lib/portal/json";
import { linesFromJson, type PortalLine } from "@/lib/portal/lines";
import type { Database } from "@/lib/supabase/database.types";

/**
 * A quote as the customer portal holds it.
 *
 * Only quotes that went out as a stored PDF reach the portal; a concept
 * never does, and neither does a quote sent before quotes were stored. The
 * intro and notes are not here: they are part of the PDF, and the customer
 * reads them there, in the document they were sent.
 */
type QuoteRow = Database["public"]["Functions"]["portal_quotes"]["Returns"][number];
type QuoteDetailRow = Database["public"]["Functions"]["portal_quote"]["Returns"][number];
type QuoteDecisionRow = Database["public"]["Functions"]["portal_quote_decision"]["Returns"][number];

export type PortalQuoteStatus = "sent" | "accepted" | "rejected" | "expired";

export type PortalQuoteVersion = { id: string; number: string; issueDate: string; sentAt: string | null };

export type PortalQuote = {
  id: string;
  number: string;
  issueDate: string;
  validUntil: string;
  status: PortalQuoteStatus;
  subject: string;
  /** The general terms this quote was sent under. */
  terms?: { edition: string; publishedOn: string };
  sentAt: string | null;
  supersedes?: { id: string; number: string };
  supersededBy?: { id: string; number: string; sentAt: string | null };
  lines: PortalLine[];
};

export type PortalQuoteDetail = PortalQuote & { versions: PortalQuoteVersion[] };

function quoteStatus(value: string): PortalQuoteStatus {
  if (value === "sent" || value === "accepted" || value === "rejected" || value === "expired") return value;
  throw new Error(`offertestatus ${value}`);
}

export function quoteFromPortalRow(row: QuoteRow): PortalQuote {
  return {
    id: row.id,
    number: row.number,
    issueDate: row.issue_date,
    validUntil: row.valid_until,
    status: quoteStatus(row.status),
    subject: row.subject,
    ...(row.terms_edition && row.terms_published_on ? { terms: { edition: row.terms_edition, publishedOn: row.terms_published_on } } : {}),
    sentAt: row.sent_at,
    ...(row.supersedes_quote_id && row.supersedes_number ? { supersedes: { id: row.supersedes_quote_id, number: row.supersedes_number } } : {}),
    ...(row.superseded_by_quote_id && row.superseded_by_number
      ? { supersededBy: { id: row.superseded_by_quote_id, number: row.superseded_by_number, sentAt: row.superseded_on } }
      : {}),
    lines: linesFromJson(row.lines),
  };
}

export function quoteDetailFromPortalRow(row: QuoteDetailRow): PortalQuoteDetail {
  return {
    ...quoteFromPortalRow(row),
    versions: records(row.versions, "versies").map((item) => ({
      id: text(item, "id"),
      number: text(item, "number"),
      issueDate: text(item, "issue_date"),
      sentAt: textOrNull(item, "sent_at"),
    })),
  };
}

/**
 * Where a quote stands for the customer. A decision on record wins: what the
 * customer (or a colleague) accepted or rejected stays that, whatever came
 * after. "Vervangen" is derived: a later version of it was sent. An offer
 * still waiting past its date reads as expired, whatever the admin has
 * recorded yet.
 */
export type PortalQuoteState = "awaiting" | "expired" | "accepted" | "rejected" | "superseded";

export const portalQuoteStateLabels: Record<PortalQuoteState, string> = {
  awaiting: "Wacht op reactie",
  expired: "Verlopen",
  accepted: "Geaccepteerd",
  rejected: "Afgewezen",
  superseded: "Vervangen",
};

export const portalQuoteStateTone: Record<PortalQuoteState, "neutral" | "accent" | "success" | "danger"> = {
  awaiting: "accent",
  expired: "neutral",
  accepted: "success",
  rejected: "neutral",
  superseded: "neutral",
};

export function portalQuoteState(quote: Pick<PortalQuote, "status" | "validUntil" | "supersededBy">, todayKey: string): PortalQuoteState {
  if (quote.status === "accepted") return "accepted";
  if (quote.status === "rejected") return "rejected";
  if (quote.supersededBy) return "superseded";
  if (quote.status === "expired" || quote.validUntil < todayKey) return "expired";
  return "awaiting";
}

/**
 * The decision side of one quote, as the portal holds it: the decision when
 * there is one, or whether one can be made now and on which document.
 *
 *   open          the customer can accept or reject; documentSha256 is the
 *                 document a decision would be about, and goes back with
 *                 the form so a page older than the record is refused.
 *   decided       on record; see decision.
 *   expired | superseded | closed | not_document
 *                 no decision possible, for that reason.
 */
export type PortalQuoteDecisionState = "open" | "decided" | "expired" | "superseded" | "closed" | "not_document";

export type PortalQuoteDecision = {
  state: PortalQuoteDecisionState;
  documentSha256: string | null;
  termsEdition: string | null;
  decision?: {
    kind: QuoteDecisionKind;
    source: QuoteDecisionSource;
    decidedAt: string;
    rejectionReason?: string;
    /** The sign-in address of the member who decided in the portal; absent for a decision recorded by YM Creations. */
    decidedBy?: string;
  };
};

function decisionState(refusal: string | null): PortalQuoteDecisionState {
  if (refusal === null) return "open";
  if (refusal === "decided" || refusal === "expired" || refusal === "superseded" || refusal === "closed" || refusal === "not_document") return refusal;
  throw new Error(`offertebeslissing ${refusal}`);
}

export function quoteDecisionFromPortalRow(row: QuoteDecisionRow): PortalQuoteDecision {
  const state = decisionState(row.refusal);
  const decided = row.decision !== null && row.decided_at !== null;
  if (state === "decided" && !decided) throw new Error("offertebeslissing zonder beslissing");
  return {
    state,
    documentSha256: row.document_sha256,
    termsEdition: row.terms_edition,
    ...(decided && isQuoteDecisionKind(row.decision) && isQuoteDecisionSource(row.source)
      ? {
          decision: {
            kind: row.decision,
            source: row.source,
            decidedAt: row.decided_at!,
            ...(row.rejection_reason ? { rejectionReason: row.rejection_reason } : {}),
            ...(row.decided_by_email ? { decidedBy: row.decided_by_email } : {}),
          },
        }
      : {}),
  };
}

export function quoteTotals(quote: Pick<PortalQuote, "lines">): DocumentTotals {
  return calculateTotals(quote.lines);
}
