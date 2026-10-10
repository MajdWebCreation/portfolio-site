import type { SupabaseClient } from "@supabase/supabase-js";
import { creditNoteColumns, creditNoteFromRow, type CreditNoteRow } from "@/lib/admin/credit-notes/mapper";
import { isFinanciallyIssued, type CreditNote, type CreditNoteSource } from "@/lib/admin/credit-notes/types";
import type { DocumentLine } from "@/lib/admin/documents/types";
import { storeInvoiceArtifact } from "@/lib/admin/invoices/artifact";
import { renderCreditNotePdf } from "@/lib/admin/pdf/to-buffer";
import { allowedVatRates, calculateTotals, lineNetCents, type DocumentTotals } from "@/lib/money";
import type { Database, Json } from "@/lib/supabase/database.types";

/**
 * Making a credit note: one statement for the record, then the number, then
 * the PDF, then the completion -- the same four steps an invoice takes, for
 * the same reasons (see invoices/issue.ts). There is no concept stage: a
 * credit note is made from an invoice the customer already has, by an admin
 * who has just confirmed its figures on screen, and a document that waits
 * in a drawer corrects nothing.
 *
 * Nothing here mails anything and nothing here refunds anything. Both are
 * separate decisions, taken on the credit note's own page.
 */
type Db = SupabaseClient<Database>;

export type CreditNoteLineInput = Pick<DocumentLine, "description" | "quantityHundredths" | "unitPriceCents" | "vatRate">;

export type CreditNoteDraft = {
  invoiceId: string;
  reason: string;
  /** YYYY-MM-DD; the date on the document. */
  issueDate: string;
  lines: CreditNoteLineInput[];
  source: CreditNoteSource;
  recurringServiceId?: string;
};

export type CreateCreditNoteResult =
  | { ok: true; creditNote: CreditNote; reused: boolean }
  | { ok: false; error: string };

/** Lines a document can carry; a wrong one names its problem. */
export function creditNoteLinesInvalid(lines: readonly CreditNoteLineInput[]): string | null {
  if (lines.length === 0) return "Voeg minstens één regel toe.";
  for (const line of lines) {
    if (!line.description.trim()) return "Elke regel heeft een omschrijving nodig.";
    if (!Number.isSafeInteger(line.quantityHundredths) || line.quantityHundredths <= 0) return "Het aantal moet groter dan nul zijn.";
    if (!Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents < 0) return "Het bedrag per regel kan niet negatief zijn.";
    if (!allowedVatRates.includes(line.vatRate)) return "Kies een geldig btw-percentage.";
  }
  return null;
}

/** The totals of a draft, through the one VAT arithmetic. */
export function creditNoteTotals(lines: readonly CreditNoteLineInput[]): DocumentTotals {
  return calculateTotals(lines);
}

/** Net room left per VAT rate: what the invoice charged minus what was credited. */
export function creditRoomByRate(invoiceLines: readonly CreditNoteLineInput[], creditedLines: readonly CreditNoteLineInput[]): Map<number, number> {
  const room = new Map<number, number>();
  for (const line of invoiceLines) room.set(line.vatRate, (room.get(line.vatRate) ?? 0) + lineNetCents(line));
  for (const line of creditedLines) room.set(line.vatRate, (room.get(line.vatRate) ?? 0) - lineNetCents(line));
  return room;
}

/** Nothing left to credit at any rate. */
export function isFullyCredited(invoiceLines: readonly CreditNoteLineInput[], creditedLines: readonly CreditNoteLineInput[]): boolean {
  return [...creditRoomByRate(invoiceLines, creditedLines).values()].every((room) => room <= 0);
}

/**
 * The cap, per VAT rate, on net amounts: what this draft credits plus what
 * earlier notes credited may not exceed what the invoice charged at that
 * rate. The database checks the same thing under a lock; this is the
 * sentence the admin reads instead of a constraint.
 */
export function creditCapExceeded(input: {
  invoiceLines: readonly CreditNoteLineInput[];
  creditedLines: readonly CreditNoteLineInput[];
  draftLines: readonly CreditNoteLineInput[];
}): string | null {
  const netByRate = (lines: readonly CreditNoteLineInput[]) => {
    const map = new Map<number, number>();
    for (const line of lines) map.set(line.vatRate, (map.get(line.vatRate) ?? 0) + lineNetCents(line));
    return map;
  };
  const invoiced = netByRate(input.invoiceLines);
  const credited = netByRate(input.creditedLines);
  for (const [rate, net] of netByRate(input.draftLines)) {
    const room = (invoiced.get(rate) ?? 0) - (credited.get(rate) ?? 0);
    if (net > room) {
      return room <= 0
        ? `Bij ${rate}% btw is deze factuur al volledig gecrediteerd.`
        : `Bij ${rate}% btw kan nog maximaal ${(room / 100).toFixed(2).replace(".", ",")} euro excl. btw worden gecrediteerd.`;
    }
  }
  return null;
}

async function readCreditNote(db: Db, id: string): Promise<CreditNote | undefined> {
  const { data, error } = await db.from("credit_notes").select(creditNoteColumns).eq("id", id).maybeSingle();
  if (error) throw new Error(`Creditnota laden: ${error.message}`);
  return data ? creditNoteFromRow(data as unknown as CreditNoteRow) : undefined;
}

async function readInvoiceNumber(db: Db, invoiceId: string): Promise<string> {
  const { data, error } = await db.from("invoices").select("number_value").eq("id", invoiceId).maybeSingle();
  if (error) throw new Error(`Factuur laden: ${error.message}`);
  if (!data) throw new Error("Deze factuur bestaat niet (meer).");
  return data.number_value;
}

/** The lines of every issued credit note on an invoice, for the cap. */
export async function creditedLinesOnInvoice(db: Db, invoiceId: string): Promise<CreditNoteLineInput[]> {
  const { data, error } = await db.from("credit_notes").select(creditNoteColumns).eq("invoice_id", invoiceId);
  if (error) throw new Error(`Creditnota's laden: ${error.message}`);
  return ((data ?? []) as unknown as CreditNoteRow[]).map(creditNoteFromRow).flatMap((note) => note.lines);
}

function completionResult(value: unknown): { number: string; path: string; sha256: string; bytes: number } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { number, path, sha256, bytes } = value as Record<string, unknown>;
  if (typeof number !== "string" || typeof path !== "string" || typeof sha256 !== "string" || typeof bytes !== "number") return undefined;
  return { number, path, sha256, bytes };
}

export type IssueCreditNoteResult = { ok: true; creditNote: CreditNote; adopted: boolean } | { ok: false; error: string };

/** Number, render, store, record. Idempotent: a note that is a document already is handed back as it is. */
export async function issueCreditNoteDocument(db: Db, creditNoteId: string): Promise<IssueCreditNoteResult> {
  const numbered = await db.rpc("begin_credit_note_issue", { p_credit_note_id: creditNoteId });
  if (numbered.error || !numbered.data) {
    return { ok: false, error: numbered.error?.message ?? "Het creditnotanummer kon niet worden toegekend." };
  }

  const creditNote = await readCreditNote(db, creditNoteId);
  if (!creditNote) return { ok: false, error: "Deze creditnota bestaat niet (meer)." };
  if (isFinanciallyIssued(creditNote)) return { ok: true, creditNote, adopted: true };

  const invoiceNumber = await readInvoiceNumber(db, creditNote.invoiceId);

  let pdf: Buffer;
  try {
    pdf = await renderCreditNotePdf(creditNote, invoiceNumber);
  } catch (error) {
    console.error("Credit note PDF render failed", { creditNoteId, error });
    return { ok: false, error: "De PDF kon niet worden gemaakt. Probeer het opnieuw." };
  }

  let stored;
  try {
    stored = await storeInvoiceArtifact(db, creditNote, pdf, "Creditnota");
  } catch (error) {
    console.error("Credit note PDF upload failed", { creditNoteId, error });
    return {
      ok: false,
      error: `De PDF kon niet worden opgeslagen, dus de creditnota is nog niet afgerond: ${
        error instanceof Error ? error.message : "onbekende fout"
      }. Probeer het opnieuw; het nummer ${creditNote.number.value} blijft van deze creditnota.`,
    };
  }

  const completed = await db.rpc("complete_credit_note_issue", {
    p_credit_note_id: creditNoteId,
    p_path: stored.path,
    p_sha256: stored.sha256,
    p_bytes: stored.bytes,
  });
  if (completed.error) {
    const current = await readCreditNote(db, creditNoteId);
    if (current && isFinanciallyIssued(current)) return { ok: true, creditNote: current, adopted: true };
    return { ok: false, error: completed.error.message };
  }
  if (!completionResult(completed.data)) return { ok: false, error: "De creditnota kon niet worden afgerond." };

  const issued = await readCreditNote(db, creditNoteId);
  if (!issued) return { ok: false, error: "Deze creditnota bestaat niet (meer)." };
  return { ok: true, creditNote: issued, adopted: stored.adopted };
}

/**
 * The whole thing: record, number, PDF. A second cancellation credit for the
 * same service is refused by the database and the existing note is returned
 * instead -- a double click makes one credit note, never two.
 */
export async function createCreditNote(db: Db, draft: CreditNoteDraft): Promise<CreateCreditNoteResult> {
  const invalid = creditNoteLinesInvalid(draft.lines);
  if (invalid) return { ok: false, error: invalid };
  if (!draft.reason.trim()) return { ok: false, error: "Geef een reden op." };

  const totals = creditNoteTotals(draft.lines);
  if (totals.subtotalCents <= 0) return { ok: false, error: "Het te crediteren bedrag moet groter dan nul zijn." };

  const created = await db.rpc("create_credit_note", {
    p_invoice_id: draft.invoiceId,
    p_reason: draft.reason.trim(),
    p_issue_date: draft.issueDate,
    p_lines: draft.lines.map((line) => ({
      description: line.description.trim(),
      quantityHundredths: line.quantityHundredths,
      unitPriceCents: line.unitPriceCents,
      vatRate: line.vatRate,
    })) as unknown as Json,
    p_subtotal_cents: totals.subtotalCents,
    p_vat_cents: totals.vatCents,
    p_total_cents: totals.totalCents,
    p_source: draft.source,
    ...(draft.recurringServiceId ? { p_recurring_service_id: draft.recurringServiceId } : {}),
  });

  let id: string;
  if (created.error) {
    if (created.error.code === "23505" && draft.source === "cancellation_credit" && draft.recurringServiceId) {
      const { data } = await db
        .from("credit_notes")
        .select(creditNoteColumns)
        .eq("recurring_service_id", draft.recurringServiceId)
        .eq("source", "cancellation_credit")
        .maybeSingle();
      if (data) {
        const existing = creditNoteFromRow(data as unknown as CreditNoteRow);
        if (isFinanciallyIssued(existing)) return { ok: true, creditNote: existing, reused: true };
        id = existing.id;
        const finished = await issueCreditNoteDocument(db, id);
        return finished.ok ? { ok: true, creditNote: finished.creditNote, reused: true } : finished;
      }
    }
    return { ok: false, error: created.error.message };
  }
  if (typeof created.data !== "string") return { ok: false, error: "De creditnota kon niet worden aangemaakt." };
  id = created.data;

  const issued = await issueCreditNoteDocument(db, id);
  if (!issued.ok) return issued;
  return { ok: true, creditNote: issued.creditNote, reused: false };
}
