import Link from "next/link";
import StatusBadge from "@/components/admin/status-badge";
import { formatDate } from "@/lib/admin/format";
import { invoiceStatusLabels, invoiceStatusTone, type Invoice } from "@/lib/admin/invoices/types";
import { quoteStatusLabels, quoteStatusTone, type Quote } from "@/lib/admin/quotes/types";
import { calculateTotals, formatCents } from "@/lib/money";

const day = (key: string) => formatDate(`${key}T12:00:00+02:00`);

/**
 * The documents filed under a project. Each one names the project itself, so
 * a project can hold any number of either and nothing about the amounts is
 * copied onto the project: the totals below are computed from the lines of
 * the documents, the same way every other view computes them.
 */
function DocumentList<T extends Quote | Invoice>({
  title,
  items,
  href,
  empty,
  status,
}: {
  title: string;
  items: T[];
  href: string;
  empty: string;
  status: (item: T) => React.ReactNode;
}) {
  return (
    <div className="border-t border-line pt-6">
      <h2 className="label-mono text-ink">
        {title}
        {items.length > 0 ? <span className="ml-2 font-normal normal-case tracking-normal text-muted">{items.length}</span> : null}
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-[0.9rem] text-muted">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-[0.9rem]">
              <span className="min-w-0">
                <Link href={`${href}/${item.id}`} className="link-static block truncate font-medium text-ink">
                  {item.number.value}
                </Link>
                <span className="block text-[0.82rem] text-muted">
                  {day(item.issueDate)} · {formatCents(calculateTotals(item.lines).totalCents)}
                </span>
              </span>
              {status(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ProjectDocuments({ quotes, invoices }: { quotes: Quote[]; invoices: Invoice[] }) {
  return (
    <>
      <DocumentList
        title="Offertes"
        items={quotes}
        href="/admin/offertes"
        empty="Nog geen offertes onder dit project."
        status={(quote) => <StatusBadge tone={quoteStatusTone[quote.status]}>{quoteStatusLabels[quote.status]}</StatusBadge>}
      />
      <DocumentList
        title="Facturen"
        items={invoices}
        href="/admin/facturen"
        empty="Nog geen facturen onder dit project."
        status={(invoice) => <StatusBadge tone={invoiceStatusTone[invoice.status]}>{invoiceStatusLabels[invoice.status]}</StatusBadge>}
      />
    </>
  );
}
