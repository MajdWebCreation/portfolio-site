"use server";

import { revalidatePath } from "next/cache";
import { actionFailed, type ActionResult } from "@/lib/admin/action-result";
import { requireAdmin } from "@/lib/admin/access";
import { adminDb } from "@/lib/admin/db";
import {
  decisionTextProblem,
  isOfflineDecisionSource,
  isQuoteDecisionKind,
  normalizeDecisionText,
  quoteDecisionLabels,
  type DecisionOutcome,
} from "@/lib/quotes/decision";
import { notifyQuoteDecisionOn } from "@/lib/quotes/decision-notify";

/**
 * The admin's two moves on a decision, and nothing that changes one.
 *
 * Recording a decision that reached YM Creations outside the portal -- by
 * mail, by phone, as a signed copy -- goes through
 * admin_record_quote_decision: the same table, the same frozen snapshot of
 * the document and its terms, the same one-per-quote rule as the portal. A
 * quote decided in the portal cannot be decided again here, and what is
 * recorded here is not editable afterwards either.
 *
 * Retrying the mails of a portal decision only ever touches the
 * notification row, under the same lease as the portal and the daily job.
 */
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RecordDecisionInput = { decision: string; source: string; rejectionReason?: string; note?: string };

const refusals: Partial<Record<DecisionOutcome, string>> = {
  conflict: "Over deze offerte is al een beslissing vastgelegd (zie hieronder); die ligt vast en wordt niet vervangen.",
  superseded: "Er bestaat een nieuwere versie van deze offerte; leg de beslissing daar vast.",
  closed: "Deze offerte staat niet open voor een beslissing.",
  not_document: "Alleen over een verzonden offerte met opgeslagen PDF en voorwaardenversie wordt een beslissing vastgelegd.",
};

function revalidate(id: string) {
  revalidatePath("/admin/offertes");
  revalidatePath(`/admin/offertes/${id}`);
  revalidatePath("/admin");
}

export async function recordQuoteDecision(quoteId: string, input: RecordDecisionInput): Promise<ActionResult<"decided" | "already_decided">> {
  if (!uuid.test(quoteId)) return { ok: false, error: "Onbekende offerte." };
  if (!isQuoteDecisionKind(input.decision)) return { ok: false, error: "Kies geaccepteerd of afgewezen." };
  if (!isOfflineDecisionSource(input.source)) return { ok: false, error: "Kies hoe de beslissing binnenkwam." };

  const reason = input.decision === "rejected" ? normalizeDecisionText(input.rejectionReason) : null;
  const note = normalizeDecisionText(input.note);
  const problem = decisionTextProblem(reason) ?? decisionTextProblem(note);
  if (problem) return { ok: false, error: problem };

  await requireAdmin();
  const db = await adminDb();
  const { data, error } = await db.rpc("admin_record_quote_decision", {
    p_quote_id: quoteId,
    p_decision: input.decision,
    p_source: input.source,
    p_rejection_reason: reason,
    p_note: note,
  });
  if (error) {
    if (error.code === "42501") return { ok: false, error: "Alleen een beheerder legt een beslissing vast." };
    if (error.code === "P0002") return { ok: false, error: "Deze offerte bestaat niet (meer)." };
    if (error.code === "22023") return { ok: false, error: "Gebruik gewone tekst, zonder speciale tekens, en maximaal 2000 tekens." };
    return actionFailed(error, "De beslissing kon niet worden vastgelegd.");
  }

  const outcome = data?.[0]?.outcome as DecisionOutcome | undefined;
  revalidate(quoteId);
  if (outcome === "decided" || outcome === "already_decided") return { ok: true, value: outcome };
  if (outcome && refusals[outcome]) return { ok: false, error: refusals[outcome]! };
  return { ok: false, error: `De beslissing (${quoteDecisionLabels[input.decision]}) kon niet worden vastgelegd.` };
}

/** The mails of a portal decision whose earlier send failed, through the same lease as the portal's. */
export async function retryQuoteDecisionMail(quoteId: string): Promise<ActionResult<"sent" | "skipped">> {
  if (!uuid.test(quoteId)) return { ok: false, error: "Onbekende offerte." };
  await requireAdmin();
  const db = await adminDb();
  const { data, error } = await db.from("quote_decisions").select("id, customer_id, source").eq("quote_id", quoteId).maybeSingle();
  if (error) return actionFailed(error, "Beslissing laden mislukt.");
  if (!data) return { ok: false, error: "Over deze offerte is nog niet beslist." };
  if (data.source !== "portal") return { ok: false, error: "Alleen een beslissing uit het klantportaal krijgt een bevestiging per mail." };

  const outcome = await notifyQuoteDecisionOn(db, data.customer_id, data.id);
  revalidate(quoteId);
  if (outcome.state === "failed") return { ok: false, error: `Versturen mislukt: ${outcome.reason.replace(/\.$/, "")}.` };
  if (outcome.state === "sent" && !outcome.internal.sent) return { ok: false, error: `Interne melding mislukt: ${outcome.internal.reason.replace(/\.$/, "")}.` };
  return { ok: true, value: outcome.state };
}
