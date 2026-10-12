"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rateLimit } from "@/lib/payments/rate-limit";
import { getPortalAccess } from "@/lib/portal/auth";
import { portalLoginPath, portalNoAccessPath, portalQuotePath, portalQuotesPath } from "@/lib/portal/paths";
import { notifyQuoteDecision } from "@/lib/portal/privileged";
import { portalReader } from "@/lib/portal/rpc";
import {
  decisionTextProblem,
  isDecisionOutcome,
  isQuoteDecisionKind,
  normalizeDecisionText,
  type DecisionOutcome,
  type QuoteDecisionKind,
} from "@/lib/quotes/decision";

/**
 * "Offerte accepteren" and "Offerte definitief afwijzen" on
 * /portaal/offertes/[id].
 *
 * Who decides, and for which customer, comes from the session; the form's
 * customer id is only compared, so a page left open from before a switch of
 * company cannot decide for the other one. The document and the terms the
 * decision is about are not the form's to name: portal_decide_quote copies
 * them from the frozen quote. The form only carries the hash of the document
 * the page showed, and the database refuses the decision when that is not
 * the one on record -- a page older than the quote.
 *
 * The decision is made in one transaction and is on record before any mail
 * is attempted. The mails follow, under their own lease; whatever they do,
 * the decision stands, and a failed one is retried later.
 */
export type DecideQuoteState =
  | { status: "idle" }
  | { status: "decided"; decision: QuoteDecisionKind; already: boolean }
  | { status: "invalid"; field: "confirmation" | "rejectionReason"; message: string }
  | { status: "refused" | "stale_customer" | "error"; message: string };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha256 = /^[0-9a-f]{64}$/;

const messages = {
  staleCustomer: "U werkt inmiddels voor een ander bedrijf in het portaal. Laad de pagina opnieuw voordat u een offerte beantwoordt.",
  denied: "U heeft geen toegang (meer) tot de offertes van dit bedrijf.",
  busy: "U heeft net een paar keer op de knop gedrukt. Wacht een minuut en probeer het dan opnieuw.",
  failed: "Dat lukte nu niet. Probeer het over een minuut opnieuw; uw beslissing wordt nooit dubbel vastgelegd.",
  confirmation: "Vink aan dat u de offerte en de voorwaarden heeft gelezen en ermee akkoord gaat.",
};

const refusals: Partial<Record<DecisionOutcome, string>> = {
  conflict: "Over deze offerte is al anders beslist, mogelijk door een collega. Een beslissing kan niet worden gewijzigd. Laad de pagina opnieuw om te zien wat er is vastgelegd.",
  expired: "Deze offerte is verlopen. Neem contact met ons op als u een nieuwe versie wilt ontvangen.",
  superseded: "Er is een nieuwere versie van deze offerte. Laad de pagina opnieuw; u beantwoordt de nieuwste versie.",
  closed: "Deze offerte staat niet meer open voor een reactie. Laad de pagina opnieuw.",
  not_document: "Deze offerte kan niet in het portaal worden beantwoord. Neem contact met ons op.",
  stale: "Deze pagina is niet meer actueel. Laad de pagina opnieuw en bekijk de offerte voordat u beslist.",
};

export async function decideQuoteAction(_previous: DecideQuoteState, formData: FormData): Promise<DecideQuoteState> {
  const access = await getPortalAccess();
  if (access.state === "anonymous") redirect(portalLoginPath);
  if (access.state === "no_membership") redirect(portalNoAccessPath);

  const identity = access.member;
  const customerId = identity.current.customerId;
  if (String(formData.get("customerId") ?? "") !== customerId) return { status: "stale_customer", message: messages.staleCustomer };

  const quoteId = String(formData.get("quoteId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const expected = String(formData.get("documentSha256") ?? "");
  if (!uuid.test(quoteId) || !isQuoteDecisionKind(decision) || !sha256.test(expected)) return { status: "error", message: messages.failed };

  const confirmed = formData.get("confirmTerms") === "on";
  if (decision === "accepted" && !confirmed) return { status: "invalid", field: "confirmation", message: messages.confirmation };

  const reason = decision === "rejected" ? normalizeDecisionText(formData.get("rejectionReason")) : null;
  const problem = decisionTextProblem(reason);
  if (problem) return { status: "invalid", field: "rejectionReason", message: problem };

  if (!rateLimit(`portal-quote-decision:${identity.userId}`, 10, 60).allowed) return { status: "error", message: messages.busy };

  const db = await portalReader();
  const { data, error } = await db.rpc("portal_decide_quote", {
    p_customer_id: customerId,
    p_quote_id: quoteId,
    p_decision: decision,
    p_expected_sha256: expected,
    p_terms_confirmed: decision === "accepted" ? confirmed : false,
    p_rejection_reason: reason,
  });

  if (error) {
    if (error.code === "42501") return { status: "error", message: messages.denied };
    if (error.code === "22023") {
      if (error.message === "invalid:confirmation") return { status: "invalid", field: "confirmation", message: messages.confirmation };
      if (error.message === "invalid:rejection_reason") return { status: "invalid", field: "rejectionReason", message: "Gebruik gewone tekst, zonder speciale tekens, en maximaal 2000 tekens." };
    }
    console.error("Portal quote decision failed", { code: error.code });
    return { status: "error", message: messages.failed };
  }

  const row = data?.[0];
  const outcome = row?.outcome;
  if (!row || !isDecisionOutcome(outcome)) return { status: "error", message: messages.failed };

  revalidatePath(portalQuotePath(quoteId));
  revalidatePath(portalQuotesPath);

  if (outcome !== "decided" && outcome !== "already_decided") {
    return { status: "refused", message: refusals[outcome] ?? messages.failed };
  }

  /*
    The confirmation and the internal notice, once per decision: a retry of
    the same decision asks again, and the lease and the idempotency keys
    inside let at most one of them send. Whatever the mail does, the decision
    is on record.
  */
  if (row.decision_id) {
    try {
      await notifyQuoteDecision({ userId: identity.userId, customerId }, row.decision_id);
    } catch (caught) {
      console.error("Quote decision mail failed", { decisionId: row.decision_id, error: caught instanceof Error ? caught.message : caught });
    }
  }

  return { status: "decided", decision, already: outcome === "already_decided" };
}
