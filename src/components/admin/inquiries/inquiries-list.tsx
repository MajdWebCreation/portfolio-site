"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FilterBar, FilterSelect, SearchField, SegmentedField } from "@/components/admin/filter-bar";
import StatusBadge from "@/components/admin/status-badge";
import { formatDateTime } from "@/lib/admin/format";
import {
  inquiryOriginLabels,
  inquiryStatusLabels,
  inquiryStatusOrder,
  inquiryStatusTone,
  isInquiryStatus,
  summarizeInquiry,
  type Inquiry,
  type InquiryOrigin,
} from "@/lib/admin/inquiries/types";

type OriginFilter = "all" | InquiryOrigin;

const originOptions: readonly { value: OriginFilter; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "contact", label: inquiryOriginLabels.contact },
  { value: "project_planner", label: inquiryOriginLabels.project_planner },
];

export default function InquiriesList({ inquiries }: { inquiries: Inquiry[] }) {
  const [origin, setOrigin] = useState<OriginFilter>("all");
  const [status, setStatus] = useState<string>("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return inquiries
      .filter((inquiry) => origin === "all" || inquiry.origin === origin)
      .filter((inquiry) => status === "all" || inquiry.status === status)
      .filter(
        (inquiry) =>
          !needle ||
          [inquiry.name, inquiry.company ?? "", inquiry.email, inquiry.message]
            .join(" ")
            .toLowerCase()
            .includes(needle),
      );
  }, [inquiries, origin, status, query]);

  return (
    <div className="space-y-5">
      <FilterBar label="Aanvragen filteren">
        <SegmentedField name="origin" label="Herkomst" value={origin} options={originOptions} onChange={setOrigin} />
        <FilterSelect id="inquiry-status" label="Status" value={status} onChange={setStatus}>
          <option value="all">Alle statussen</option>
          {inquiryStatusOrder.map((value) => (
            <option key={value} value={value}>
              {inquiryStatusLabels[value]}
            </option>
          ))}
        </FilterSelect>
        <SearchField id="inquiry-search" label="Zoeken" value={query} onChange={setQuery} placeholder="Naam, bedrijf, e-mail of tekst" />
      </FilterBar>

      <p className="text-[0.85rem] text-muted" aria-live="polite">
        {rows.length === inquiries.length
          ? `${inquiries.length} aanvragen`
          : `${rows.length} van ${inquiries.length} aanvragen`}
      </p>

      {rows.length === 0 ? (
        <p className="border-y border-line py-8 text-center text-[0.95rem] text-muted">
          Geen aanvragen die aan deze filters voldoen.
        </p>
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th scope="col">Aanvrager</th>
              <th scope="col">Herkomst</th>
              <th scope="col">E-mail</th>
              <th scope="col">Ontvangen</th>
              <th scope="col">Status</th>
              <th scope="col" className="adm-xl">
                Samenvatting
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((inquiry) => (
              <tr key={inquiry.id}>
                <td className="adm-primary" data-label="Aanvrager">
                  <Link href={`/admin/aanvragen/${inquiry.id}`} className="adm-title link-static">
                    {inquiry.name}
                  </Link>
                  {inquiry.company ? <span className="block text-[0.85rem] text-muted">{inquiry.company}</span> : null}
                </td>
                <td data-label="Herkomst">
                  <StatusBadge tone={inquiry.origin === "project_planner" ? "accent" : "neutral"}>
                    {inquiryOriginLabels[inquiry.origin]}
                  </StatusBadge>
                </td>
                <td data-label="E-mail" className="adm-wrap">
                  {inquiry.email}
                </td>
                <td data-label="Ontvangen">
                  <time dateTime={inquiry.receivedAt}>{formatDateTime(inquiry.receivedAt)}</time>
                </td>
                <td data-label="Status">
                  <StatusBadge tone={inquiryStatusTone[isInquiryStatus(inquiry.status) ? inquiry.status : "new"]}>
                    {inquiryStatusLabels[inquiry.status]}
                  </StatusBadge>
                </td>
                <td data-label="Samenvatting" className="adm-xl max-w-[26rem] text-muted">
                  {summarizeInquiry(inquiry)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
