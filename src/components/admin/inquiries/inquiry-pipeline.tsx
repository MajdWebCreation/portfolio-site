"use client";

import { useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { SelectField, TextField, TextareaField } from "@/components/admin/form-field";
import SaveControls, { useSave } from "@/components/admin/save-controls";
import StatusBadge from "@/components/admin/status-badge";
import { serviceLabel } from "@/lib/admin/analytics/page-types";
import { formatDateTime } from "@/lib/admin/format";
import { saveInquiryHandling } from "@/lib/admin/inquiries/actions";
import type { InquiryValuePrefill } from "@/lib/admin/inquiries/repository";
import {
  inquiryStatusLabels,
  inquiryStatusOrder,
  inquiryStatusTone,
  lostReasonLabels,
  lostReasonOrder,
  type Inquiry,
  type InquiryStatus,
  type InquiryStatusEvent,
  type LostReason,
} from "@/lib/admin/inquiries/types";
import { serviceKeys, type ServiceKey } from "@/lib/content/services";
import { centsToInput, formatCents, parseCents } from "@/lib/money/money";

/**
 * The pipeline panel: the one place the business outcome of a request is
 * recorded, built to be used while on the phone.
 *
 * The six stages are buttons, so the current one is visible at a glance.
 * Only what belongs to the chosen stage appears under them: the quoted
 * value at "Offerte verstuurd", the one-off and monthly value at "Gewonnen",
 * a reason at "Verloren". Proposals from the linked customer's quotes and
 * services can be taken over with one click; a quote given by mail or phone
 * is typed in. Everything saves in one action, so the database logs the
 * status and its values on one event row.
 *
 * Values are the CURRENT business values (EUR excluding VAT). The value at
 * the moment of an outcome is on the event in the history below and never
 * changes afterwards; invoices and payments remain the realised truth.
 */
type Props = {
  inquiry: Inquiry;
  prefill: InquiryValuePrefill;
  suggestedService?: ServiceKey;
  events: InquiryStatusEvent[];
};

function amountInput(cents: number | undefined): string {
  return cents === undefined ? "" : centsToInput(cents);
}

function AmountField({
  id,
  label,
  value,
  onChange,
  proposal,
  proposalLabel,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  proposal?: number;
  proposalLabel: string;
}) {
  const invalid = value.trim() !== "" && parseCents(value) === null;
  return (
    <div>
      <TextField
        id={id}
        label={label}
        optional
        inputMode="decimal"
        placeholder="0,00"
        value={value}
        error={invalid ? "Vul een bedrag in, bijvoorbeeld 1.495,00" : undefined}
        hint="EUR, exclusief btw"
        onChange={(event) => onChange(event.target.value)}
      />
      {proposal !== undefined && centsToInput(proposal) !== value ? (
        <button type="button" onClick={() => onChange(centsToInput(proposal))} className="link-static mt-1.5 text-[0.85rem] text-ink">
          {proposalLabel}: {formatCents(proposal)} overnemen
        </button>
      ) : null}
    </div>
  );
}

function eventLine(event: InquiryStatusEvent): string {
  if (event.fromStatus === "lost" && event.toStatus === "lost") {
    return `Reden gewijzigd: ${event.lostReason ? lostReasonLabels[event.lostReason] : "—"}`;
  }
  const from = event.fromStatus ? inquiryStatusLabels[event.fromStatus] : "—";
  const to = inquiryStatusLabels[event.toStatus];
  const reason = event.toStatus === "lost" && event.lostReason ? ` (${lostReasonLabels[event.lostReason]})` : "";
  return `${from} → ${to}${reason}`;
}

function eventValues(event: InquiryStatusEvent): string | null {
  const parts: string[] = [];
  if (event.valueCents !== undefined) parts.push(`${event.toStatus === "won" ? "Eenmalig" : "Offerte"} ${formatCents(event.valueCents)}`);
  if (event.recurringMonthlyCents !== undefined) parts.push(`${formatCents(event.recurringMonthlyCents)} per maand`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export default function InquiryPipeline({ inquiry, prefill, suggestedService, events }: Props) {
  const [status, setStatus] = useState<InquiryStatus>(inquiry.status);
  const [lostReason, setLostReason] = useState<LostReason | "">(inquiry.lostReason ?? "");
  const [serviceInterest, setServiceInterest] = useState<ServiceKey | "">(inquiry.serviceInterest ?? suggestedService ?? "");
  const [quoted, setQuoted] = useState(amountInput(inquiry.quotedValueCents));
  const [won, setWon] = useState(amountInput(inquiry.wonValueCents));
  const [recurring, setRecurring] = useState(amountInput(inquiry.recurringMonthlyCents));
  const [internalNote, setInternalNote] = useState(inquiry.internalNote ?? "");
  const [localError, setLocalError] = useState<string | null>(null);
  const { save, pending, error, savedAt } = useSave();

  const stored = {
    status: inquiry.status,
    lostReason: inquiry.lostReason ?? "",
    serviceInterest: inquiry.serviceInterest ?? "",
    quoted: amountInput(inquiry.quotedValueCents),
    won: amountInput(inquiry.wonValueCents),
    recurring: amountInput(inquiry.recurringMonthlyCents),
    internalNote: inquiry.internalNote ?? "",
  };
  const dirty =
    status !== stored.status ||
    (status === "lost" ? lostReason !== stored.lostReason : stored.lostReason !== "") ||
    serviceInterest !== stored.serviceInterest ||
    quoted !== stored.quoted ||
    won !== stored.won ||
    recurring !== stored.recurring ||
    internalNote !== stored.internalNote;

  function reset() {
    setStatus(stored.status);
    setLostReason(inquiry.lostReason ?? "");
    setServiceInterest(inquiry.serviceInterest ?? suggestedService ?? "");
    setQuoted(stored.quoted);
    setWon(stored.won);
    setRecurring(stored.recurring);
    setInternalNote(stored.internalNote);
    setLocalError(null);
  }

  function cents(value: string, label: string): number | null | undefined {
    if (value.trim() === "") return null;
    const parsed = parseCents(value);
    if (parsed === null || parsed < 0) {
      setLocalError(`${label}: vul een bedrag van nul of hoger in.`);
      return undefined;
    }
    return parsed;
  }

  function submit() {
    setLocalError(null);
    if (status === "lost" && !lostReason) {
      setLocalError("Kies een reden waarom deze aanvraag verloren is.");
      return;
    }
    const quotedValueCents = cents(quoted, "Offertewaarde");
    const wonValueCents = cents(won, "Eenmalige waarde");
    const recurringMonthlyCents = cents(recurring, "Maandelijkse waarde");
    if (quotedValueCents === undefined || wonValueCents === undefined || recurringMonthlyCents === undefined) return;

    save(() =>
      saveInquiryHandling(inquiry.id, {
        status,
        ...(status === "lost" && lostReason ? { lostReason } : {}),
        ...(serviceInterest ? { serviceInterest } : {}),
        quotedValueCents,
        wonValueCents,
        recurringMonthlyCents,
        internalNote,
      }),
    );
  }

  const newest = [...events].reverse();

  return (
    <div>
      <h2 id="handling-heading" className="label-mono text-ink">
        Pijplijn
      </h2>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusBadge tone={inquiryStatusTone[status]}>{inquiryStatusLabels[status]}</StatusBadge>
        {dirty ? <StatusBadge tone="accent">Niet opgeslagen</StatusBadge> : null}
      </div>

      <div className="mt-5 space-y-5">
        <div role="group" aria-label="Status" className="flex flex-wrap gap-1.5">
          {inquiryStatusOrder.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
              className={`min-h-9 rounded-sm border px-2.5 text-[0.85rem] transition-colors ${
                status === value ? "border-ink bg-ink text-paper" : "border-line text-ink hover:border-ink"
              }`}
            >
              {inquiryStatusLabels[value]}
            </button>
          ))}
        </div>

        {status === "quote_sent" ? (
          <AmountField
            id="inquiry-quoted-value"
            label="Offertewaarde"
            value={quoted}
            onChange={setQuoted}
            proposal={prefill.quotedValueCents}
            proposalLabel="Laatste offerte"
          />
        ) : null}

        {status === "won" ? (
          <>
            {quoted.trim() !== "" && parseCents(quoted) !== null ? (
              <p className="text-[0.85rem] leading-snug text-muted">
                Offertewaarde {formatCents(parseCents(quoted) as number)} blijft bewaard; de gewonnen waarde staat er los van.
              </p>
            ) : null}
            <AmountField
              id="inquiry-won-value"
              label="Eenmalige waarde"
              value={won}
              onChange={setWon}
              proposal={prefill.acceptedValueCents ?? prefill.quotedValueCents}
              proposalLabel={prefill.acceptedValueCents !== undefined ? "Geaccepteerde offerte" : "Laatste offerte"}
            />
            <AmountField
              id="inquiry-recurring-value"
              label="Maandelijks (beheer)"
              value={recurring}
              onChange={setRecurring}
              proposal={prefill.recurringMonthlyCents}
              proposalLabel="Actieve diensten"
            />
          </>
        ) : null}

        {status === "lost" ? (
          <SelectField id="inquiry-lost-reason" label="Reden" value={lostReason} onChange={(event) => setLostReason(event.target.value as LostReason | "")}>
            <option value="">Kies een reden</option>
            {lostReasonOrder.map((value) => (
              <option key={value} value={value}>
                {lostReasonLabels[value]}
              </option>
            ))}
          </SelectField>
        ) : null}

        <SelectField
          id="inquiry-service-interest"
          label="Dienst"
          optional
          hint={!inquiry.serviceInterest && suggestedService ? "Voorstel op basis van de aanvraag" : undefined}
          value={serviceInterest}
          onChange={(event) => setServiceInterest(event.target.value as ServiceKey | "")}
        >
          <option value="">Onbekend</option>
          {serviceKeys.map((key) => (
            <option key={key} value={key}>
              {serviceLabel(key)}
            </option>
          ))}
        </SelectField>

        <TextareaField
          id="inquiry-note"
          label="Interne notitie"
          optional
          value={internalNote}
          onChange={(event) => setInternalNote(event.target.value)}
          placeholder="Alleen zichtbaar in de admin"
        />

        <SaveControls label="Opslaan" pending={pending} error={localError ?? error} savedAt={savedAt} disabled={!dirty} onSave={submit} />
        {dirty ? (
          <AdminButton variant="secondary" onClick={reset}>
            Wijzigingen ongedaan maken
          </AdminButton>
        ) : null}
      </div>

      <div className="mt-8 border-t border-line pt-6">
        <h3 className="label-mono text-ink">Verloop</h3>
        {newest.length === 0 ? (
          <p className="mt-3 text-[0.88rem] text-muted">Nog geen statuswijzigingen. Ontvangen op {formatDateTime(inquiry.receivedAt)}.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {newest.map((event) => {
              const values = eventValues(event);
              return (
                <li key={event.id} className="text-[0.88rem] leading-snug">
                  <span className="block text-ink">{eventLine(event)}</span>
                  {values ? <span className="block text-muted">{values}</span> : null}
                  <span className="block text-muted">
                    <time dateTime={event.changedAt}>{formatDateTime(event.changedAt)}</time>
                    {event.changedBy ? ` · ${event.changedBy}` : ""}
                  </span>
                </li>
              );
            })}
            <li className="text-[0.88rem] leading-snug text-muted">Ontvangen op {formatDateTime(inquiry.receivedAt)}</li>
          </ol>
        )}
      </div>
    </div>
  );
}
