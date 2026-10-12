"use client";

import { useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { SelectField } from "@/components/admin/form-field";
import { useSave } from "@/components/admin/save-controls";
import StatusBadge from "@/components/admin/status-badge";
import { setQuoteOutcome } from "@/lib/admin/quotes/lifecycle";
import { quoteOutcomeStatuses, quoteStatusLabels, quoteStatusTone, type QuoteStatus } from "@/lib/admin/quotes/types";

/**
 * The status of an open quote, as the admin sets it by hand: sent, or
 * expired. Accepting and rejecting are not here -- they are decisions,
 * recorded once (by the customer in the portal, or through "Beslissing
 * vastleggen") and never through a dropdown. Shown only while the quote is
 * undecided.
 */
export default function QuoteOutcome({ quoteId, status }: { quoteId: string; status: QuoteStatus }) {
  const [chosen, setChosen] = useState<QuoteStatus>(status);
  const { save, pending, error, savedAt } = useSave();

  return (
    <div className="space-y-4">
      <StatusBadge tone={quoteStatusTone[status]}>{quoteStatusLabels[status]}</StatusBadge>
      <SelectField
        id="quote-outcome"
        label="Status"
        value={chosen}
        onChange={(event) => setChosen(event.target.value as QuoteStatus)}
        hint="Alleen verzonden of verlopen. Een akkoord of afwijzing leg je vast als beslissing. Er gaat niets naar de klant."
      >
        {quoteOutcomeStatuses.map((item) => (
          <option key={item} value={item}>
            {quoteStatusLabels[item]}
          </option>
        ))}
      </SelectField>
      <div className="flex flex-wrap items-center gap-3">
        <AdminButton variant="secondary" disabled={pending || chosen === status} onClick={() => save(() => setQuoteOutcome(quoteId, chosen))}>
          {pending ? "Opslaan…" : "Status opslaan"}
        </AdminButton>
        {savedAt && chosen === status ? <span className="text-[0.82rem] text-muted">Opgeslagen</span> : null}
      </div>
      {error ? (
        <p role="alert" className="text-[0.85rem] leading-snug text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
