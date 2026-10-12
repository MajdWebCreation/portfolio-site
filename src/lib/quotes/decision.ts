/**
 * A decision on a quote, as both the admin and the portal speak about it.
 *
 * The record is `quote_decisions`: one per quote, written once, never changed.
 * It names what was decided on -- the hash of the stored PDF and the set of
 * general terms the quote was issued under -- copied from the frozen quote by
 * the database, never taken from a form. quotes.status follows it: the
 * database moves a quote to accepted or rejected only by inserting one of
 * these, and nothing moves it afterwards.
 */
export type QuoteDecisionKind = "accepted" | "rejected";

/** portal: the customer decided in the portal. The others: it reached YM Creations otherwise and an admin recorded it. */
export type QuoteDecisionSource = "portal" | "email" | "phone" | "signed" | "other";

export type OfflineDecisionSource = Exclude<QuoteDecisionSource, "portal">;

export const offlineDecisionSources: readonly OfflineDecisionSource[] = ["email", "phone", "signed", "other"];

export const quoteDecisionLabels: Record<QuoteDecisionKind, string> = {
  accepted: "Geaccepteerd",
  rejected: "Afgewezen",
};

export const quoteDecisionSourceLabels: Record<QuoteDecisionSource, string> = {
  portal: "Klantportaal",
  email: "E-mail",
  phone: "Telefoon",
  signed: "Ondertekend document",
  other: "Anders",
};

/** The longest reason or note the database takes. */
export const decisionTextMax = 2000;

/**
 * What a decision call can answer, besides a refusal of access.
 *
 *   decided          this call made the decision.
 *   already_decided  the same decision was already on record: a double click,
 *                    a retry after a lost answer.
 *   conflict         the other decision is on record.
 *   expired          past its date (portal only).
 *   superseded       a newer version of the quote exists.
 *   closed           the quote's status is not open for a decision.
 *   not_document     not a sent, stored document with recorded terms.
 *   stale            the page showed another document than the one on record.
 */
export type DecisionOutcome =
  | "decided"
  | "already_decided"
  | "conflict"
  | "expired"
  | "superseded"
  | "closed"
  | "not_document"
  | "stale";

const outcomes: readonly DecisionOutcome[] = ["decided", "already_decided", "conflict", "expired", "superseded", "closed", "not_document", "stale"];

export function isDecisionOutcome(value: unknown): value is DecisionOutcome {
  return typeof value === "string" && (outcomes as readonly string[]).includes(value);
}

export function isQuoteDecisionKind(value: unknown): value is QuoteDecisionKind {
  return value === "accepted" || value === "rejected";
}

export function isQuoteDecisionSource(value: unknown): value is QuoteDecisionSource {
  return typeof value === "string" && (quoteDecisionSourceLabels as Record<string, string>)[value] !== undefined;
}

export function isOfflineDecisionSource(value: unknown): value is OfflineDecisionSource {
  return value !== "portal" && isQuoteDecisionSource(value);
}

/**
 * A reason or note as the database will store it: trimmed, and nothing when
 * empty. The database applies the same rule and refuses control and
 * direction characters; this is the form's half of it.
 */
export function normalizeDecisionText(value: unknown): string | null {
  const text = typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
  return text === "" ? null : text;
}

const unsafeText = /[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/;

export function decisionTextProblem(value: string | null): string | null {
  if (value === null) return null;
  if (Array.from(value).length > decisionTextMax) return `Gebruik maximaal ${decisionTextMax} tekens.`;
  if (unsafeText.test(value)) return "Gebruik gewone tekst, zonder speciale tekens.";
  return null;
}

/** A hash shown short, the way a person compares two of them: the first and the last eight. */
export function shortHash(sha256: string): string {
  return sha256.length > 20 ? `${sha256.slice(0, 8)}…${sha256.slice(-8)}` : sha256;
}
