"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import CtaLink from "@/components/cta-link";
import { FilterBar, FilterSelect, SearchField } from "@/components/admin/filter-bar";
import StatusBadge from "@/components/admin/status-badge";
import type { Customer } from "@/lib/admin/customers/types";
import { formatDate } from "@/lib/admin/format";
import {
  getDeadlineState,
  isOpenProject,
  projectStatusLabels,
  projectStatusOrder,
  projectStatusTone,
  type Project,
} from "@/lib/admin/projects/types";

const day = (key: string) => formatDate(`${key}T12:00:00+02:00`);

export default function ProjectsList({
  projects,
  customers,
  todayKey,
}: {
  projects: Project[];
  customers: Customer[];
  todayKey: string;
}) {
  const [status, setStatus] = useState("open");
  const [query, setQuery] = useState("");

  const companyName = useMemo(() => {
    const byId = new Map(customers.map((customer) => [customer.id, customer.companyName]));
    return (id: string) => byId.get(id) ?? "Onbekende klant";
  }, [customers]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects
      .filter((project) =>
        status === "open" ? isOpenProject(project) : status === "all" ? true : project.status === status,
      )
      .filter(
        (project) => !needle || [project.name, companyName(project.customerId), project.notes].join(" ").toLowerCase().includes(needle),
      )
      .sort((a, b) => {
        // Work in hand first, then the nearest deadline, then the newest edit.
        if (isOpenProject(a) !== isOpenProject(b)) return isOpenProject(a) ? -1 : 1;
        if (a.deadline && b.deadline && a.deadline !== b.deadline) return a.deadline.localeCompare(b.deadline);
        if (Boolean(a.deadline) !== Boolean(b.deadline)) return a.deadline ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [projects, status, query, companyName]);

  const overdue = projects.filter((project) => getDeadlineState(project, todayKey) === "overdue").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <FilterBar label="Projecten filteren">
          <FilterSelect id="project-status" label="Status" value={status} onChange={setStatus}>
            <option value="open">Alle lopende</option>
            <option value="all">Alle statussen</option>
            {projectStatusOrder.map((value) => (
              <option key={value} value={value}>
                {projectStatusLabels[value]}
              </option>
            ))}
          </FilterSelect>
          <SearchField id="project-search" label="Zoeken" value={query} onChange={setQuery} placeholder="Project, klant of notitie" />
        </FilterBar>
        <CtaLink href="/admin/projecten/nieuw" className="max-sm:w-full">
          Nieuw project
        </CtaLink>
      </div>

      <p className="text-[0.85rem] text-muted" aria-live="polite">
        {rows.length} van {projects.length} projecten
        {overdue > 0 ? ` · ${overdue} met een verstreken deadline` : ""}
      </p>

      {rows.length === 0 ? (
        <p className="border-y border-line py-8 text-center text-[0.95rem] text-muted">Geen projecten die aan deze filters voldoen.</p>
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th scope="col">Project</th>
              <th scope="col">Klant</th>
              <th scope="col">Start</th>
              <th scope="col">Deadline</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((project) => {
              const deadline = getDeadlineState(project, todayKey);
              return (
                <tr key={project.id}>
                  <td className="adm-primary" data-label="Project">
                    <Link href={`/admin/projecten/${project.id}`} className="adm-title link-static adm-wrap">
                      {project.name}
                    </Link>
                  </td>
                  <td data-label="Klant" className="adm-wrap">
                    <Link href={`/admin/klanten/${project.customerId}`} className="link-static">
                      {companyName(project.customerId)}
                    </Link>
                  </td>
                  <td data-label="Start">{project.startDate ? day(project.startDate) : <span className="text-muted">—</span>}</td>
                  <td data-label="Deadline">
                    {project.deadline ? (
                      <span className="flex flex-wrap items-center gap-2">
                        {day(project.deadline)}
                        {deadline === "overdue" ? <StatusBadge tone="danger">Verstreken</StatusBadge> : null}
                        {deadline === "today" ? <StatusBadge tone="accent">Vandaag</StatusBadge> : null}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td data-label="Status">
                    <StatusBadge tone={projectStatusTone[project.status]}>{projectStatusLabels[project.status]}</StatusBadge>
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
