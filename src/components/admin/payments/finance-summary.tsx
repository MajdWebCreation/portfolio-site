import type { FinanceSummary } from "@/lib/payments/finance-overview";
import { formatCents } from "@/lib/money";

/**
 * Six figures, each with a reliable source, in one quiet row. No cards: a
 * term, a number, a line under it.
 */
export default function FinanceSummaryRow({ summary }: { summary: FinanceSummary }) {
  const items: { label: string; value: string; note: string; tone?: "danger" | "accent" }[] = [
    { label: "Openstaand", value: formatCents(summary.outstandingCents), note: `${summary.outstandingCount} ${summary.outstandingCount === 1 ? "factuur" : "facturen"}` },
    {
      label: "Achterstallig",
      value: formatCents(summary.overdueCents),
      note: summary.overdueCount > 0 ? `${summary.overdueCount} over de vervaldatum` : "Niets te laat",
      ...(summary.overdueCents > 0 ? { tone: "danger" as const } : {}),
    },
    { label: "Deze maand ontvangen", value: formatCents(summary.receivedThisMonthCents), note: `${summary.receivedThisMonthCount} ${summary.receivedThisMonthCount === 1 ? "betaling" : "betalingen"}` },
    { label: "Komende incasso's", value: formatCents(summary.upcomingCollectionsCents), note: `${summary.upcomingCollections} gepland` },
    {
      label: "Mislukte betalingen",
      value: String(summary.failedPayments),
      note: summary.failedPayments > 0 ? "Zonder latere betaling" : "Geen",
      ...(summary.failedPayments > 0 ? { tone: "danger" as const } : {}),
    },
    {
      label: "Open crediteringen",
      value: formatCents(summary.refundDueCents),
      note: summary.openCreditsCount > 0 ? `${summary.openCreditsCount} nog te verwerken` : "Alles verwerkt",
      ...(summary.refundDueCents > 0 ? { tone: "accent" as const } : {}),
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 border-t border-line pt-3">
          <dt className="label-mono text-muted">{item.label}</dt>
          <dd className={`tabular mt-1.5 truncate text-[1.15rem] font-medium ${item.tone === "danger" ? "text-danger" : item.tone === "accent" ? "text-accent" : "text-ink"}`}>
            {item.value}
          </dd>
          <dd className="mt-0.5 text-[0.82rem] text-muted">{item.note}</dd>
        </div>
      ))}
    </dl>
  );
}
