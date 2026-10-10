import Link from "next/link";
import StatusBadge from "@/components/admin/status-badge";
import type { AttentionItem } from "@/lib/payments/finance-overview";
import { formatCents } from "@/lib/money";

const kindLabels: Record<AttentionItem["kind"], string> = {
  overdue: "Achterstallig",
  payment_failed: "Betaling mislukt",
  lifecycle: "Incasso",
  credit_open: "Te crediteren",
  refund_due: "Nog terug te betalen",
  refund_failed: "Refund mislukt",
  credit_unfinished: "Niet afgerond",
  announce: "Vooraankondiging",
};

/** "Wat vraagt mijn aandacht?" -- a work list, nothing that is fine. */
export default function AttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return <p className="text-[0.95rem] text-muted">Niets vraagt aandacht. Alles staat bij, er loopt geen mislukte betaling en er is niets te crediteren.</p>;
  }
  return (
    <ul className="divide-y divide-line border-y border-line">
      {items.map((item) => (
        <li key={item.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-[0.92rem]">
          <span className="min-w-0 flex-1">
            <Link href={item.href} className="link-static block truncate font-medium text-ink">
              {item.label}
            </Link>
            <span className="block text-[0.83rem] text-muted">{item.detail}</span>
          </span>
          <span className="flex items-center gap-3">
            {item.amountCents !== undefined ? <span className="tabular text-ink">{formatCents(item.amountCents)}</span> : null}
            <StatusBadge tone={item.tone}>{kindLabels[item.kind]}</StatusBadge>
          </span>
        </li>
      ))}
    </ul>
  );
}
