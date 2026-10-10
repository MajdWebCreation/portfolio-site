"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FilterBar, FilterSelect, FilterSummary, NoMatches, SearchField } from "@/components/admin/filter-bar";
import StatusBadge from "@/components/admin/status-badge";
import { creditNoteStateLabels, creditNoteStateTone } from "@/lib/admin/credit-notes/settlement";
import type { Customer } from "@/lib/admin/customers/types";
import { formatDate } from "@/lib/admin/format";
import { formatCents } from "@/lib/money";
import type { CreditNoteRow } from "@/lib/payments/finance-overview";

const day = (key: string) => formatDate(`${key}T12:00:00+02:00`);

type Filter = "all" | "open" | "processed" | "refund_due" | "manual" | "mollie";

const filterOptions: { value: Filter; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "open", label: "Open" },
  { value: "processed", label: "Volledig verwerkt" },
  { value: "refund_due", label: "Refund vereist" },
  { value: "manual", label: "Handmatig terugbetaald" },
  { value: "mollie", label: "Via Mollie" },
];

/** Every credit note ever made, with how much of it went back. */
export default function CreditNotesTable({ rows, customers, customerId }: { rows: CreditNoteRow[]; customers: Customer[]; customerId?: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [customer, setCustomer] = useState(customerId ?? "all");
  const [query, setQuery] = useState("");

  const filtered = filter !== "all" || customer !== "all" || query.trim() !== "";
  function reset() {
    setFilter("all");
    setCustomer("all");
    setQuery("");
  }

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((row) => customer === "all" || row.creditNote.customer.customerId === customer)
      .filter((row) => {
        if (filter === "open") return row.unfinished || row.state === "refund_due" || row.state === "in_progress";
        if (filter === "processed") return !row.unfinished && (row.state === "processed" || row.state === "offset");
        if (filter === "refund_due") return row.state === "refund_due";
        if (filter === "manual") return row.methods.includes("manual");
        if (filter === "mollie") return row.methods.includes("mollie");
        return true;
      })
      .filter((row) => !needle || [row.creditNote.number.value, row.invoiceNumber, row.customerName, row.creditNote.reason].join(" ").toLowerCase().includes(needle));
  }, [rows, filter, customer, query]);

  return (
    <div className="space-y-5">
      <FilterBar label="Creditnota's filteren">
        <FilterSelect id="fin-credit-filter" label="Status" value={filter} onChange={(value) => setFilter(value as Filter)}>
          {filterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect id="fin-credit-customer" label="Klant" value={customer} onChange={setCustomer}>
          <option value="all">Alle klanten</option>
          {customers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.companyName}
            </option>
          ))}
        </FilterSelect>
        <SearchField id="fin-credit-search" label="Zoeken" value={query} onChange={setQuery} placeholder="Nummer, factuur of klant" />
      </FilterBar>
      <FilterSummary filtered={filtered} onReset={reset}>
        {shown.length} van {rows.length} creditnota&apos;s
      </FilterSummary>
      {shown.length === 0 ? (
        <NoMatches>{rows.length === 0 ? "Nog geen creditnota's. Je maakt ze aan op een factuur, of bij een opgezegde dienst." : "Geen creditnota's die aan deze filters voldoen."}</NoMatches>
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th scope="col">Creditnota</th>
              <th scope="col">Datum</th>
              <th scope="col">Klant</th>
              <th scope="col">Factuur</th>
              <th scope="col" className="adm-xl">Reden</th>
              <th scope="col" className="adm-num">Credit</th>
              <th scope="col" className="adm-num">Terugbetaald</th>
              <th scope="col" className="adm-num">Resterend</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.creditNote.id}>
                <td className="adm-primary" data-label="Creditnota">
                  <Link href={`/admin/betalingen/creditnotas/${row.creditNote.id}`} className="adm-title link-static">
                    {row.creditNote.number.value}
                  </Link>
                </td>
                <td data-label="Datum">{day(row.creditNote.issueDate)}</td>
                <td data-label="Klant" className="adm-wrap">{row.customerName}</td>
                <td data-label="Factuur">
                  <Link href={`/admin/facturen/${row.creditNote.invoiceId}`} className="link-static">
                    {row.invoiceNumber}
                  </Link>
                </td>
                <td data-label="Reden" className="adm-xl adm-wrap">{row.creditNote.reason}</td>
                <td data-label="Credit" className="adm-num">{formatCents(row.creditNote.totalCents)}</td>
                <td data-label="Terugbetaald" className="adm-num">{row.ledger.refundedCents > 0 ? formatCents(row.ledger.refundedCents) : <span className="text-muted">—</span>}</td>
                <td data-label="Resterend" className="adm-num">{row.ledger.remainingCents > 0 ? formatCents(row.ledger.remainingCents) : <span className="text-muted">—</span>}</td>
                <td data-label="Status">
                  {row.unfinished ? (
                    <StatusBadge tone="danger">Niet afgerond</StatusBadge>
                  ) : (
                    <StatusBadge tone={creditNoteStateTone[row.state]}>{creditNoteStateLabels[row.state]}</StatusBadge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
