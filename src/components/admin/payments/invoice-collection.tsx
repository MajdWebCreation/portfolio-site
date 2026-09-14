"use client";

import { useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { DetailList, DetailRow } from "@/components/admin/detail-list";
import StatusBadge from "@/components/admin/status-badge";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import { formatCents } from "@/lib/money";
import { reminderStageLabels } from "@/lib/payments/collection-policy";
import { setInvoiceCollectionState } from "@/lib/payments/collection-actions";
import {
  collectionActions,
  collectionAutomationLabels,
  collectionAutomationTone,
  collectionBlockLabels,
  collectionStateLabels,
  collectionStateTone,
  type CollectionView,
} from "@/lib/payments/collection-state";

/**
 * Betalingsopvolging: what the automation has done with this invoice, and
 * what it will do next.
 *
 * Everything above the buttons is read, not stored. The section shows the
 * same answer `invoiceCollectionView` gives the daily job, so "volgende stap"
 * is a promise the job will actually keep rather than a second calendar.
 */
const day = (key: string) => formatDate(`${key}T12:00:00+02:00`);

export default function InvoiceCollection({ invoiceId, view }: { invoiceId: string; view: CollectionView }) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function apply(state: string) {
    setPending(state);
    setError(null);
    setInvoiceCollectionState(invoiceId, state)
      .then((result) => {
        if (!result.ok) setError(result.error);
      })
      .catch(() => setError("Bijwerken mislukt."))
      .finally(() => setPending(null));
  }

  const sentStages = new Set(view.sent.map((event) => event.stage));

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
      <div className="space-y-6">
        <DetailList>
          <DetailRow term="Vervaldatum">{day(view.dueDate)}</DetailRow>
          <DetailRow term="Dagen te laat">
            {view.daysOverdue > 0 ? (
              <span className="tabular">{view.daysOverdue}</span>
            ) : (
              <span className="text-muted">Nog niet verlopen</span>
            )}
          </DetailRow>
          <DetailRow term="Nog te voldoen">
            <span className="tabular">{formatCents(view.outstandingCents)}</span>
          </DetailRow>
          <DetailRow term="Automatisering">
            <span className="inline-flex flex-wrap items-center gap-2">
              <StatusBadge tone={collectionAutomationTone[view.automation]}>
                {collectionAutomationLabels[view.automation]}
              </StatusBadge>
              {view.state !== "active" ? (
                <StatusBadge tone={collectionStateTone[view.state]}>{collectionStateLabels[view.state]}</StatusBadge>
              ) : null}
              {view.collectionReady ? <StatusBadge tone="danger">Incasso gereed</StatusBadge> : null}
            </span>
          </DetailRow>
          <DetailRow term="Volgende stap">
            {view.dueStage ? (
              <>
                {reminderStageLabels[view.dueStage]}
                <span className="block text-[0.85rem] text-muted">Gaat bij de eerstvolgende dagelijkse run uit.</span>
              </>
            ) : view.nextStep ? (
              <>
                {reminderStageLabels[view.nextStep.stage]}
                <span className="block text-[0.85rem] text-muted">Vanaf {day(view.nextStep.on)}</span>
              </>
            ) : view.collectionReady ? (
              <>
                Geen automatische stap meer
                <span className="block text-[0.85rem] text-muted">
                  Incasso gereed sinds {day(view.collectionReadyOn)}. Jij beslist wat er nu gebeurt; er wordt nooit
                  automatisch een incassobureau ingeschakeld.
                </span>
              </>
            ) : (
              <span className="text-muted">{view.blocked ? collectionBlockLabels[view.blocked] : "Geen"}</span>
            )}
          </DetailRow>
          {view.blocked && (view.dueStage || view.nextStep) ? (
            <DetailRow term="Let op">{collectionBlockLabels[view.blocked]}</DetailRow>
          ) : null}
        </DetailList>

        <div>
          <h3 className="label-mono text-ink">Verstuurde herinneringen</h3>
          {view.attempts.length === 0 ? (
            <p className="mt-3 text-[0.9rem] text-muted">Nog geen herinneringen verstuurd.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {view.attempts.map((event) => (
                <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 text-[0.9rem]">
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{reminderStageLabels[event.stage]}</span>
                    <span className="block text-[0.82rem] text-muted">
                      {event.sentAt ? formatDateTime(event.sentAt) : `Klaargezet ${formatDateTime(event.claimedAt)}`} ·{" "}
                      {event.recipient}
                    </span>
                    {event.error ? <span className="block text-[0.82rem] text-danger">{event.error}</span> : null}
                  </span>
                  <StatusBadge
                    tone={event.status === "sent" ? "success" : event.status === "failed" ? "danger" : "neutral"}
                  >
                    {event.status === "sent" ? "Verzonden" : event.status === "failed" ? "Mislukt" : "In behandeling"}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          )}
          {view.attempts.length > 0 && sentStages.size > 0 ? (
            <p className="mt-2 text-[0.82rem] text-muted">
              Elke verzending staat ook bij de klant onder Communicatie.
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 lg:border-l lg:border-line lg:pl-8">
        <h3 className="label-mono text-ink">Opvolging</h3>
        {view.state === "active" ? (
          collectionActions.map((action) => (
            <div key={action.state}>
              <AdminButton
                variant="secondary"
                className="min-h-8 w-full px-3 text-[0.85rem]"
                disabled={pending !== null}
                onClick={() => apply(action.state)}
              >
                {pending === action.state ? "Bezig…" : action.label}
              </AdminButton>
              <p className="mt-1 text-[0.8rem] text-muted">{action.hint}</p>
            </div>
          ))
        ) : (
          <div>
            <p className="text-[0.88rem] text-muted">
              {collectionStateLabels[view.state]}. De automatische herinneringen staan stil.
            </p>
            <AdminButton
              variant="secondary"
              className="mt-3 min-h-8 w-full px-3 text-[0.85rem]"
              disabled={pending !== null}
              onClick={() => apply("active")}
            >
              {pending === "active" ? "Bezig…" : "Herinneringen hervatten"}
            </AdminButton>
          </div>
        )}
        {error ? (
          <p role="alert" className="border-l-2 border-danger pl-3 text-[0.85rem] text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
