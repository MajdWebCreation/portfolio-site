"use client";

import { useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { SelectField, TextareaField } from "@/components/admin/form-field";
import { useSave } from "@/components/admin/save-controls";
import { recordQuoteDecision } from "@/lib/admin/quotes/decision-actions";
import { decisionTextMax, offlineDecisionSources, quoteDecisionSourceLabels, type OfflineDecisionSource, type QuoteDecisionKind } from "@/lib/quotes/decision";

/**
 * "Beslissing vastleggen": a decision that reached YM Creations outside the
 * portal -- by mail, by phone, as a signed copy -- recorded once, on the
 * same record the portal writes, with the same snapshot of the document and
 * its terms. Two steps, like the portal's: choose, then confirm, because
 * what is recorded cannot be changed afterwards.
 */
export default function QuoteDecisionRecord({ quoteId, number, pastValidity }: { quoteId: string; number: string; pastValidity: boolean }) {
  const [decision, setDecision] = useState<QuoteDecisionKind | "">("");
  const [source, setSource] = useState<OfflineDecisionSource | "">("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const { save, pending, error } = useSave();

  const ready = decision !== "" && source !== "";

  return (
    <section aria-labelledby="decision-record-heading" className="space-y-4 border-t border-line pt-6">
      <h2 id="decision-record-heading" className="label-mono text-ink">
        Beslissing vastleggen
      </h2>
      <p className="text-[0.85rem] leading-snug text-muted">
        Voor een akkoord of afwijzing die buiten het portaal binnenkwam. Wordt vastgelegd bij exact de opgeslagen PDF en
        voorwaardenversie van {number}, en is daarna niet meer te wijzigen.
      </p>
      {pastValidity ? (
        <p className="border-l-2 border-danger pl-3 text-[0.85rem] leading-snug text-body">
          De geldigheidsdatum is verstreken. Leg een akkoord alleen vast als het op tijd binnenkwam of als je het te laat
          ontvangen akkoord bewust aanvaardt.
        </p>
      ) : null}

      <fieldset className="space-y-2" disabled={pending || confirming}>
        <legend className="label-mono mb-1.5">Beslissing</legend>
        {(["accepted", "rejected"] as const).map((value) => (
          <label key={value} className="flex items-center gap-2 text-[0.92rem] text-ink">
            <input type="radio" name="decision" value={value} checked={decision === value} onChange={() => setDecision(value)} />
            {value === "accepted" ? "Geaccepteerd" : "Afgewezen"}
          </label>
        ))}
      </fieldset>

      <SelectField
        id="decision-source"
        label="Binnengekomen via"
        value={source}
        disabled={pending || confirming}
        onChange={(event) => setSource(event.target.value as OfflineDecisionSource | "")}
      >
        <option value="">Kies…</option>
        {offlineDecisionSources.map((item) => (
          <option key={item} value={item}>
            {quoteDecisionSourceLabels[item]}
          </option>
        ))}
      </SelectField>

      {decision === "rejected" ? (
        <TextareaField
          id="decision-reason"
          label="Reden van de klant"
          optional
          hint="Zichtbaar voor de klant in het portaal."
          maxLength={decisionTextMax}
          value={reason}
          disabled={pending || confirming}
          onChange={(event) => setReason(event.target.value)}
        />
      ) : null}

      <TextareaField
        id="decision-note"
        label="Interne notitie"
        optional
        hint="Alleen zichtbaar in de admin, bijvoorbeeld de datum van de mail of wie belde."
        maxLength={decisionTextMax}
        value={note}
        disabled={pending || confirming}
        onChange={(event) => setNote(event.target.value)}
      />

      {confirming ? (
        <div className="space-y-3 border-l-2 border-accent pl-3">
          <p className="text-[0.9rem] leading-snug text-ink">
            {number} definitief vastleggen als {decision === "accepted" ? "geaccepteerd" : "afgewezen"} (
            {source ? quoteDecisionSourceLabels[source].toLowerCase() : ""})? Dit kan niet worden teruggedraaid.
          </p>
          <div className="flex flex-wrap gap-3">
            <AdminButton
              disabled={pending}
              onClick={() =>
                save(() => recordQuoteDecision(quoteId, { decision, source, rejectionReason: reason, note }), () => setConfirming(false))
              }
            >
              {pending ? "Vastleggen…" : "Definitief vastleggen"}
            </AdminButton>
            <AdminButton variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>
              Terug
            </AdminButton>
          </div>
        </div>
      ) : (
        <AdminButton variant="secondary" disabled={!ready || pending} onClick={() => setConfirming(true)}>
          Beslissing vastleggen
        </AdminButton>
      )}

      {error ? (
        <p role="alert" className="text-[0.85rem] leading-snug text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
