"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import CtaLink from "@/components/cta-link";
import { FilterBar, FilterSelect, SearchField } from "@/components/admin/filter-bar";
import StatusBadge from "@/components/admin/status-badge";
import { formatDate } from "@/lib/admin/format";
import {
  getFollowUpState,
  leadSourceLabels,
  leadSourceOrder,
  leadStatusLabels,
  leadStatusOrder,
  leadStatusTone,
  openLeadStatuses,
  type Lead,
} from "@/lib/admin/leads/types";

const followUpLabel = { overdue: "Te laat", today: "Vandaag", planned: "", none: "" } as const;

function FollowUp({ lead, todayKey }: { lead: Lead; todayKey: string }) {
  const state = getFollowUpState(lead, todayKey);
  if (state === "none") return <span className="text-muted">Niet gepland</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="whitespace-nowrap">{formatDate(`${lead.nextFollowUpAt}T12:00:00+02:00`)}</span>
      {state === "overdue" ? <StatusBadge tone="danger">{followUpLabel.overdue}</StatusBadge> : null}
      {state === "today" ? <StatusBadge tone="accent">{followUpLabel.today}</StatusBadge> : null}
    </span>
  );
}

export default function LeadsList({ leads, todayKey }: { leads: Lead[]; todayKey: string }) {
  const [status, setStatus] = useState("open");
  const [source, setSource] = useState("all");
  const [query, setQuery] = useState("");


  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return leads
      .filter((lead) =>
        status === "all" ? true : status === "open" ? openLeadStatuses.includes(lead.status) : lead.status === status,
      )
      .filter((lead) => source === "all" || lead.source === source)
      .filter(
        (lead) =>
          !needle ||
          [lead.companyName, lead.contactName, lead.email ?? "", lead.notes].join(" ").toLowerCase().includes(needle),
      )
      .sort((a, b) => {
        // Follow-ups first (overdue, today, then by date), leads without a date last.
        const da = a.nextFollowUpAt ?? "9999";
        const db = b.nextFollowUpAt ?? "9999";
        return da.localeCompare(db) || b.createdAt.localeCompare(a.createdAt);
      });
  }, [leads, status, source, query]);

  const due = leads.filter((lead) => ["overdue", "today"].includes(getFollowUpState(lead, todayKey))).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <FilterBar label="Leads filteren">
          <FilterSelect id="lead-status" label="Status" value={status} onChange={setStatus}>
            <option value="open">Alle open</option>
            <option value="all">Alle statussen</option>
            {leadStatusOrder.map((value) => (
              <option key={value} value={value}>
                {leadStatusLabels[value]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect id="lead-source" label="Bron" value={source} onChange={setSource}>
            <option value="all">Alle bronnen</option>
            {leadSourceOrder.map((value) => (
              <option key={value} value={value}>
                {leadSourceLabels[value]}
              </option>
            ))}
          </FilterSelect>
          <SearchField id="lead-search" label="Zoeken" value={query} onChange={setQuery} placeholder="Bedrijf, contactpersoon of notitie" />
        </FilterBar>
        <CtaLink href="/admin/leads/nieuw" className="max-sm:w-full">
          Nieuwe lead
        </CtaLink>
      </div>

      <p className="text-[0.85rem] text-muted" aria-live="polite">
        {rows.length} van {leads.length} leads
        {due > 0 ? ` · ${due} met opvolging vandaag of eerder` : ""}
      </p>

      {rows.length === 0 ? (
        <p className="border-y border-line py-8 text-center text-[0.95rem] text-muted">Geen leads die aan deze filters voldoen.</p>
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th scope="col">Bedrijf</th>
              <th scope="col">Status</th>
              <th scope="col">Opvolgen</th>
              <th scope="col">Bron</th>
              <th scope="col">Laatste contact</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((lead) => (
              <tr key={lead.id}>
                <td className="adm-primary" data-label="Bedrijf">
                  <Link href={`/admin/leads/${lead.id}`} className="adm-title link-static adm-wrap">
                    {lead.companyName}
                  </Link>
                  <span className="block text-[0.85rem] text-muted">{lead.contactName}</span>
                </td>
                <td data-label="Status">
                  <StatusBadge tone={leadStatusTone[lead.status]}>{leadStatusLabels[lead.status]}</StatusBadge>
                </td>
                <td data-label="Opvolgen">
                  <FollowUp lead={lead} todayKey={todayKey} />
                </td>
                <td data-label="Bron">{leadSourceLabels[lead.source]}</td>
                <td data-label="Laatste contact" className="whitespace-nowrap">
                  {lead.lastContactAt ? formatDate(`${lead.lastContactAt}T12:00:00+02:00`) : <span className="text-muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
