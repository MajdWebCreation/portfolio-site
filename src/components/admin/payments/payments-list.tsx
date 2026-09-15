"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FilterBar, FilterSelect, SearchField, FilterSummary, NoMatches } from "@/components/admin/filter-bar";
import StatusBadge from "@/components/admin/status-badge";
import type { Customer } from "@/lib/admin/customers/types";
import { formatDateTime } from "@/lib/admin/format";
import {
  paymentSourceLabels,
  paymentStatusLabels,
  paymentStatusOrder,
  paymentStatusTone,
  type Payment,
} from "@/lib/payments/types";
import { formatCents } from "@/lib/money";

export default function PaymentsList({ payments, customers }: { payments: Payment[]; customers: Customer[] }) {
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");

  const companyName = useMemo(() => {
    const byId = new Map(customers.map((customer) => [customer.id, customer.companyName]));
    return (id: string) => byId.get(id) ?? "Onbekende klant";
  }, [customers]);

  const filtered = status !== "all" || query.trim() !== "";
  function reset() {
    setStatus("all");
    setQuery("");
  }

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return payments
      .filter((payment) => status === "all" || payment.status === status)
      .filter(
        (payment) =>
          !needle ||
          [companyName(payment.customerId), payment.description, payment.providerPaymentId ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(needle),
      );
  }, [payments, status, query, companyName]);

  return (
    <div className="space-y-5">
      <FilterBar label="Betalingen filteren">
        <FilterSelect id="payment-status" label="Status" value={status} onChange={setStatus}>
          <option value="all">Alle</option>
          {paymentStatusOrder.map((value) => (
            <option key={value} value={value}>
              {paymentStatusLabels[value]}
            </option>
          ))}
        </FilterSelect>
        <SearchField id="payment-search" label="Zoeken" value={query} onChange={setQuery} placeholder="Klant, omschrijving of Mollie-id" />
      </FilterBar>

      <FilterSummary filtered={filtered} onReset={reset}>
        {rows.length} van {payments.length} betalingen
      </FilterSummary>

      {rows.length === 0 ? (
        <NoMatches>Geen betalingen die aan deze filters voldoen.</NoMatches>
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th scope="col">Klant</th>
              <th scope="col">Omschrijving</th>
              <th scope="col">Bron</th>
              <th scope="col" className="adm-num">Bedrag</th>
              <th scope="col">Moment</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((payment) => (
              <tr key={payment.id}>
                <td className="adm-primary" data-label="Klant">
                  <Link href={`/admin/klanten/${payment.customerId}`} className="adm-title link-static adm-wrap">
                    {companyName(payment.customerId)}
                  </Link>
                </td>
                <td data-label="Omschrijving" className="adm-wrap">
                  <Link href={`/admin/facturen/${payment.invoiceId}`} className="link-static">
                    {payment.description || "Factuur"}
                  </Link>
                </td>
                <td data-label="Bron">{paymentSourceLabels[payment.source]}</td>
                <td data-label="Bedrag" className="adm-num tabular">{formatCents(payment.amountCents)}</td>
                <td data-label="Moment">{formatDateTime(payment.paidAt ?? payment.createdAt)}</td>
                <td data-label="Status">
                  <StatusBadge tone={paymentStatusTone[payment.status]}>{paymentStatusLabels[payment.status]}</StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
