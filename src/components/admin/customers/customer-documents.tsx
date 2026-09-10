import Link from "next/link";
import StatusBadge from "@/components/admin/status-badge";
import { formatDate } from "@/lib/admin/format";
import { invoiceStatusLabels, invoiceStatusTone, type Invoice } from "@/lib/admin/invoices/types";
import { quoteStatusLabels, quoteStatusTone, type Quote } from "@/lib/admin/quotes/types";
import { calculateTotals, formatCents } from "@/lib/money";

type CustomerDocumentsProps = { customerId: string; quotes: Quote[]; invoices: Invoice[] };

const day = (key: string) => formatDate(`${key}T12:00:00+02:00`);

/** The stored quotes and invoices of one customer. */
export default function CustomerDocuments({ customerId, quotes: allQuotes, invoices: allInvoices }: CustomerDocumentsProps) {
  const quotes = allQuotes.filter((quote) => quote.customer.customerId === customerId);
  const invoices = allInvoices.filter((invoice) => invoice.customer.customerId === customerId);

  const list = <T extends Quote | Invoice>(items: T[], href: string, empty: string, status: (item: T) => React.ReactNode) =>
    items.length === 0 ? (
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
    );

  return (
    <>
      <div className="border-t border-line pt-6">
        <h2 className="label-mono text-ink">Offertes</h2>
        {list(quotes, "/admin/offertes", "Geen offertes voor deze klant.", (quote) => (
          <StatusBadge tone={quoteStatusTone[quote.status]}>{quoteStatusLabels[quote.status]}</StatusBadge>
        ))}
      </div>
      <div className="border-t border-line pt-6">
        <h2 className="label-mono text-ink">Facturen</h2>
        {list(invoices, "/admin/facturen", "Geen facturen voor deze klant.", (invoice) => (
          <StatusBadge tone={invoiceStatusTone[invoice.status]}>{invoiceStatusLabels[invoice.status]}</StatusBadge>
        ))}
      </div>
    </>
  );
}
