"use server";

import { revalidatePath } from "next/cache";
import { actionFailed, referenceFailed, type ActionResult } from "@/lib/admin/action-result";
import { adminDb, orNull } from "@/lib/admin/db";
import { snapshotToColumns } from "@/lib/admin/documents/mapper";
import type { CustomerSnapshot, DocumentLine } from "@/lib/admin/documents/types";
import { hasLineErrors, validateDates, validateLine } from "@/lib/admin/documents/validation";
import { isInvoiceStatus } from "@/lib/admin/invoices/types";
import type { Json } from "@/lib/supabase/database.types";

export type InvoiceInput = {
  status: string;
  customer: CustomerSnapshot;
  /** Project to file this invoice under; always one of the customer's own. */
  projectId?: string;
  issueDate: string;
  dueDate: string;
  paymentReference: string;
  lines: DocumentLine[];
  notes: string;
};

/** See quotes/actions.ts: the builder's rules, applied again on the server. */
function validate(input: InvoiceInput): string | null {
  if (!isInvoiceStatus(input.status)) return "Kies een geldige status.";
  if (!input.customer.customerId) return "Kies een klant.";

  const dates = validateDates(input.issueDate, input.dueDate, "De vervaldatum");
  if (dates.issueDate) return dates.issueDate;
  if (dates.laterDate) return dates.laterDate;

  if (input.lines.length === 0) return "Voeg minstens één regel toe.";
  if (input.lines.some((line) => hasLineErrors(validateLine(line)))) return "Controleer de gemarkeerde regels.";
  return null;
}

function linesPayload(lines: DocumentLine[]): Json {
  return lines.map((line) => ({
    description: line.description,
    quantityHundredths: line.quantityHundredths,
    unitPriceCents: line.unitPriceCents,
    vatRate: line.vatRate,
  })) as unknown as Json;
}

export async function saveInvoice(
  id: string | null,
  input: InvoiceInput,
  numberValue: string,
): Promise<ActionResult<string>> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const db = await adminDb();
  const row = {
    ...snapshotToColumns(input.customer),
    // A reference, not a copy. The database checks it against the customer's
    // projects and, when the invoice also names a quote, against that quote's
    // project as well.
    project_id: orNull(input.projectId),
    status: input.status,
    issue_date: input.issueDate,
    due_date: input.dueDate,
    payment_reference: input.paymentReference,
    notes: input.notes,
  };

  /*
    An invoice that has been sent is the document the customer holds, and its
    figures may not move afterwards: two versions of one invoice number is the
    one thing an administration must never produce. The database refuses such
    an update outright; this check is here so the admin reads a sentence
    instead of a constraint. Status is not touched by that rule -- the payment
    system has to be able to move sent -> paid -> overdue.
  */
  if (id) {
    const { data: existing, error: readError } = await db
      .from("invoices")
      .select("sent_at, number_value")
      .eq("id", id)
      .maybeSingle();
    if (readError) return actionFailed(readError, "Factuur laden mislukt.");
    if (existing?.sent_at) {
      return {
        ok: false,
        error: `Factuur ${existing.number_value} is al verstuurd. De gegevens liggen vast; corrigeren kan alleen met een creditfactuur.`,
      };
    }
  }

  const saved = id
    ? await db.from("invoices").update(row).eq("id", id).select("id").single()
    : await db.from("invoices").insert({ ...row, number_value: numberValue, number_provisional: true }).select("id").single();

  if (saved.error || !saved.data) {
    return referenceFailed(
      saved.error,
      "Het gekozen project bestaat niet meer, hoort niet bij deze klant, of spreekt de gekoppelde offerte tegen.",
      "Factuur opslaan mislukt.",
    );
  }

  const { error: linesError } = await db.rpc("save_invoice_lines", {
    p_invoice_id: saved.data.id,
    p_lines: linesPayload(input.lines),
  });
  if (linesError) return actionFailed(linesError, "Regels opslaan mislukt.");

  revalidatePath("/admin/facturen");
  revalidatePath(`/admin/facturen/${saved.data.id}`);
  revalidatePath("/admin");
  return { ok: true, value: saved.data.id };
}
