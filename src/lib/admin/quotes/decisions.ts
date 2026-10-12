import { adminDb, failed } from "@/lib/admin/db";
import { isQuoteDecisionKind, isQuoteDecisionSource, type QuoteDecisionKind, type QuoteDecisionSource } from "@/lib/quotes/decision";

/**
 * The decision on one quote, as the admin reads it: everything on the
 * record, including the internal note and who recorded an offline decision,
 * and -- for a portal decision -- whether its two mails went out.
 */
export type AdminQuoteDecision = {
  id: string;
  decision: QuoteDecisionKind;
  source: QuoteDecisionSource;
  decidedAt: string;
  rejectionReason?: string;
  note?: string;
  actorEmail?: string;
  documentSha256: string;
  termsEdition: string;
  termsPublishedOn: string;
  /** The customer ticked "gelezen en akkoord" (portal acceptances). */
  termsConfirmed: boolean;
  /** Portal decisions only. */
  notification?: { customerNotifiedAt?: string; internalNotifiedAt?: string; attempts: number; claimedAt?: string };
};

export async function getQuoteDecision(quoteId: string): Promise<AdminQuoteDecision | undefined> {
  const db = await adminDb();
  const { data, error } = await db
    .from("quote_decisions")
    .select(
      "id, decision, source, decided_at, rejection_reason, note, actor_email, quote_document_sha256, terms_edition, terms_published_on, terms_confirmed, quote_decision_notifications ( customer_notified_at, internal_notified_at, attempts, claimed_at )",
    )
    .eq("quote_id", quoteId)
    .maybeSingle();
  failed("Offertebeslissing laden", error);
  if (!data) return undefined;
  if (!isQuoteDecisionKind(data.decision) || !isQuoteDecisionSource(data.source)) {
    throw new Error(`Offertebeslissing laden: onbekende waarde ${data.decision}/${data.source}`);
  }
  const notice = Array.isArray(data.quote_decision_notifications) ? data.quote_decision_notifications[0] : data.quote_decision_notifications;
  return {
    id: data.id,
    decision: data.decision,
    source: data.source,
    decidedAt: data.decided_at,
    documentSha256: data.quote_document_sha256,
    termsEdition: data.terms_edition,
    termsPublishedOn: data.terms_published_on,
    termsConfirmed: data.terms_confirmed,
    ...(data.rejection_reason ? { rejectionReason: data.rejection_reason } : {}),
    ...(data.note ? { note: data.note } : {}),
    ...(data.actor_email ? { actorEmail: data.actor_email } : {}),
    ...(notice
      ? {
          notification: {
            attempts: notice.attempts,
            ...(notice.customer_notified_at ? { customerNotifiedAt: notice.customer_notified_at } : {}),
            ...(notice.internal_notified_at ? { internalNotifiedAt: notice.internal_notified_at } : {}),
            ...(notice.claimed_at ? { claimedAt: notice.claimed_at } : {}),
          },
        }
      : {}),
  };
}
