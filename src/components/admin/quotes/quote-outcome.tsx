"use client";

import { useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { SelectField } from "@/components/admin/form-field";
import { useSave } from "@/components/admin/save-controls";
import StatusBadge from "@/components/admin/status-badge";
import { setQuoteOutcome } from "@/lib/admin/quotes/lifecycle";
import { quoteOutcomeStatuses, quoteStatusLabels, quoteStatusTone, type QuoteStatus } from "@/lib/admin/quotes/types";

/**
 * What became of a sent quote, as the admin records it.
 *
 * Only the statuses a quote the customer has can take; 'draft' is gone for
 * good once the number was spent. Administrative until the customer decides
 * in the portal: "Geaccepteerd" here records what was said by mail or phone,
 * it does not accept anything on the customer's behalf.
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
        hint="Administratief: legt vast wat de klant liet weten. Er gaat niets naar de klant."
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
