"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FilterBar, FilterSelect, FilterSummary, NoMatches, SearchField } from "@/components/admin/filter-bar";
import StatusBadge from "@/components/admin/status-badge";
import type { Customer } from "@/lib/admin/customers/types";
import { formatDate } from "@/lib/admin/format";
import { invoiceStatusLabels, invoiceStatusTone } from "@/lib/admin/invoices/types";
import { formatCents } from "@/lib/money";
import type { InvoiceRow } from "@/lib/payments/finance-overview";

const day = (key: string) => formatDate(`${key}T12:00:00+02:00`);

type Status = "all" | "open" | "paid" | "overdue" | "credited";

const statusOptions: { value: Status; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "open", label: "Open" },
  { value: "paid", label: "Betaald" },
  { value: "overdue", label: "Achterstallig" },
  { value: "credited", label: "(Deels) gecrediteerd" },
];

function monthOptions(rows: InvoiceRow[]): string[] {
  return [...new Set(rows.map((row) => row.invoice.issueDate.slice(0, 7)))].sort().reverse();
}

/** Every invoice that is a document, with what was paid and what is still owed. */
export default function InvoiceTable({ rows, customers, customerId }: { rows: InvoiceRow[]; customers: Customer[]; customerId?: string }) {
  const [status, setStatus] = useState<Status>("all");
  const [customer, setCustomer] = useState(customerId ?? "all");
  const [month, setMonth] = useState("all");
  const [query, setQuery] = useState("");

  const filtered = status !== "all" || customer !== "all" || month !== "all" || query.trim() !== "";
  function reset() {
    setStatus("all");
    setCustomer("all");
    setMonth("all");
    setQuery("");
  }

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((row) => customer === "all" || row.invoice.customer.customerId === customer)
      .filter((row) => month === "all" || row.invoice.issueDate.startsWith(month))
      .filter((row) => {
        if (status === "open") return row.outstandingCents > 0;
        if (status === "paid") return row.invoice.status === "paid" || (row.outstandingCents === 0 && row.paidCents > 0);
        if (status === "overdue") return row.overdue;
        if (status === "credited") return row.credited !== "none";
        return true;
      })
      .filter((row) => !needle || [row.invoice.number.value, row.customerName, row.invoice.paymentReference].join(" ").toLowerCase().includes(needle));
  }, [rows, status, customer, month, query]);

  const months = useMemo(() => monthOptions(rows), [rows]);

  return (
    <div className="space-y-5">
      <FilterBar label="Facturen filteren">
        <FilterSelect id="fin-invoice-status" label="Status" value={status} onChange={(value) => setStatus(value as Status)}>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect id="fin-invoice-customer" label="Klant" value={customer} onChange={setCustomer}>
          <option value="all">Alle klanten</option>
          {customers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.companyName}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect id="fin-invoice-month" label="Periode" value={month} onChange={setMonth}>
          <option value="all">Alle maanden</option>
          {months.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </FilterSelect>
        <SearchField id="fin-invoice-search" label="Zoeken" value={query} onChange={setQuery} placeholder="Factuurnummer of klant" />
      </FilterBar>
      <FilterSummary filtered={filtered} onReset={reset}>
        {shown.length} van {rows.length} facturen
      </FilterSummary>
      {shown.length === 0 ? (
        <NoMatches>{rows.length === 0 ? "Nog geen definitieve facturen." : "Geen facturen die aan deze filters voldoen."}</NoMatches>
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th scope="col">Factuur</th>
              <th scope="col">Klant</th>
              <th scope="col">Datum</th>
              <th scope="col">Vervaldatum</th>
              <th scope="col" className="adm-num">Bedrag</th>
              <th scope="col" className="adm-num">Betaald</th>
              <th scope="col" className="adm-num">Openstaand</th>
              <th scope="col">Status</th>
              <th scope="col" className="adm-xl">Betaalmethode</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.invoice.id}>
                <td className="adm-primary" data-label="Factuur">
                  <Link href={`/admin/facturen/${row.invoice.id}`} className="adm-title link-static">
                    {row.invoice.number.value}
                  </Link>
                </td>
                <td data-label="Klant" className="adm-wrap">{row.customerName}</td>
                <td data-label="Datum">{day(row.invoice.issueDate)}</td>
                <td data-label="Vervaldatum">{day(row.invoice.dueDate)}</td>
                <td data-label="Bedrag" className="adm-num">
                  {formatCents(row.totalCents)}
                  {row.creditedCents > 0 ? <span className="block text-[0.78rem] text-muted">−{formatCents(row.creditedCents)} gecrediteerd</span> : null}
                </td>
                <td data-label="Betaald" className="adm-num">{row.paidCents > 0 ? formatCents(row.paidCents) : <span className="text-muted">—</span>}</td>
                <td data-label="Openstaand" className="adm-num">{row.outstandingCents > 0 ? formatCents(row.outstandingCents) : <span className="text-muted">—</span>}</td>
                <td data-label="Status">
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <StatusBadge tone={invoiceStatusTone[row.invoice.status]}>{invoiceStatusLabels[row.invoice.status]}</StatusBadge>
                    {row.overdue ? <StatusBadge tone="danger">Vervallen</StatusBadge> : null}
                    {row.paymentFailed ? <StatusBadge tone="danger">Betaling mislukt</StatusBadge> : null}
                    {row.credited === "full" ? <StatusBadge tone="neutral">Gecrediteerd</StatusBadge> : row.credited === "partial" ? <StatusBadge tone="neutral">Deels gecrediteerd</StatusBadge> : null}
                  </span>
                </td>
                <td data-label="Methode" className="adm-xl">{row.methodLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
