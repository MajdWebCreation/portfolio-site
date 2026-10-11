"use server";

import { revalidatePath } from "next/cache";
import { actionFailed, type ActionResult } from "@/lib/admin/action-result";
import { getCustomer } from "@/lib/admin/customers/repository";
import { adminDb, orNull } from "@/lib/admin/db";
import { snapshotToColumns } from "@/lib/admin/documents/mapper";
import { provisionalDocumentNumber } from "@/lib/admin/documents/numbering";
import { snapshotCustomer } from "@/lib/admin/documents/types";
import { addDays, daysBetween } from "@/lib/admin/documents/validation";
import { toDateKey } from "@/lib/admin/format";
import { findQuoteSuccessor, getQuote } from "@/lib/admin/quotes/repository";
import { isQuoteOutcomeStatus, quoteRevisionBlockedReason, quoteStatusLabels, type QuoteStatus } from "@/lib/admin/quotes/types";
import type { Json } from "@/lib/supabase/database.types";

/**
 * What happens to a quote after it was sent, now that a sent quote cannot
 * change: it gets a new version, or it gets a decision.
 */

function revalidate(ids: string[]) {
  revalidatePath("/admin/offertes");
  for (const id of ids) revalidatePath(`/admin/offertes/${id}`);
  revalidatePath("/admin");
}

/**
 * A new concept, made from a sent quote and naming it as the one it replaces.
 *
 * What is copied is a starting point, not a record: the subject, the intro,
 * the notes, the lines and the project. The customer is snapshotted afresh
 * from the customer record as it is now, because a new proposal goes out
 * under the customer's current address, not the one the old quote copied.
 * The dates are new -- today, and valid for as long as the old one was.
 *
 * Nothing about the old quote moves. The database refuses a second
 * successor, a successor of an accepted quote and a successor of one that
 * was never sent; the same rules are asked here first so the admin reads a
 * sentence rather than a constraint.
 */
export async function createQuoteRevision(id: string): Promise<ActionResult<string>> {
  const db = await adminDb();

  const quote = await getQuote(id);
  if (!quote) return { ok: false, error: "Deze offerte bestaat niet (meer)." };

  const blocked = quoteRevisionBlockedReason(quote);
  if (blocked) return { ok: false, error: blocked };

  const existing = await findQuoteSuccessor(id);
  if (existing) {
    return {
      ok: false,
      error: `${quote.number.value} heeft al een nieuwe versie: ${existing.number.value}.`,
    };
  }

  const customer = await getCustomer(quote.customer.customerId);
  if (!customer) return { ok: false, error: "De klant van deze offerte bestaat niet (meer)." };

  const today = toDateKey(new Date());
  const validity = Math.max(0, daysBetween(quote.issueDate, quote.validUntil));

  const created = await db
    .from("quotes")
    .insert({
      ...snapshotToColumns(snapshotCustomer(customer)),
      number_value: provisionalDocumentNumber("quote", Date.now().toString(36).slice(-5)).value,
      number_provisional: true,
      status: "draft",
      project_id: orNull(quote.projectId),
      issue_date: today,
      valid_until: addDays(today, validity),
      subject: quote.subject,
      intro: quote.intro,
      notes: quote.notes,
      supersedes_quote_id: id,
    })
    .select("id")
    .single();

  if (created.error || !created.data) {
    if (created.error?.code === "23505") {
      return { ok: false, error: `${quote.number.value} heeft al een nieuwe versie.` };
    }
    return actionFailed(created.error, "De nieuwe versie kon niet worden aangemaakt.");
  }

  const lines = await db.rpc("save_quote_lines", {
    p_quote_id: created.data.id,
    p_lines: quote.lines.map((line) => ({
      description: line.description,
      quantityHundredths: line.quantityHundredths,
      unitPriceCents: line.unitPriceCents,
      vatRate: line.vatRate,
    })) as unknown as Json,
  });
  if (lines.error) {
    /*
      The concept exists without its lines. It is a concept, so nothing is
      spent or sent; the admin is told, opens it, and adds the lines by hand
      or removes it.
    */
    console.error("Quote revision created but lines failed", { id, revision: created.data.id, error: lines.error });
    return {
      ok: false,
      error: `De nieuwe versie is aangemaakt, maar de regels konden niet worden gekopieerd: ${lines.error.message}`,
    };
  }

  revalidate([id, created.data.id]);
  return { ok: true, value: created.data.id };
}

/**
 * What became of a sent quote: accepted, rejected or expired -- or back to
 * plain "sent" when a decision was recorded by mistake.
 *
 * Administrative for now: the admin records what the customer said. The
 * portal's own accept/reject will replace this with a decision the customer
 * makes; until then this is the one place a sent quote's status moves, and
 * it moves nothing else.
 */
export async function setQuoteOutcome(id: string, status: string): Promise<ActionResult<QuoteStatus>> {
  if (!isQuoteOutcomeStatus(status)) return { ok: false, error: "Kies een geldige status." };

  const db = await adminDb();

  const quote = await getQuote(id);
  if (!quote) return { ok: false, error: "Deze offerte bestaat niet (meer)." };
  if (!quote.sentAt) return { ok: false, error: "Een status geef je aan een verzonden offerte." };
  if (quote.status === status) return { ok: true, value: status };

  const { error } = await db.from("quotes").update({ status }).eq("id", id);
  if (error) return actionFailed(error, `De status kon niet op ${quoteStatusLabels[status]} worden gezet.`);

  revalidate([id]);
  return { ok: true, value: status };
}
