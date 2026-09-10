"use server";

import { revalidatePath } from "next/cache";
import { actionFailed, type ActionResult } from "@/lib/admin/action-result";
import { adminDb } from "@/lib/admin/db";
import { snapshotToColumns } from "@/lib/admin/documents/mapper";
import type { CustomerSnapshot, DocumentLine } from "@/lib/admin/documents/types";
import { hasLineErrors, validateDates, validateLine } from "@/lib/admin/documents/validation";
import { isQuoteStatus } from "@/lib/admin/quotes/types";
import type { Json } from "@/lib/supabase/database.types";

export type QuoteInput = {
  status: string;
  customer: CustomerSnapshot;
  issueDate: string;
  validUntil: string;
  subject: string;
  intro: string;
  lines: DocumentLine[];
  notes: string;
};

/**
 * The same rules the builder applies, applied again on the server: a form is
 * a convenience, not a boundary. Line and date checks come from
 * `documents/validation.ts`, so there is one set of rules.
 */
function validate(input: QuoteInput): string | null {
  if (!isQuoteStatus(input.status)) return "Kies een geldige status.";
  if (!input.customer.customerId) return "Kies een klant.";
  if (!input.subject.trim()) return "Vul een onderwerp in.";

  const dates = validateDates(input.issueDate, input.validUntil, "De geldigheidsdatum");
  if (dates.issueDate) return dates.issueDate;
  if (dates.laterDate) return dates.laterDate;

  if (input.lines.length === 0) return "Voeg minstens één regel toe.";
  if (input.lines.some((line) => hasLineErrors(validateLine(line)))) return "Controleer de gemarkeerde regels.";
  return null;
}

/** Lines as the save function expects them; it writes `position` from the order. */
function linesPayload(lines: DocumentLine[]): Json {
  return lines.map((line) => ({
    description: line.description,
    quantityHundredths: line.quantityHundredths,
    unitPriceCents: line.unitPriceCents,
    vatRate: line.vatRate,
  })) as unknown as Json;
}

/**
 * Creates or updates a quote and replaces its lines. The line replacement
 * runs in `save_quote_lines`, one transaction, so a failure never leaves a
 * document without lines.
 */
export async function saveQuote(
  id: string | null,
  input: QuoteInput,
  numberValue: string,
): Promise<ActionResult<string>> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const db = await adminDb();
  const row = {
    ...snapshotToColumns(input.customer),
    status: input.status,
    issue_date: input.issueDate,
    valid_until: input.validUntil,
    subject: input.subject.trim(),
    intro: input.intro,
    notes: input.notes,
  };

  const saved = id
    ? await db.from("quotes").update(row).eq("id", id).select("id").single()
    : await db.from("quotes").insert({ ...row, number_value: numberValue, number_provisional: true }).select("id").single();

  if (saved.error || !saved.data) return actionFailed(saved.error, "Offerte opslaan mislukt.");

  const { error: linesError } = await db.rpc("save_quote_lines", {
    p_quote_id: saved.data.id,
    p_lines: linesPayload(input.lines),
  });
  if (linesError) return actionFailed(linesError, "Regels opslaan mislukt.");

  revalidatePath("/admin/offertes");
  revalidatePath(`/admin/offertes/${saved.data.id}`);
  revalidatePath("/admin");
  return { ok: true, value: saved.data.id };
}
