"use server";

import { revalidatePath } from "next/cache";
import { actionFailed, type ActionResult } from "@/lib/admin/action-result";
import { adminDb } from "@/lib/admin/db";
import { snapshotToColumns } from "@/lib/admin/documents/mapper";
import type { CustomerSnapshot, DocumentLine } from "@/lib/admin/documents/types";
import { hasLineErrors, validateDates, validateLine } from "@/lib/admin/documents/validation";
import { isInvoiceStatus } from "@/lib/admin/invoices/types";
import type { Json } from "@/lib/supabase/database.types";

export type InvoiceInput = {
  status: string;
  customer: CustomerSnapshot;
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
    status: input.status,
    issue_date: input.issueDate,
    due_date: input.dueDate,
    payment_reference: input.paymentReference,
    notes: input.notes,
  };

  const saved = id
    ? await db.from("invoices").update(row).eq("id", id).select("id").single()
    : await db.from("invoices").insert({ ...row, number_value: numberValue, number_provisional: true }).select("id").single();

  if (saved.error || !saved.data) return actionFailed(saved.error, "Factuur opslaan mislukt.");

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
