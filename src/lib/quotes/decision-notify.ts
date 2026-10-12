import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCustomerRecipient } from "@/lib/admin/communications/recipient";
import { isQuoteDecisionKind } from "@/lib/quotes/decision";
import { sendDecisionConfirmation, sendInternalDecisionNotice, type DecisionMailContent } from "@/lib/quotes/decision-mail";
import type { MailOutcome } from "@/lib/requests/mail";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Sending the mails of a portal decision, the way a request is announced
 * (lib/requests/announce.ts): a lease on the notification row so one sender
 * at a time, each mail marked once it went, a failed send giving the lease
 * back for the next try, and a provider idempotency key per mail so even a
 * lost answer does not become a second mail.
 *
 * Only this row moves. The decision is on record before the first attempt
 * and stays whatever the mail does; there is nothing here that could undo it.
 *
 * Runs on the client the caller holds: the portal's boundary hands the
 * system client (the member has no write here), the admin's retry its own
 * session (row level security and a column grant).
 */
export const notifyLeaseMinutes = 10;

export type NotifyOutcome =
  | { state: "sent"; internal: MailOutcome }
  | { state: "failed"; reason: string }
  | { state: "skipped" };

type Db = SupabaseClient<Database>;

type Claimed = {
  decision_id: string;
  customer_id: string;
  attempts: number;
  customer_notified_at: string | null;
  internal_notified_at: string | null;
  quote_decisions: {
    quote_id: string;
    quote_number: string;
    decision: string;
    decided_at: string;
    terms_edition: string;
    rejection_reason: string | null;
    actor_email: string | null;
  } | null;
  customers: { company_name: string } | null;
};

export async function notifyQuoteDecisionOn(db: Db, customerId: string, decisionId: string, now = new Date()): Promise<NotifyOutcome> {
  const claimedAt = now.toISOString();
  const staleBefore = new Date(now.getTime() - notifyLeaseMinutes * 60_000).toISOString();

  const { data, error } = await db
    .from("quote_decision_notifications")
    .update({ claimed_at: claimedAt })
    .eq("decision_id", decisionId)
    .eq("customer_id", customerId)
    .or("customer_notified_at.is.null,internal_notified_at.is.null")
    .or(`claimed_at.is.null,claimed_at.lt.${staleBefore}`)
    .select(
      "decision_id, customer_id, attempts, customer_notified_at, internal_notified_at, quote_decisions!inner(quote_id, quote_number, decision, decided_at, terms_edition, rejection_reason, actor_email), customers!inner(company_name)",
    )
    .maybeSingle();
  if (error) return { state: "failed", reason: error.message };
  /* Both mails went already, or someone else is sending them right now. */
  if (!data) return { state: "skipped" };
  const row = data as unknown as Claimed;
  const decision = row.quote_decisions;
  if (!decision || !isQuoteDecisionKind(decision.decision)) {
    await release(db, row, claimedAt, {});
    return { state: "failed", reason: "De beslissing bij deze melding ontbreekt." };
  }

  const content: DecisionMailContent = {
    decisionId: row.decision_id,
    quoteId: decision.quote_id,
    quoteNumber: decision.quote_number,
    decision: decision.decision,
    decidedAt: decision.decided_at,
    termsEdition: decision.terms_edition,
    rejectionReason: decision.rejection_reason,
  };

  let confirmation: MailOutcome = { sent: true };
  if (!row.customer_notified_at) {
    try {
      const recipient = await resolveCustomerRecipient(db, customerId, "general");
      confirmation = recipient.ok
        ? await sendDecisionConfirmation({ db, customerId, category: "quote_decision_received", quoteId: decision.quote_id }, recipient.recipient, content)
        : { sent: false, reason: recipient.reason };
    } catch (caught) {
      confirmation = { sent: false, reason: caught instanceof Error ? caught.message : "onbekende fout" };
    }
  }

  let internal: MailOutcome = { sent: true };
  if (!row.internal_notified_at) {
    internal = await sendInternalDecisionNotice({
      ...content,
      companyName: row.customers?.company_name ?? "Onbekende klant",
      actorEmail: decision.actor_email,
    }).catch((caught: unknown) => ({ sent: false as const, reason: caught instanceof Error ? caught.message : "onbekende fout" }));
  }

  await release(db, row, claimedAt, {
    ...(!row.customer_notified_at && confirmation.sent ? { customer_notified_at: new Date().toISOString() } : {}),
    ...(!row.internal_notified_at && internal.sent ? { internal_notified_at: new Date().toISOString() } : {}),
  });

  if (!confirmation.sent || !internal.sent) {
    console.error("Quote decision mail not sent", { decisionId: row.decision_id, confirmation: confirmation.sent, internal: internal.sent });
  }
  return confirmation.sent ? { state: "sent", internal } : { state: "failed", reason: confirmation.reason };
}

/** Released or completed only by the holder of this very lease. */
async function release(db: Db, row: Claimed, claimedAt: string, marks: { customer_notified_at?: string; internal_notified_at?: string }) {
  /*
    Tried twice: a mail that went out but was not marked would be sent again
    by the next pass, and that pass may come after the provider's own
    idempotency window has closed.
  */
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { error } = await db
      .from("quote_decision_notifications")
      .update({ claimed_at: null, attempts: row.attempts + 1, ...marks })
      .eq("decision_id", row.decision_id)
      .eq("claimed_at", claimedAt);
    if (!error) return;
    console.error("Quote decision lease not released", { decisionId: row.decision_id, code: error.code, attempt });
  }
}

/**
 * The daily second chance, run by the announcements cron: every portal
 * decision of the last week whose mails did not both go out, older than a
 * quarter of an hour so the decision's own attempt and lease are over. The
 * least tried first, at most fifty per run.
 */
export const decisionSweepWindow = { minMinutes: 15, maxDays: 7, limit: 50 } as const;

export type DecisionSweepSummary = { considered: number; sent: number; failed: number; skipped: number };

export async function notifyPendingQuoteDecisions(db: Db, now = new Date()): Promise<DecisionSweepSummary> {
  const { data, error } = await db
    .from("quote_decision_notifications")
    .select("decision_id, customer_id")
    .or("customer_notified_at.is.null,internal_notified_at.is.null")
    .lt("created_at", new Date(now.getTime() - decisionSweepWindow.minMinutes * 60_000).toISOString())
    .gt("created_at", new Date(now.getTime() - decisionSweepWindow.maxDays * 24 * 3600_000).toISOString())
    .order("attempts", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(decisionSweepWindow.limit);
  if (error) throw new Error(`Onverstuurde beslissingsmails zoeken: ${error.message}`);

  const summary: DecisionSweepSummary = { considered: data.length, sent: 0, failed: 0, skipped: 0 };
  for (const row of data) {
    const outcome = await notifyQuoteDecisionOn(db, row.customer_id, row.decision_id, now);
    if (outcome.state === "sent" && outcome.internal.sent) summary.sent += 1;
    else if (outcome.state === "skipped") summary.skipped += 1;
    else summary.failed += 1;
  }
  return summary;
}
