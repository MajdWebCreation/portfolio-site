import Link from "next/link";
import StatusBadge from "@/components/admin/status-badge";
import { formatDateTime } from "@/lib/admin/format";
import { customerPaymentStatusLabels, customerPaymentStatusTone, type CustomerFinancials } from "@/lib/payments/customer-status";
import { paymentSourceLabels } from "@/lib/payments/types";
import { formatCents } from "@/lib/money";

/**
 * How this customer stands financially, in a few lines. Every number is
 * derived from the invoices, payments and credit notes at render time;
 * nothing here is a stored field an admin could set by hand. The history,
 * the credit notes and the refunds live on the payments page, filtered to
 * this customer -- this is the summary and the way there.
 */
export type CustomerFinanceSummary = {
  financials: CustomerFinancials;
  /** Services that collect right now. */
  collectingServices: number;
  /** Across this customer's credit notes. */
  refundDueCents: number;
  /** Credit notes that still need something: a refund, or finishing. */
  openCreditNotes: number;
  /** The one thing that needs attention, if any. */
  warning?: string;
};

export default function CustomerFinance({ customerId, summary }: { customerId: string; summary: CustomerFinanceSummary }) {
  const { financials } = summary;
  const { status, outstandingCents, overdueCents, lastSuccessfulPayment } = financials;

  return (
    <div className="border-t border-line pt-6">
      <h2 className="label-mono text-ink">Betalingen</h2>
      <div className="mt-3">
        <StatusBadge tone={customerPaymentStatusTone[status]}>{customerPaymentStatusLabels[status]}</StatusBadge>
      </div>
      <dl className="mt-4 space-y-1.5 text-[0.9rem]">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Openstaand</dt>
          <dd className="tabular font-medium text-ink">{formatCents(outstandingCents)}</dd>
        </div>
        {overdueCents > 0 ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted">Achterstallig</dt>
            <dd className="tabular font-medium text-danger">{formatCents(overdueCents)}</dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Laatste betaling</dt>
          <dd className="tabular text-right text-ink">
            {lastSuccessfulPayment
              ? `${formatCents(lastSuccessfulPayment.amountCents)} · ${formatDateTime(lastSuccessfulPayment.paidAt ?? lastSuccessfulPayment.updatedAt)}`
              : "Nog geen"}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Maandelijkse diensten</dt>
          <dd className="tabular text-ink">{summary.collectingServices}</dd>
        </div>
        {summary.refundDueCents > 0 ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted">Nog terug te betalen</dt>
            <dd className="tabular font-medium text-accent">{formatCents(summary.refundDueCents)}</dd>
          </div>
        ) : null}
      </dl>
      {lastSuccessfulPayment ? (
        <p className="mt-2 text-[0.82rem] text-muted">Laatste betaling via {paymentSourceLabels[lastSuccessfulPayment.source]}.</p>
      ) : null}
      {summary.warning ? (
        <p role="alert" className="mt-3 border-l-2 border-danger pl-3 text-[0.85rem] leading-snug text-danger">
          {summary.warning}
        </p>
      ) : null}
      <p className="mt-4 text-[0.9rem]">
        <Link href={`/admin/betalingen?klant=${customerId}`} className="link-static text-ink">
          Alle betalingen bekijken
        </Link>
      </p>
    </div>
  );
}
