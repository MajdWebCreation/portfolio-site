"use client";

import { useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import AdminSection from "@/components/admin/admin-section";
import ConvertToCustomer from "@/components/admin/customers/convert-to-customer";
import { DetailList, DetailRow } from "@/components/admin/detail-list";
import { SelectField, TextField, TextareaField } from "@/components/admin/form-field";
import SaveControls, { useSave } from "@/components/admin/save-controls";
import StatusBadge from "@/components/admin/status-badge";
import { formatDate, formatDateTime, isDateKey } from "@/lib/admin/format";
import { updateLeadFollowUp } from "@/lib/admin/leads/actions";
import {
  getFollowUpState,
  isLeadStatus,
  leadSourceLabels,
  leadStatusLabels,
  leadStatusOrder,
  leadStatusTone,
  type Lead,
} from "@/lib/admin/leads/types";

function dateOnly(value: string | undefined) {
  return value ? formatDate(`${value}T12:00:00+02:00`) : <span className="text-muted">—</span>;
}

export default function LeadDetail({ lead, todayKey, customerId }: { lead: Lead; todayKey: string; customerId: string | null }) {
  // Local state while editing; `lead` is what the database holds.
  const [status, setStatus] = useState(lead.status);
  const [notes, setNotes] = useState(lead.notes);
  const [lastContactAt, setLastContactAt] = useState(lead.lastContactAt ?? "");
  const [nextFollowUpAt, setNextFollowUpAt] = useState(lead.nextFollowUpAt ?? "");
  const { save, pending, error, savedAt } = useSave();

  const dirty =
    status !== lead.status ||
    notes !== lead.notes ||
    lastContactAt !== (lead.lastContactAt ?? "") ||
    nextFollowUpAt !== (lead.nextFollowUpAt ?? "");

  const reset = () => {
    setStatus(lead.status);
    setNotes(lead.notes);
    setLastContactAt(lead.lastContactAt ?? "");
    setNextFollowUpAt(lead.nextFollowUpAt ?? "");
  };

  const followUp = getFollowUpState({ nextFollowUpAt: nextFollowUpAt || undefined }, todayKey);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
      <div className="space-y-10">
        <AdminSection id="company" title="Bedrijf en contact">
          <DetailList>
            <DetailRow term="Bedrijf">{lead.companyName}</DetailRow>
            <DetailRow term="Contactpersoon">{lead.contactName}</DetailRow>
            <DetailRow term="E-mail">
              {lead.email ? (
                <a href={`mailto:${lead.email}`} className="link-static">
                  {lead.email}
                </a>
              ) : (
                <span className="text-muted">—</span>
              )}
            </DetailRow>
            <DetailRow term="Telefoon">
              {lead.phone ? (
                <a href={`tel:${lead.phone.replace(/\s/g, "")}`} className="link-static tabular">
                  {lead.phone}
                </a>
              ) : (
                <span className="text-muted">—</span>
              )}
            </DetailRow>
            <DetailRow term="Website">
              {lead.website ? (
                <a href={lead.website} target="_blank" rel="noopener noreferrer" className="link-static">
                  {lead.website.replace(/^https?:\/\//, "")} ↗
                </a>
              ) : (
                <span className="text-muted">—</span>
              )}
            </DetailRow>
            <DetailRow term="Bron">{leadSourceLabels[lead.source]}</DetailRow>
            <DetailRow term="Toegevoegd">{formatDateTime(lead.createdAt)}</DetailRow>
          </DetailList>
        </AdminSection>

        <AdminSection id="notes" title="Notities">
          <TextareaField id="lead-notes" label="Interne notities" optional value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Context, afspraken, wat is besproken" />
        </AdminSection>
      </div>

      <aside className="space-y-8 lg:border-l lg:border-line lg:pl-8" aria-labelledby="follow-up-heading">
        <div>
          <h2 id="follow-up-heading" className="label-mono text-ink">
            Opvolging
          </h2>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusBadge tone={leadStatusTone[status]}>{leadStatusLabels[status]}</StatusBadge>
            {followUp === "overdue" ? <StatusBadge tone="danger">Opvolging te laat</StatusBadge> : null}
            {followUp === "today" ? <StatusBadge tone="accent">Vandaag opvolgen</StatusBadge> : null}
            {dirty ? <StatusBadge tone="accent">Niet opgeslagen</StatusBadge> : null}
          </div>
          <div className="mt-5 space-y-5">
            <SelectField id="lead-status" label="Status" value={status} onChange={(event) => (isLeadStatus(event.target.value) ? setStatus(event.target.value) : null)}>
              {leadStatusOrder.map((value) => (
                <option key={value} value={value}>
                  {leadStatusLabels[value]}
                </option>
              ))}
            </SelectField>
            <TextField id="lead-last-contact" label="Laatste contact" optional type="date" min="2000-01-01" max={todayKey} value={lastContactAt} onChange={(event) => setLastContactAt(event.target.value)} />
            <TextField id="lead-next-follow-up" label="Volgende opvolging" optional type="date" min="2000-01-01" max="2100-12-31" value={nextFollowUpAt} onChange={(event) => setNextFollowUpAt(event.target.value)} />
            <p className="text-[0.85rem] text-muted">
              Laatste contact {dateOnly(lastContactAt || undefined)} · volgende {dateOnly(nextFollowUpAt || undefined)}
            </p>
            <SaveControls
              label="Opslaan"
              pending={pending}
              error={error}
              savedAt={savedAt}
              disabled={!dirty}
              onSave={() =>
                save(() =>
                  updateLeadFollowUp(lead.id, {
                    status,
                    notes,
                    lastContactAt: isDateKey(lastContactAt) ? lastContactAt : undefined,
                    nextFollowUpAt: isDateKey(nextFollowUpAt) ? nextFollowUpAt : undefined,
                  }),
                )
              }
            />
            {dirty ? (
              <AdminButton variant="secondary" onClick={reset}>
                Wijzigingen ongedaan maken
              </AdminButton>
            ) : null}
          </div>
        </div>

        <ConvertToCustomer source="lead" sourceId={lead.id} customerId={customerId} />
      </aside>
    </div>
  );
}
