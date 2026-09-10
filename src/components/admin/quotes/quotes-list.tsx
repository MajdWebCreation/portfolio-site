"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import CtaLink from "@/components/cta-link";
import { FilterBar, FilterSelect, SearchField } from "@/components/admin/filter-bar";
import StatusBadge from "@/components/admin/status-badge";
import { formatDate } from "@/lib/admin/format";
import { quoteStatusLabels, quoteStatusOrder, quoteStatusTone, type Quote } from "@/lib/admin/quotes/types";
import { calculateTotals, formatCents } from "@/lib/money";

const day = (key: string) => formatDate(`${key}T12:00:00+02:00`);

export default function QuotesList({ quotes }: { quotes: Quote[] }) {
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return quotes
      .filter((quote) => status === "all" || quote.status === status)
      .filter((quote) => !needle || [quote.number.value, quote.customer.companyName, quote.subject].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.updatedAt.localeCompare(a.updatedAt));
  }, [quotes, status, query]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <FilterBar label="Offertes filteren">
          <FilterSelect id="quote-status" label="Status" value={status} onChange={setStatus}>
            <option value="all">Alle</option>
            {quoteStatusOrder.map((value) => (
              <option key={value} value={value}>
                {quoteStatusLabels[value]}
              </option>
            ))}
          </FilterSelect>
          <SearchField id="quote-search" label="Zoeken" value={query} onChange={setQuery} placeholder="Nummer, klant of onderwerp" />
        </FilterBar>
        <CtaLink href="/admin/offertes/nieuw" className="max-sm:w-full">
          Nieuwe offerte
        </CtaLink>
      </div>
      <p className="text-[0.85rem] text-muted" aria-live="polite">
        {rows.length} van {quotes.length} offertes
      </p>
      {rows.length === 0 ? (
        <p className="border-y border-line py-8 text-center text-[0.95rem] text-muted">Geen offertes die aan deze filters voldoen.</p>
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th scope="col">Offerte</th>
              <th scope="col">Klant</th>
              <th scope="col">Datum</th>
              <th scope="col">Geldig tot</th>
              <th scope="col" className="adm-num">
                Totaal incl.
              </th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((quote) => (
              <tr key={quote.id}>
                <td className="adm-primary" data-label="Offerte">
                  <Link href={`/admin/offertes/${quote.id}`} className="adm-title link-static">
                    {quote.number.value}
                  </Link>
                  <span className="adm-wrap block text-[0.85rem] text-muted">{quote.subject || "Zonder onderwerp"}</span>
                </td>
                <td data-label="Klant" className="adm-wrap">
                  {quote.customer.companyName}
                </td>
                <td data-label="Datum">{day(quote.issueDate)}</td>
                <td data-label="Geldig tot">{day(quote.validUntil)}</td>
                <td data-label="Totaal" className="adm-num">
                  {formatCents(calculateTotals(quote.lines).totalCents)}
                </td>
                <td data-label="Status">
                  <StatusBadge tone={quoteStatusTone[quote.status]}>{quoteStatusLabels[quote.status]}</StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
