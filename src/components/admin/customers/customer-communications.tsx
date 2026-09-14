"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SegmentedField } from "@/components/admin/filter-bar";
import { DetailList, DetailRow } from "@/components/admin/detail-list";
import StatusBadge from "@/components/admin/status-badge";
import { formatDateTime } from "@/lib/admin/format";
import {
  communicationCategoryLabel,
  communicationFilterLabels,
  communicationFilterOrder,
  communicationStatusLabels,
  communicationStatusTone,
  type CommunicationFilter,
  type CommunicationStatus,
  type CustomerCommunication,
} from "@/lib/admin/communications/types";
import { communicationCounts, communicationMoment, communicationRows } from "@/lib/admin/communications/view";

/**
 * Everything this system mailed to one customer, newest first.
 *
 * A log, not a mailbox: each row is a send that really happened, and clicking
 * one shows the mail as the customer received it rather than a summary of
 * what it probably said. Nothing here can be edited, because nothing here can
 * be untrue -- a row exists only after the provider accepted the message.
 */
export type CommunicationTarget = { label: string; href?: string };

/**
 * Names for the records a mail points at, resolved on the server from what
 * the page already loaded. The component never looks anything up itself; a
 * link whose target is missing is shown as plain text rather than as a
 * promise that leads nowhere.
 */
export type CommunicationTargets = {
  invoices: Record<string, CommunicationTarget>;
  quotes: Record<string, CommunicationTarget>;
  projects: Record<string, CommunicationTarget>;
  services: Record<string, CommunicationTarget>;
};

export default function CustomerCommunications({
  communications,
  targets,
}: {
  communications: CustomerCommunication[];
  targets: CommunicationTargets;
}) {
  const [filter, setFilter] = useState<CommunicationFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = useMemo(() => communicationCounts(communications), [communications]);
  const rows = useMemo(() => communicationRows(communications, filter), [communications, filter]);

  if (communications.length === 0) {
    return (
      <p className="text-[0.95rem] text-muted">
        Nog geen e-mail naar deze klant verstuurd. Offertes, facturen en incassomails verschijnen hier automatisch.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <SegmentedField
        name="communication-filter"
        label="Soort bericht"
        value={filter}
        options={communicationFilterOrder.map((value) => ({
          value,
          label: `${communicationFilterLabels[value]} (${counts[value]})`,
        }))}
        onChange={setFilter}
      />

      <p className="text-[0.85rem] text-muted" aria-live="polite">
        {rows.length} van {communications.length} berichten
      </p>

      {rows.length === 0 ? (
        <p className="border-y border-line py-8 text-center text-[0.95rem] text-muted">
          Geen berichten in deze categorie.
        </p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {rows.map((communication) => (
            <li key={communication.id}>
              <button
                type="button"
                aria-expanded={openId === communication.id}
                aria-controls={`communication-${communication.id}`}
                onClick={() => setOpenId(openId === communication.id ? null : communication.id)}
                className="grid w-full items-baseline gap-x-5 gap-y-1 py-3 text-left transition-colors hover:bg-surface sm:grid-cols-[10.5rem_minmax(0,1fr)_auto]"
              >
                <span className="tabular text-[0.85rem] text-muted">
                  {formatDateTime(communicationMoment(communication))}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{communication.subject}</span>
                  <span className="block truncate text-[0.82rem] text-muted">
                    {communicationCategoryLabel(communication.category)} · {communication.recipient}
                  </span>
                </span>
                <span className="justify-self-start sm:justify-self-end">
                  <StatusBadge tone={toneFor(communication.status)}>{labelFor(communication.status)}</StatusBadge>
                </span>
              </button>

              {openId === communication.id ? (
                <div id={`communication-${communication.id}`} className="pb-5">
                  <CommunicationDetail communication={communication} targets={targets} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* A status this build does not know still renders, neutrally and by name. */
function labelFor(status: string): string {
  return communicationStatusLabels[status as CommunicationStatus] ?? status;
}

function toneFor(status: string) {
  return communicationStatusTone[status as CommunicationStatus] ?? "neutral";
}

function CommunicationDetail({
  communication,
  targets,
}: {
  communication: CustomerCommunication;
  targets: CommunicationTargets;
}) {
  const [showHtml, setShowHtml] = useState(false);

  const related: [string, CommunicationTarget | undefined][] = [
    ["Factuur", communication.invoiceId ? targets.invoices[communication.invoiceId] : undefined],
    ["Offerte", communication.quoteId ? targets.quotes[communication.quoteId] : undefined],
    ["Project", communication.projectId ? targets.projects[communication.projectId] : undefined],
    ["Dienst", communication.recurringServiceId ? targets.services[communication.recurringServiceId] : undefined],
  ];

  return (
    <div className="space-y-4 border-l-2 border-line-strong pl-4">
      <DetailList>
        <DetailRow term="Onderwerp">{communication.subject}</DetailRow>
        <DetailRow term="Ontvanger">
          <a href={`mailto:${communication.recipient}`} className="link-static">
            {communication.recipient}
          </a>
        </DetailRow>
        <DetailRow term="Verzonden">{formatDateTime(communicationMoment(communication))}</DetailRow>
        <DetailRow term="Categorie">{communicationCategoryLabel(communication.category)}</DetailRow>
        <DetailRow term="Status">
          <StatusBadge tone={toneFor(communication.status)}>{labelFor(communication.status)}</StatusBadge>
        </DetailRow>
        {communication.providerMessageId ? (
          <DetailRow term="Provider-id">
            <span className="break-all font-mono text-[0.82rem]">{communication.providerMessageId}</span>
          </DetailRow>
        ) : null}
        {communication.error ? (
          <DetailRow term="Foutmelding">
            <span className="text-danger">{communication.error}</span>
          </DetailRow>
        ) : null}
        {related.map(([term, target]) =>
          target ? (
            <DetailRow key={term} term={term}>
              {target.href ? (
                <Link href={target.href} className="link-static">
                  {target.label}
                </Link>
              ) : (
                target.label
              )}
            </DetailRow>
          ) : null,
        )}
      </DetailList>

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h3 className="label-mono text-ink">Bericht</h3>
          {communication.bodyHtml ? (
            <button
              type="button"
              onClick={() => setShowHtml(!showHtml)}
              className="link-static text-[0.85rem] text-ink"
            >
              {showHtml ? "Toon platte tekst" : "Toon HTML-weergave"}
            </button>
          ) : null}
        </div>

        {showHtml && communication.bodyHtml ? (
          /*
            The mail as the customer saw it, in a frame with no privileges at
            all: an empty sandbox attribute blocks scripts, forms, navigation
            and same-origin access, so stored HTML cannot reach the admin page
            around it. That is why the HTML is never inlined here.
          */
          <iframe
            title={`HTML-weergave van ${communication.subject}`}
            sandbox=""
            srcDoc={communication.bodyHtml}
            className="mt-3 h-[30rem] w-full rounded-xs border border-line bg-white"
          />
        ) : (
          <pre className="mt-3 max-h-[30rem] overflow-auto whitespace-pre-wrap break-words rounded-xs border border-line bg-surface p-4 font-sans text-[0.88rem] leading-relaxed text-body">
            {communication.bodyText}
          </pre>
        )}
      </div>
    </div>
  );
}
