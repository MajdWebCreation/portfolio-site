import Link from "next/link";
import StatusBadge from "@/components/admin/status-badge";
import type { Customer } from "@/lib/admin/customers/types";
import {
  customerPaymentStatusLabels,
  customerPaymentStatusTone,
  type CustomerFinancials,
} from "@/lib/payments/customer-status";
import { formatCents } from "@/lib/money";

export type CustomerBalance = { customer: Customer; financials: CustomerFinancials };

/**
 * Who owes what, derived from the invoices and payments themselves. Customers
 * that are square are left out: a list of everything that is fine is not a
 * work list.
 */
export default function CustomerBalances({ balances }: { balances: CustomerBalance[] }) {
  const rows = balances
    .filter(({ financials }) => financials.status !== "up_to_date")
    .sort((a, b) => b.financials.overdueCents - a.financials.overdueCents || b.financials.outstandingCents - a.financials.outstandingCents);

  if (rows.length === 0) {
    return <p className="text-[0.95rem] text-muted">Geen openstaande bedragen. Alle klanten staan bij.</p>;
  }

  return (
    <table className="adm-table">
      <thead>
        <tr>
          <th scope="col">Klant</th>
          <th scope="col" className="adm-num">Openstaand</th>
          <th scope="col" className="adm-num">Achterstallig</th>
          <th scope="col" className="adm-num">Facturen</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ customer, financials }) => (
          <tr key={customer.id}>
            <td className="adm-primary" data-label="Klant">
              <Link href={`/admin/klanten/${customer.id}`} className="adm-title link-static adm-wrap">
                {customer.companyName}
              </Link>
            </td>
            <td data-label="Openstaand" className="adm-num tabular">{formatCents(financials.outstandingCents)}</td>
            <td data-label="Achterstallig" className="adm-num tabular">
              {financials.overdueCents > 0 ? formatCents(financials.overdueCents) : <span className="text-muted">—</span>}
            </td>
            <td data-label="Facturen" className="adm-num tabular">{financials.openInvoiceCount}</td>
            <td data-label="Status">
              <StatusBadge tone={customerPaymentStatusTone[financials.status]}>
                {customerPaymentStatusLabels[financials.status]}
              </StatusBadge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
