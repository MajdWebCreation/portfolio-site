"use client";

import { useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { inputClass } from "@/components/admin/form-field";
import type { DocumentLine } from "@/lib/admin/documents/types";
import { validateLine, type LineErrors } from "@/lib/admin/documents/validation";
import { allowedVatRates, centsToInput, formatCents, formatQuantity, lineNetCents, parseCents, parseQuantityHundredths } from "@/lib/money";

type LineItemsEditorProps = {
  lines: DocumentLine[];
  onChange: (lines: DocumentLine[]) => void;
  /** Errors per line id, shown after a submit attempt. */
  errors?: Record<string, LineErrors>;
};

export function newLine(id = `line-${Math.random().toString(36).slice(2, 8)}`): DocumentLine {
  return { id, description: "", quantityHundredths: 100, unitPriceCents: 0, vatRate: 21 };
}

/**
 * Editable lines of a quote or invoice. Amounts are parsed on blur into the
 * integer model; the line total comes from the money core, never from here.
 * Below md every line stacks; from md up it is one row.
 */
export default function LineItemsEditor({ lines, onChange, errors = {} }: LineItemsEditorProps) {
  const update = (id: string, patch: Partial<DocumentLine>) => onChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  const remove = (id: string) => onChange(lines.filter((line) => line.id !== id));
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= lines.length) return;
    const next = [...lines];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div>
      <div className="hidden grid-cols-[minmax(0,1fr)_5rem_8rem_5.5rem_7rem_5.5rem] gap-3 border-b border-line-strong pb-2 md:grid" aria-hidden="true">
        {["Omschrijving", "Aantal", "Prijs excl.", "Btw", "Bedrag", ""].map((label) => (
          <span key={label} className="label-mono">
            {label}
          </span>
        ))}
      </div>
      <ol className="divide-y divide-line">
        {lines.map((line, index) => {
          const ids = {
            description: `line-${line.id}-d`,
            quantity: `line-${line.id}-q`,
            price: `line-${line.id}-p`,
            vat: `line-${line.id}-v`,
          };
          const lineErrors = errors[line.id] ?? {};
          const total = validateLine(line).quantity || validateLine(line).unitPrice ? null : lineNetCents(line);
          return (
            <li key={line.id} className="grid gap-3 py-3 md:grid-cols-[minmax(0,1fr)_5rem_8rem_5.5rem_7rem_5.5rem] md:items-start">
              <div>
                <label htmlFor={ids.description} className="label-mono mb-1 block md:sr-only">
                  Omschrijving regel {index + 1}
                </label>
                <textarea
                  id={ids.description}
                  value={line.description}
                  rows={1}
                  onChange={(event) => update(line.id, { description: event.target.value })}
                  aria-invalid={lineErrors.description ? true : undefined}
                  aria-describedby={lineErrors.description ? `${ids.description}-error` : undefined}
                  className={`${inputClass} min-h-10 resize-y py-2 leading-snug`}
                />
                {lineErrors.description ? (
                  <p id={`${ids.description}-error`} className="mt-1 text-[0.82rem] text-danger">
                    {lineErrors.description}
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-[4.25rem_minmax(0,1fr)_5rem] gap-3 md:contents">
                <div>
                  <label htmlFor={ids.quantity} className="label-mono mb-1 block md:sr-only">
                    Aantal
                  </label>
                  <QuantityInput id={ids.quantity} value={line.quantityHundredths} onCommit={(value) => update(line.id, { quantityHundredths: value })} error={lineErrors.quantity} />
                </div>
                <div>
                  <label htmlFor={ids.price} className="label-mono mb-1 block md:sr-only">
                    Prijs excl. btw
                  </label>
                  <PriceInput id={ids.price} value={line.unitPriceCents} onCommit={(value) => update(line.id, { unitPriceCents: value })} error={lineErrors.unitPrice} />
                </div>
                <div>
                  <label htmlFor={ids.vat} className="label-mono mb-1 block md:sr-only">
                    Btw
                  </label>
                  <select
                    id={ids.vat}
                    value={line.vatRate}
                    onChange={(event) => update(line.id, { vatRate: Number(event.target.value) })}
                    aria-invalid={lineErrors.vatRate ? true : undefined}
                    className={`${inputClass} min-h-10 py-1.5`}
                  >
                    {allowedVatRates.map((rate) => (
                      <option key={rate} value={rate}>
                        {rate}%
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 md:contents">
                <p className="tabular text-[0.95rem] text-ink md:min-h-10 md:pt-2.5 md:text-right">
                  <span className="label-mono mr-2 md:sr-only">Bedrag</span>
                  {total === null ? "—" : formatCents(total)}
                </p>
                <div className="flex items-center gap-1 md:justify-end">
                  <button type="button" aria-label={`Regel ${index + 1} omhoog`} disabled={index === 0} onClick={() => move(index, -1)} className="min-h-10 min-w-8 rounded-xs text-muted hover:text-ink disabled:opacity-30">
                    ↑
                  </button>
                  <button type="button" aria-label={`Regel ${index + 1} omlaag`} disabled={index === lines.length - 1} onClick={() => move(index, 1)} className="min-h-10 min-w-8 rounded-xs text-muted hover:text-ink disabled:opacity-30">
                    ↓
                  </button>
                  <button type="button" aria-label={`Regel ${index + 1} verwijderen`} onClick={() => remove(line.id)} className="min-h-10 min-w-8 rounded-xs text-muted hover:text-danger">
                    ×
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="border-t border-line pt-3">
        <AdminButton variant="secondary" onClick={() => onChange([...lines, newLine()])}>
          Regel toevoegen
        </AdminButton>
      </div>
    </div>
  );
}

function QuantityInput({ id, value, onCommit, error }: { id: string; value: number; onCommit: (value: number) => void; error?: string }) {
  return (
    <TextCommit id={id} display={formatQuantity(value)} parse={parseQuantityHundredths} onCommit={onCommit} error={error} align="right" inputMode="decimal" />
  );
}

function PriceInput({ id, value, onCommit, error }: { id: string; value: number; onCommit: (value: number) => void; error?: string }) {
  return <TextCommit id={id} display={centsToInput(value)} parse={parseCents} onCommit={onCommit} error={error} align="right" inputMode="decimal" prefix="€" />;
}

/** Text input that parses on blur/Enter and keeps the last valid value otherwise. */
function TextCommit({
  id,
  display,
  parse,
  onCommit,
  error,
  align,
  inputMode,
  prefix,
}: {
  id: string;
  display: string;
  parse: (text: string) => number | null;
  onCommit: (value: number) => void;
  error?: string;
  align: "right";
  inputMode: "decimal";
  prefix?: string;
}) {
  // While editing the raw text is kept; otherwise the formatted model value shows.
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const commit = () => {
    if (draft === null) return;
    const parsed = parse(draft);
    if (parsed === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onCommit(parsed);
    setDraft(null);
  };
  const message = invalid ? "Ongeldig getal" : error;
  return (
    <div className="relative">
      {prefix ? (
        <span aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[0.85rem] text-muted">
          {prefix}
        </span>
      ) : null}
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        value={draft ?? display}
        onChange={(event) => {
          setDraft(event.target.value);
          setInvalid(false);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? `${id}-error` : undefined}
        className={`${inputClass} tabular min-h-10 py-1.5 text-${align} ${prefix ? "pl-6" : ""}`}
      />
      {message ? (
        <p id={`${id}-error`} className="mt-1 text-[0.82rem] text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}
