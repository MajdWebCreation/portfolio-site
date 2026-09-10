import { formatCents, type DocumentTotals } from "@/lib/money";

/** Subtotal, VAT per rate and total, computed by the money core. */
export default function DocumentTotalsView({ totals }: { totals: DocumentTotals }) {
  return (
    <dl className="ml-auto w-full max-w-[22rem] text-[0.95rem]">
      <div className="flex justify-between gap-6 border-t border-line py-2">
        <dt className="text-muted">Subtotaal excl. btw</dt>
        <dd className="tabular text-ink">{formatCents(totals.subtotalCents)}</dd>
      </div>
      {totals.vatGroups.map((group) => (
        <div key={group.rate} className="flex justify-between gap-6 border-t border-line py-2">
          <dt className="text-muted">
            Btw {group.rate}% over {formatCents(group.netCents)}
          </dt>
          <dd className="tabular text-ink">{formatCents(group.vatCents)}</dd>
        </div>
      ))}
      <div className="flex justify-between gap-6 border-t-2 border-ink py-2.5 text-[1.05rem] font-semibold text-ink">
        <dt>Totaal incl. btw</dt>
        <dd className="tabular">{formatCents(totals.totalCents)}</dd>
      </div>
    </dl>
  );
}
