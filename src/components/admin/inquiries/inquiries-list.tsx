"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FilterBar, FilterSelect, SearchField, SegmentedField, FilterSummary, NoMatches } from "@/components/admin/filter-bar";
import StatusBadge from "@/components/admin/status-badge";
import { formatDateTime } from "@/lib/admin/format";
import { trafficClasses, trafficClassLabels } from "@/lib/attribution/types";
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
  { value: "websitecheck", label: inquiryOriginLabels.websitecheck },
];

export default function InquiriesList({ inquiries }: { inquiries: Inquiry[] }) {
  const [origin, setOrigin] = useState<OriginFilter>("all");
  const [status, setStatus] = useState<string>("all");
  const [trafficClass, setTrafficClass] = useState<string>("all");
  const [trafficSource, setTrafficSource] = useState<string>("all");
  const [query, setQuery] = useState("");

  /* The sources that actually occur, so the filter offers nothing that matches nothing. */
  const sources = useMemo(
    () => [...new Set(inquiries.map((inquiry) => inquiry.attribution?.trafficSource).filter((value): value is string => Boolean(value)))].sort(),
    [inquiries],
  );

  const filtered = origin !== "all" || status !== "all" || trafficClass !== "all" || trafficSource !== "all" || query.trim() !== "";
  function reset() {
    setOrigin("all");
    setStatus("all");
    setTrafficClass("all");
    setTrafficSource("all");
    setQuery("");
  }

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return inquiries
      .filter((inquiry) => origin === "all" || inquiry.origin === origin)
      .filter((inquiry) => status === "all" || inquiry.status === status)
      .filter((inquiry) =>
        trafficClass === "all" ? true : trafficClass === "none" ? !inquiry.attribution : inquiry.attribution?.trafficClass === trafficClass,
      )
      .filter((inquiry) => trafficSource === "all" || inquiry.attribution?.trafficSource === trafficSource)
      .filter(
        (inquiry) =>
          !needle ||
          [inquiry.name, inquiry.company ?? "", inquiry.email, inquiry.message, inquiry.origin === "websitecheck" ? inquiry.websiteUrl : ""]
            .join(" ")
            .toLowerCase()
            .includes(needle),
      );
  }, [inquiries, origin, status, trafficClass, trafficSource, query]);

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
        <FilterSelect id="inquiry-traffic-class" label="Bezoek via" value={trafficClass} onChange={setTrafficClass}>
          <option value="all">Alle kanalen</option>
          {trafficClasses.map((value) => (
            <option key={value} value={value}>
              {trafficClassLabels[value]}
            </option>
          ))}
          <option value="none">Niet vastgelegd</option>
        </FilterSelect>
        {sources.length > 0 ? (
          <FilterSelect id="inquiry-traffic-source" label="Bron" value={trafficSource} onChange={setTrafficSource}>
            <option value="all">Alle bronnen</option>
            {sources.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </FilterSelect>
        ) : null}
        <SearchField id="inquiry-search" label="Zoeken" value={query} onChange={setQuery} placeholder="Naam, bedrijf, e-mail of tekst" />
      </FilterBar>

      <FilterSummary filtered={filtered} onReset={reset}>
        {rows.length === inquiries.length
          ? `${inquiries.length} aanvragen`
          : `${rows.length} van ${inquiries.length} aanvragen`}
      </FilterSummary>

      {rows.length === 0 ? (
        <NoMatches>
          Geen aanvragen die aan deze filters voldoen.
        </NoMatches>
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th scope="col">Aanvrager</th>
              <th scope="col">Herkomst</th>
              <th scope="col">E-mail</th>
              <th scope="col">Ontvangen</th>
              <th scope="col">Bezoek via</th>
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
                  <StatusBadge tone={inquiry.origin === "contact" ? "neutral" : "accent"}>
                    {inquiryOriginLabels[inquiry.origin]}
                  </StatusBadge>
                </td>
                <td data-label="E-mail" className="adm-wrap">
                  {inquiry.email}
                </td>
                <td data-label="Ontvangen">
                  <time dateTime={inquiry.receivedAt}>{formatDateTime(inquiry.receivedAt)}</time>
                </td>
                <td data-label="Bezoek via" className="adm-wrap">
                  {inquiry.attribution ? (
                    <>
                      <span className="block">{trafficClassLabels[inquiry.attribution.trafficClass]}</span>
                      {inquiry.attribution.trafficSource ? (
                        <span className="block text-[0.85rem] text-muted">{inquiry.attribution.trafficSource}</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
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
