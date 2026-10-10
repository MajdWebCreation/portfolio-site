"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import DocumentTotalsView from "@/components/admin/documents/document-totals";
import { SelectField, TextField } from "@/components/admin/form-field";
import { useSave } from "@/components/admin/save-controls";
import { createManualCreditNote } from "@/lib/admin/credit-notes/actions";
import { creditCapExceeded, creditNoteLinesInvalid, isFullyCredited, type CreditNoteLineInput } from "@/lib/admin/credit-notes/issue";
import type { DocumentLine } from "@/lib/admin/documents/types";
import { calculateTotals, centsToInput, formatCents, parseCents, parseQuantityHundredths } from "@/lib/money";

/**
 * "Creditnota aanmaken" on an issued invoice. Two starting points -- the
 * whole invoice, or half of it -- and every line editable from there, with
 * the totals computed by the same arithmetic the document will print. The
 * cap (never more than the invoice charged, per VAT rate) is shown here and
 * enforced again on the server and in the database.
 */
type Draft = { description: string; quantity: string; unitPrice: string; vatRate: string };

function fromLine(line: DocumentLine, factor: number): Draft {
  return {
    description: line.description,
    quantity: (line.quantityHundredths / 100).toString().replace(".", ","),
    unitPrice: centsToInput(Math.round(line.unitPriceCents * factor)),
    vatRate: String(line.vatRate),
  };
}

function toInput(draft: Draft): CreditNoteLineInput | null {
  const quantityHundredths = parseQuantityHundredths(draft.quantity);
  const unitPriceCents = parseCents(draft.unitPrice);
  if (quantityHundredths === null || unitPriceCents === null) return null;
  return { description: draft.description, quantityHundredths, unitPriceCents, vatRate: Number(draft.vatRate) };
}

export default function CreditNoteForm({
  invoiceId,
  invoiceNumber,
  invoiceLines,
  creditedLines,
  todayKey,
}: {
  invoiceId: string;
  invoiceNumber: string;
  invoiceLines: DocumentLine[];
  /** Lines of credit notes that already exist on this invoice, for the cap. */
  creditedLines: CreditNoteLineInput[];
  todayKey: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [issueDate, setIssueDate] = useState(todayKey);
  const [drafts, setDrafts] = useState<Draft[]>(() => invoiceLines.map((line) => fromLine(line, 1)));
  const { save, pending, error } = useSave();

  const lines = useMemo(() => drafts.map(toInput), [drafts]);
  const complete = lines.every((line): line is CreditNoteLineInput => line !== null);
  const totals = complete ? calculateTotals(lines) : null;
  const invalid = !complete
    ? "Controleer de bedragen en aantallen."
    : (creditNoteLinesInvalid(lines) ?? creditCapExceeded({ invoiceLines, creditedLines, draftLines: lines }));
  const fullyCredited = isFullyCredited(invoiceLines, creditedLines);

  function preset(factor: number) {
    setDrafts(invoiceLines.map((line) => fromLine(line, factor)));
  }

  function update(index: number, patch: Partial<Draft>) {
    setDrafts((current) => current.map((draft, at) => (at === index ? { ...draft, ...patch } : draft)));
  }

  function submit() {
    if (!complete || invalid) return;
    save(
      () => createManualCreditNote(invoiceId, { reason, issueDate, lines }),
      (value) => {
        router.push(`/admin/betalingen/creditnotas/${value.id}`);
      },
    );
  }

  if (fullyCredited) {
    return <p className="text-[0.9rem] text-muted">Factuur {invoiceNumber} is volledig gecrediteerd; er kan niets meer worden gecrediteerd.</p>;
  }

  if (!open) {
    return (
      <AdminButton variant="secondary" onClick={() => setOpen(true)}>
        Creditnota aanmaken
      </AdminButton>
    );
  }

  return (
    <div className="space-y-5 rounded-sm border border-line bg-paper-deep p-4">
      <div className="flex flex-wrap items-center gap-3 text-[0.85rem]">
        <span className="text-muted">Vooraf invullen:</span>
        <button type="button" className="link-static text-ink" onClick={() => preset(1)}>
          Volledige factuur
        </button>
        <button type="button" className="link-static text-ink" onClick={() => preset(0.5)}>
          50%
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="credit-reason" label="Reden" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Bijvoorbeeld: korting achteraf, correctie van een regel" />
        <TextField id="credit-date" label="Creditnotadatum" type="date" value={issueDate} max={todayKey} onChange={(event) => setIssueDate(event.target.value)} />
      </div>

      <div className="space-y-3">
        {drafts.map((draft, index) => (
          <div key={index} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem_8rem_6rem_auto] sm:items-end">
            <TextField id={`credit-line-${index}-description`} label="Omschrijving" value={draft.description} onChange={(event) => update(index, { description: event.target.value })} />
            <TextField id={`credit-line-${index}-quantity`} label="Aantal" value={draft.quantity} inputMode="decimal" onChange={(event) => update(index, { quantity: event.target.value })} />
            <TextField id={`credit-line-${index}-price`} label="Bedrag excl." value={draft.unitPrice} inputMode="decimal" onChange={(event) => update(index, { unitPrice: event.target.value })} />
            <SelectField id={`credit-line-${index}-vat`} label="Btw" value={draft.vatRate} onChange={(event) => update(index, { vatRate: event.target.value })}>
              <option value="21">21%</option>
              <option value="9">9%</option>
              <option value="0">0%</option>
            </SelectField>
            <button
              type="button"
              className="link-static mb-2 text-[0.85rem] text-muted hover:text-ink"
              disabled={drafts.length === 1}
              onClick={() => setDrafts((current) => current.filter((_, at) => at !== index))}
            >
              Verwijderen
            </button>
          </div>
        ))}
        <button type="button" className="link-static text-[0.85rem] text-ink" onClick={() => setDrafts((current) => [...current, { description: "", quantity: "1", unitPrice: "0,00", vatRate: "21" }])}>
          Regel toevoegen
        </button>
      </div>

      {totals ? <DocumentTotalsView totals={totals} /> : null}

      {invalid ? (
        <p role="alert" className="border-l-2 border-danger pl-3 text-[0.85rem] text-danger">
          {invalid}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="border-l-2 border-danger pl-3 text-[0.85rem] text-danger">
          {error}
        </p>
      ) : null}

      {confirming && totals ? (
        <div className="space-y-3 border-t border-line pt-4">
          <p className="text-[0.9rem] leading-snug text-body">
            Er wordt een creditnota van <span className="tabular text-ink">{formatCents(totals.totalCents)}</span> incl. btw gemaakt op factuur {invoiceNumber}. De creditnota krijgt direct een definitief nummer en een PDF; de factuur zelf verandert niet. Versturen en terugbetalen zijn aparte stappen.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <AdminButton onClick={submit} disabled={pending || !reason.trim() || Boolean(invalid)}>
              {pending ? "Aanmaken…" : "Creditnota definitief aanmaken"}
            </AdminButton>
            <button type="button" onClick={() => setConfirming(false)} disabled={pending} className="link-static text-[0.9rem] text-ink">
              Terug
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <AdminButton onClick={() => setConfirming(true)} disabled={Boolean(invalid) || !reason.trim()}>
            Controleren en aanmaken
          </AdminButton>
          <button type="button" onClick={() => setOpen(false)} className="link-static text-[0.9rem] text-ink">
            Annuleren
          </button>
          {!reason.trim() ? <span className="text-[0.82rem] text-muted">Vul eerst een reden in.</span> : null}
        </div>
      )}
    </div>
  );
}
