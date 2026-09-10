"use client";

import { useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import AdminSection from "@/components/admin/admin-section";
import ConvertToCustomer from "@/components/admin/customers/convert-to-customer";
import { DetailList, DetailRow } from "@/components/admin/detail-list";
import { SelectField, TextareaField } from "@/components/admin/form-field";
import SaveControls, { useSave } from "@/components/admin/save-controls";
import StatusBadge from "@/components/admin/status-badge";
import { formatDateTime } from "@/lib/admin/format";
import { saveInquiryHandling } from "@/lib/admin/inquiries/actions";
import {
  inquiryOriginLabels,
  inquiryStatusLabels,
  inquiryStatusOrder,
  inquiryStatusTone,
  isInquiryStatus,
  type Inquiry,
  type PlannerInquiry,
} from "@/lib/admin/inquiries/types";

function List({ items }: { items: string[] | undefined }) {
  if (!items?.length) return <span className="text-muted">Geen</span>;
  return (
    <ul className="list-disc space-y-0.5 pl-4">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function orDash(value: string | null | undefined) {
  return value ? value : <span className="text-muted">—</span>;
}

/** The structured planner block, shown as received: prices are the texts the planner posted. */
function PlannerSummary({ inquiry }: { inquiry: PlannerInquiry }) {
  const { planner } = inquiry;
  return (
    <AdminSection id="planner" title="Projectplanner" note="Zoals ingevuld op de website">
      <DetailList>
        <DetailRow term="Projecttype">{orDash(planner.selectedProjectType)}</DetailRow>
        <DetailRow term="Aanbevolen type">
          {orDash(planner.recommendedPackage)}
          {planner.reason ? <span className="block text-[0.88rem] text-muted">{planner.reason}</span> : null}
        </DetailRow>
        <DetailRow term="Eenmalig vanaf">{orDash(planner.startingPrice)}</DetailRow>
        <DetailRow term="Indicatie">{orDash(planner.indicativeRange)}</DetailRow>
        <DetailRow term="Technisch beheer">{orDash(planner.monthlyManagement)}</DetailRow>
        <DetailRow term="Uitbreidingen">
          <List items={planner.selectedAddOns} />
        </DetailRow>
        <DetailRow term="Kenmerken">
          <List items={planner.selectedFeatures} />
        </DetailRow>
        {planner.pageCount ? <DetailRow term="Pagina's">{planner.pageCount}</DetailRow> : null}
        {planner.webshopProducts ? <DetailRow term="Producten">{planner.webshopProducts}</DetailRow> : null}
        {planner.multilingual ? <DetailRow term="Meertalig">{planner.multilingual}</DetailRow> : null}
        <DetailRow term="Planning">{orDash(planner.launchTimeline)}</DetailRow>
        <DetailRow term="Content gereed">{orDash(planner.contentReady)}</DetailRow>
        <DetailRow term="Huisstijl gereed">{orDash(planner.brandingReady)}</DetailRow>
        <DetailRow term="Prioriteit">{orDash(planner.priority)}</DetailRow>
        <DetailRow term="Zakelijke aanvraag">{planner.businessDeclaration ? "Bevestigd" : "Niet bevestigd"}</DetailRow>
      </DetailList>
    </AdminSection>
  );
}

export default function InquiryDetail({ inquiry, customerId }: { inquiry: Inquiry; customerId: string | null }) {
  // Local state while editing; the stored record is what the page was given.
  const [status, setStatus] = useState(isInquiryStatus(inquiry.status) ? inquiry.status : "new");
  const [internalNote, setInternalNote] = useState(inquiry.internalNote ?? "");
  const { save, pending, error, savedAt } = useSave();

  const dirty = status !== inquiry.status || internalNote !== (inquiry.internalNote ?? "");

  const reset = () => {
    setStatus(isInquiryStatus(inquiry.status) ? inquiry.status : "new");
    setInternalNote(inquiry.internalNote ?? "");
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
      <div className="space-y-10">
        <AdminSection id="contact" title="Aanvrager">
          <DetailList>
            <DetailRow term="Naam">{inquiry.name}</DetailRow>
            {inquiry.company ? <DetailRow term="Bedrijf">{inquiry.company}</DetailRow> : null}
            <DetailRow term="E-mail">
              <a href={`mailto:${inquiry.email}`} className="link-static">
                {inquiry.email}
              </a>
            </DetailRow>
            {inquiry.origin === "project_planner" && inquiry.phone ? (
              <DetailRow term="Telefoon">
                <a href={`tel:${inquiry.phone.replace(/\s/g, "")}`} className="link-static tabular">
                  {inquiry.phone}
                </a>
              </DetailRow>
            ) : null}
            <DetailRow term="Ontvangen">{formatDateTime(inquiry.receivedAt)}</DetailRow>
            <DetailRow term="Herkomst">{inquiryOriginLabels[inquiry.origin]}</DetailRow>
            <DetailRow term="Taal">{inquiry.locale === "nl" ? "Nederlands" : "Engels"}</DetailRow>
          </DetailList>
        </AdminSection>

        <AdminSection id="message" title={inquiry.origin === "project_planner" ? "Toelichting" : "Bericht"}>
          {inquiry.message ? (
            <p className="max-w-[64ch] whitespace-pre-line text-[0.98rem] leading-relaxed text-ink">{inquiry.message}</p>
          ) : (
            <p className="text-[0.95rem] text-muted">Geen toelichting meegegeven.</p>
          )}
        </AdminSection>

        {inquiry.origin === "project_planner" ? <PlannerSummary inquiry={inquiry} /> : null}
      </div>

      <aside className="space-y-8 lg:border-l lg:border-line lg:pl-8" aria-labelledby="handling-heading">
        <div>
          <h2 id="handling-heading" className="label-mono text-ink">
            Afhandeling
          </h2>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusBadge tone={inquiryStatusTone[status]}>{inquiryStatusLabels[status]}</StatusBadge>
            {dirty ? <StatusBadge tone="accent">Niet opgeslagen</StatusBadge> : null}
          </div>
          <div className="mt-5 space-y-5">
            <SelectField
              id="inquiry-status"
              label="Status"
              value={status}
              onChange={(event) => (isInquiryStatus(event.target.value) ? setStatus(event.target.value) : null)}
            >
              {inquiryStatusOrder.map((value) => (
                <option key={value} value={value}>
                  {inquiryStatusLabels[value]}
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
            <SaveControls
              label="Opslaan"
              pending={pending}
              error={error}
              savedAt={savedAt}
              disabled={!dirty}
              onSave={() => save(() => saveInquiryHandling(inquiry.id, { status, internalNote }))}
            />
            {dirty ? (
              <AdminButton variant="secondary" onClick={reset}>
                Wijzigingen ongedaan maken
              </AdminButton>
            ) : null}
          </div>
        </div>

        <ConvertToCustomer source="inquiry" sourceId={inquiry.id} customerId={customerId} />
      </aside>
    </div>
  );
}
