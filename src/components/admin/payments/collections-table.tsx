"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FilterBar, FilterSelect, FilterSummary, NoMatches, SearchField } from "@/components/admin/filter-bar";
import StatusBadge from "@/components/admin/status-badge";
import type { Customer } from "@/lib/admin/customers/types";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import { formatCents } from "@/lib/money";
import type { CollectionRow } from "@/lib/payments/finance-overview";
import { recurringLifecycleLabel, recurringLifecycleTone } from "@/lib/payments/types";

const day = (key: string) => formatDate(`${key}T12:00:00+02:00`);

type Bucket = "all" | "active" | "ending" | "problem" | "ended";

const bucketOptions: { value: Bucket; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "active", label: "Actief" },
  { value: "ending", label: "Opzegging gepland" },
  { value: "problem", label: "Probleem" },
  { value: "ended", label: "Beëindigd" },
];

/** Every monthly service: what it collects, when, and whether anything is wrong with it. */
export default function CollectionsTable({
  rows,
  customers,
  customerId,
  todayKey,
}: {
  rows: CollectionRow[];
  customers: Customer[];
  customerId?: string;
  todayKey: string;
}) {
  const [bucket, setBucket] = useState<Bucket>("all");
  const [customer, setCustomer] = useState(customerId ?? "all");
  const [query, setQuery] = useState("");

  const filtered = bucket !== "all" || customer !== "all" || query.trim() !== "";
  function reset() {
    setBucket("all");
    setCustomer("all");
    setQuery("");
  }

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((row) => customer === "all" || row.service.customerId === customer)
      .filter((row) => bucket === "all" || row.bucket === bucket)
      .filter((row) => !needle || [row.service.name, row.customerName].join(" ").toLowerCase().includes(needle));
  }, [rows, bucket, customer, query]);

  return (
    <div className="space-y-5">
      <FilterBar label="Incasso's filteren">
        <FilterSelect id="fin-collection-bucket" label="Status" value={bucket} onChange={(value) => setBucket(value as Bucket)}>
          {bucketOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect id="fin-collection-customer" label="Klant" value={customer} onChange={setCustomer}>
          <option value="all">Alle klanten</option>
          {customers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.companyName}
            </option>
          ))}
        </FilterSelect>
        <SearchField id="fin-collection-search" label="Zoeken" value={query} onChange={setQuery} placeholder="Dienst of klant" />
      </FilterBar>
      <FilterSummary filtered={filtered} onReset={reset}>
        {shown.length} van {rows.length} diensten
      </FilterSummary>
      {shown.length === 0 ? (
        <NoMatches>{rows.length === 0 ? "Nog geen terugkerende diensten. Je maakt ze aan bij een klant." : "Geen diensten die aan deze filters voldoen."}</NoMatches>
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th scope="col">Klant</th>
              <th scope="col">Dienst</th>
              <th scope="col" className="adm-num">Maandbedrag</th>
              <th scope="col">Volgende incasso</th>
              <th scope="col">Abonnement</th>
              <th scope="col" className="adm-xl">Laatste betaling</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.service.id}>
                <td className="adm-primary" data-label="Klant">
                  <Link href={`/admin/betalingen/incassos/${row.service.id}`} className="adm-title link-static adm-wrap">
                    {row.customerName}
                  </Link>
                </td>
                <td data-label="Dienst" className="adm-wrap">{row.service.name}</td>
                <td data-label="Maandbedrag" className="adm-num">
                  {formatCents(row.monthlyGrossCents)}
                  <span className="block text-[0.78rem] text-muted">{formatCents(row.monthlyNetCents)} excl.</span>
                </td>
                <td data-label="Volgende incasso">
                  {row.overview.debitOn ? (
                    <>
                      {day(row.overview.debitOn)}
                      <span className="block text-[0.78rem] text-muted">{formatCents(row.overview.amountCents ?? 0)}</span>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td data-label="Abonnement">
                  {row.service.mollie.subscriptionId ? (
                    row.service.mollie.subscriptionCanceledAt ? "Geannuleerd bij Mollie" : "Loopt bij Mollie"
                  ) : (
                    <span className="text-muted">Niet gestart</span>
                  )}
                </td>
                <td data-label="Laatste betaling" className="adm-xl">
                  {row.lastPayment ? `${formatCents(row.lastPayment.amountCents)} · ${formatDateTime(row.lastPayment.paidAt ?? row.lastPayment.updatedAt)}` : <span className="text-muted">—</span>}
                </td>
                <td data-label="Status">
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <StatusBadge tone={recurringLifecycleTone(row.service, todayKey)}>{recurringLifecycleLabel(row.service, todayKey, day)}</StatusBadge>
                    {row.problem ? <StatusBadge tone="danger">Aandacht</StatusBadge> : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
