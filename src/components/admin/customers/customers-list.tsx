"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FilterBar, FilterSelect, SearchField } from "@/components/admin/filter-bar";
import StatusBadge from "@/components/admin/status-badge";
import { customerStatusLabels, customerStatusTone, type Customer } from "@/lib/admin/customers/types";

export default function CustomersList({ customers }: { customers: Customer[] }) {
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return customers
      .filter((customer) => status === "all" || customer.status === status)
      .filter(
        (customer) =>
          !needle ||
          [customer.companyName, customer.contactName, customer.email, customer.address.city].join(" ").toLowerCase().includes(needle),
      )
      .sort((a, b) => a.companyName.localeCompare(b.companyName, "nl"));
  }, [customers, status, query]);

  return (
    <div className="space-y-5">
      <FilterBar label="Klanten filteren">
        <FilterSelect id="customer-status" label="Status" value={status} onChange={setStatus}>
          <option value="all">Alle</option>
          <option value="active">{customerStatusLabels.active}</option>
          <option value="inactive">{customerStatusLabels.inactive}</option>
        </FilterSelect>
        <SearchField id="customer-search" label="Zoeken" value={query} onChange={setQuery} placeholder="Bedrijf, contactpersoon, plaats" />
      </FilterBar>

      <p className="text-[0.85rem] text-muted" aria-live="polite">
        {rows.length} van {customers.length} klanten
      </p>

      {rows.length === 0 ? (
        <p className="border-y border-line py-8 text-center text-[0.95rem] text-muted">Geen klanten die aan deze filters voldoen.</p>
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th scope="col">Bedrijf</th>
              <th scope="col">Contactpersoon</th>
              <th scope="col">E-mail</th>
              <th scope="col">Plaats</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((customer) => (
              <tr key={customer.id}>
                <td className="adm-primary" data-label="Bedrijf">
                  <Link href={`/admin/klanten/${customer.id}`} className="adm-title link-static adm-wrap">
                    {customer.companyName}
                  </Link>
                </td>
                <td data-label="Contact">{customer.contactName}</td>
                <td data-label="E-mail" className="adm-wrap">
                  {customer.email}
                </td>
                <td data-label="Plaats">
                  {customer.address.city}
                  {customer.address.country !== "Nederland" ? `, ${customer.address.country}` : ""}
                </td>
                <td data-label="Status">
                  <StatusBadge tone={customerStatusTone[customer.status]}>{customerStatusLabels[customer.status]}</StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
