"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import CtaLink from "@/components/cta-link";
import { FilterBar, FilterSelect, SearchField } from "@/components/admin/filter-bar";
import StatusBadge from "@/components/admin/status-badge";
import { formatDate } from "@/lib/admin/format";
import { invoiceStatusLabels, invoiceStatusOrder, invoiceStatusTone, type Invoice } from "@/lib/admin/invoices/types";
import { calculateTotals, formatCents } from "@/lib/money";

const day = (key: string) => formatDate(`${key}T12:00:00+02:00`);

export default function InvoicesList({ invoices, todayKey }: { invoices: Invoice[]; todayKey: string }) {
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return invoices
      .filter((invoice) => status === "all" || invoice.status === status)
      .filter((invoice) => !needle || [invoice.number.value, invoice.customer.companyName, invoice.paymentReference].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.updatedAt.localeCompare(a.updatedAt));
  }, [invoices, status, query]);

  const open = invoices.filter((invoice) => invoice.status === "sent" || invoice.status === "overdue");
  const openCents = open.reduce((sum, invoice) => sum + calculateTotals(invoice.lines).totalCents, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <FilterBar label="Facturen filteren">
          <FilterSelect id="invoice-status" label="Status" value={status} onChange={setStatus}>
            <option value="all">Alle</option>
            {invoiceStatusOrder.map((value) => (
              <option key={value} value={value}>
                {invoiceStatusLabels[value]}
              </option>
            ))}
          </FilterSelect>
          <SearchField id="invoice-search" label="Zoeken" value={query} onChange={setQuery} placeholder="Nummer, klant of kenmerk" />
        </FilterBar>
        <CtaLink href="/admin/facturen/nieuw" className="max-sm:w-full">
          Nieuwe factuur
        </CtaLink>
      </div>
      <p className="text-[0.85rem] text-muted" aria-live="polite">
        {rows.length} van {invoices.length} facturen
        {open.length > 0 ? ` · ${open.length} openstaand, samen ${formatCents(openCents)}` : ""}
      </p>
      {rows.length === 0 ? (
        <p className="border-y border-line py-8 text-center text-[0.95rem] text-muted">Geen facturen die aan deze filters voldoen.</p>
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th scope="col">Factuur</th>
              <th scope="col">Klant</th>
              <th scope="col">Factuurdatum</th>
              <th scope="col">Vervaldatum</th>
              <th scope="col" className="adm-num">
                Totaal incl.
              </th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((invoice) => {
              const late = (invoice.status === "sent" || invoice.status === "overdue") && invoice.dueDate < todayKey;
              return (
                <tr key={invoice.id}>
                  <td className="adm-primary" data-label="Factuur">
                    <Link href={`/admin/facturen/${invoice.id}`} className="adm-title link-static">
                      {invoice.number.value}
                    </Link>
                  </td>
                  <td data-label="Klant" className="adm-wrap">
                    {invoice.customer.companyName}
                  </td>
                  <td data-label="Factuurdatum">{day(invoice.issueDate)}</td>
                  <td data-label="Vervaldatum">
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {day(invoice.dueDate)}
                      {late ? <StatusBadge tone="danger">Vervallen</StatusBadge> : null}
                    </span>
                  </td>
                  <td data-label="Totaal" className="adm-num">
                    {formatCents(calculateTotals(invoice.lines).totalCents)}
                  </td>
                  <td data-label="Status">
                    <StatusBadge tone={invoiceStatusTone[invoice.status]}>{invoiceStatusLabels[invoice.status]}</StatusBadge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
