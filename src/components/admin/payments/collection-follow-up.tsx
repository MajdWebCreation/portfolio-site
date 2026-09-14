import Link from "next/link";
import StatusBadge from "@/components/admin/status-badge";
import { formatDate } from "@/lib/admin/format";
import type { Invoice } from "@/lib/admin/invoices/types";
import { formatCents } from "@/lib/money";
import { reminderStageLabels } from "@/lib/payments/collection-policy";
import {
  collectionStateLabels,
  collectionStateTone,
  type CollectionView,
} from "@/lib/payments/collection-state";

/**
 * Invoices that are being chased, on the payments overview.
 *
 * Ordered by how much attention they need rather than by date: the ones the
 * automation has run out on come first, because those are the only rows that
 * need a decision from a person.
 */
export type FollowUpRow = { invoice: Invoice; view: CollectionView };

const day = (key: string) => formatDate(`${key}T12:00:00+02:00`);

export default function CollectionFollowUp({ rows }: { rows: FollowUpRow[] }) {
  if (rows.length === 0) {
    return <p className="text-[0.95rem] text-muted">Geen facturen in opvolging. Alles is op tijd of al betaald.</p>;
  }

  return (
    <ul className="divide-y divide-line border-y border-line">
      {rows.map(({ invoice, view }) => (
        <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-[0.92rem]">
          <span className="min-w-0">
            <Link href={`/admin/facturen/${invoice.id}`} className="link-static block truncate font-medium text-ink">
              {invoice.customer.companyName} · {invoice.number.value}
            </Link>
            <span className="block text-[0.83rem] text-muted">
              {view.daysOverdue} dagen te laat · {formatCents(view.outstandingCents)} open · vervallen{" "}
              {day(view.dueDate)}
              {view.sent.length > 0 ? ` · ${reminderStageLabels[view.sent[view.sent.length - 1].stage].toLowerCase()} verstuurd` : " · nog geen herinnering"}
            </span>
          </span>
          {view.collectionReady ? (
            <StatusBadge tone="danger">Incasso gereed</StatusBadge>
          ) : view.state !== "active" ? (
            <StatusBadge tone={collectionStateTone[view.state]}>{collectionStateLabels[view.state]}</StatusBadge>
          ) : (
            <StatusBadge tone="accent">
              {view.dueStage
                ? reminderStageLabels[view.dueStage]
                : view.nextStep
                  ? `Volgende: ${day(view.nextStep.on)}`
                  : "In opvolging"}
            </StatusBadge>
          )}
        </li>
      ))}
    </ul>
  );
}
