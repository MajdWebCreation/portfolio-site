import StatusBadge from "@/components/admin/status-badge";
import { formatDateTime } from "@/lib/admin/format";
import {
  customerPaymentStatusLabels,
  customerPaymentStatusTone,
  type CustomerFinancials,
} from "@/lib/payments/customer-status";
import { paymentSourceLabels } from "@/lib/payments/types";
import { formatCents } from "@/lib/money";

/**
 * How this customer stands financially. Every number is derived from the
 * invoices and payments at render time; nothing here is a stored field an
 * admin could set by hand, which is what keeps it honest.
 */
export default function CustomerFinance({ financials }: { financials: CustomerFinancials }) {
  const { status, outstandingCents, overdueCents, openInvoiceCount, lastSuccessfulPayment } = financials;

  return (
    <div className="border-t border-line pt-6">
      <h2 className="label-mono text-ink">Betaalstatus</h2>
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
          <dt className="text-muted">Open facturen</dt>
          <dd className="tabular text-ink">{openInvoiceCount}</dd>
        </div>
      </dl>
      {lastSuccessfulPayment ? (
        <p className="mt-3 text-[0.85rem] leading-snug text-muted">
          Laatste betaling {formatCents(lastSuccessfulPayment.amountCents)} op{" "}
          {formatDateTime(lastSuccessfulPayment.paidAt ?? lastSuccessfulPayment.updatedAt)} via{" "}
          {paymentSourceLabels[lastSuccessfulPayment.source]}.
        </p>
      ) : (
        <p className="mt-3 text-[0.85rem] text-muted">Nog geen betaling ontvangen.</p>
      )}
    </div>
  );
}
