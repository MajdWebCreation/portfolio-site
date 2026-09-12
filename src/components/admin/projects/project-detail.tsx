"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import AdminSection from "@/components/admin/admin-section";
import { DetailList, DetailRow } from "@/components/admin/detail-list";
import { SelectField, TextField, TextareaField } from "@/components/admin/form-field";
import ProjectDocuments from "@/components/admin/projects/project-documents";
import SaveControls, { useSave } from "@/components/admin/save-controls";
import StatusBadge from "@/components/admin/status-badge";
import type { Customer } from "@/lib/admin/customers/types";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import type { Invoice } from "@/lib/admin/invoices/types";
import { updateProject } from "@/lib/admin/projects/actions";
import {
  getDeadlineState,
  isProjectStatus,
  projectStatusLabels,
  projectStatusOrder,
  projectStatusTone,
  type Project,
} from "@/lib/admin/projects/types";
import { hasProjectErrors, validateProject, type ProjectErrors } from "@/lib/admin/projects/validation";
import type { Quote } from "@/lib/admin/quotes/types";

function dateOnly(value: string | undefined) {
  return value ? formatDate(`${value}T12:00:00+02:00`) : <span className="text-muted">—</span>;
}

function toForm(project: Project) {
  return {
    name: project.name,
    status: project.status as string,
    startDate: project.startDate ?? "",
    deadline: project.deadline ?? "",
    notes: project.notes,
  };
}

export default function ProjectDetail({
  project,
  customer,
  quotes,
  invoices,
  todayKey,
}: {
  project: Project;
  customer?: Customer;
  /** Quotes filed under this project. */
  quotes: Quote[];
  /** Invoices filed under this project. */
  invoices: Invoice[];
  todayKey: string;
}) {
  const stored = toForm(project);
  const [values, setValues] = useState(stored);
  const { save, pending, error, savedAt } = useSave();

  const dirty = (Object.keys(stored) as (keyof typeof stored)[]).some((key) => values[key] !== stored[key]);
  const errors: ProjectErrors = useMemo(() => validateProject(values, { requireCustomer: false }), [values]);
  // Nothing is offered for saving that the server would refuse anyway.
  const savable = dirty && !hasProjectErrors(errors);
  const deadline = getDeadlineState(
    { status: isProjectStatus(values.status) ? values.status : project.status, deadline: values.deadline || undefined },
    todayKey,
  );

  const set = (field: keyof typeof stored) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setValues((previous) => ({ ...previous, [field]: event.target.value }));

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
      <div className="space-y-10">
        <AdminSection id="project" title="Project">
          <DetailList>
            <DetailRow term="Klant">
              {customer ? (
                <Link href={`/admin/klanten/${customer.id}`} className="link-static">
                  {customer.companyName}
                </Link>
              ) : (
                <span className="text-muted">Onbekende klant</span>
              )}
            </DetailRow>
            <DetailRow term="Contactpersoon">{customer ? customer.contactName : <span className="text-muted">—</span>}</DetailRow>
            <DetailRow term="Startdatum">{dateOnly(project.startDate)}</DetailRow>
            <DetailRow term="Deadline">{dateOnly(project.deadline)}</DetailRow>
            <DetailRow term="Aangemaakt">{formatDateTime(project.createdAt)}</DetailRow>
            <DetailRow term="Laatst gewijzigd">{formatDateTime(project.updatedAt)}</DetailRow>
          </DetailList>
        </AdminSection>

        <AdminSection id="edit" title="Gegevens bewerken" note={dirty ? "Niet opgeslagen" : undefined}>
          <div className="grid max-w-[40rem] gap-5">
            <TextField id="project-name" label="Projectnaam" value={values.name} onChange={set("name")} error={errors.name} autoComplete="off" />

            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField id="project-status" label="Status" value={values.status} onChange={set("status")} error={errors.status}>
                {projectStatusOrder.map((value) => (
                  <option key={value} value={value}>
                    {projectStatusLabels[value]}
                  </option>
                ))}
              </SelectField>
              <TextField id="project-start" label="Startdatum" optional type="date" min="2000-01-01" max="2100-12-31" value={values.startDate} onChange={set("startDate")} error={errors.startDate} />
              <TextField id="project-deadline" label="Deadline" optional type="date" min={values.startDate || "2000-01-01"} max="2100-12-31" value={values.deadline} onChange={set("deadline")} error={errors.deadline} />
            </div>

            <TextareaField id="project-notes" label="Interne omschrijving" optional value={values.notes} onChange={set("notes")} placeholder="Wat er gebouwd wordt, afspraken, aandachtspunten" />

            <div className="flex flex-wrap items-end gap-4">
              <SaveControls
                className="w-full max-w-[16rem]"
                label="Opslaan"
                pending={pending}
                error={error}
                savedAt={savedAt}
                disabled={!savable}
                onSave={() =>
                  save(() =>
                    updateProject(project.id, {
                      name: values.name,
                      status: values.status,
                      startDate: values.startDate || undefined,
                      deadline: values.deadline || undefined,
                      notes: values.notes,
                    }),
                  )
                }
              />
              {dirty ? (
                <AdminButton variant="secondary" onClick={() => setValues(stored)}>
                  Wijzigingen ongedaan maken
                </AdminButton>
              ) : null}
            </div>
          </div>
        </AdminSection>
      </div>

      <aside className="space-y-8 lg:border-l lg:border-line lg:pl-8">
        <div>
          <h2 className="label-mono text-ink">Status</h2>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusBadge tone={projectStatusTone[project.status]}>{projectStatusLabels[project.status]}</StatusBadge>
            {deadline === "overdue" ? <StatusBadge tone="danger">Deadline verstreken</StatusBadge> : null}
            {deadline === "today" ? <StatusBadge tone="accent">Deadline vandaag</StatusBadge> : null}
            {dirty ? <StatusBadge tone="accent">Niet opgeslagen</StatusBadge> : null}
          </div>
          <p className="mt-4 text-[0.85rem] text-muted">
            Start {dateOnly(values.startDate || undefined)} · deadline {dateOnly(values.deadline || undefined)}
          </p>
        </div>

        <ProjectDocuments quotes={quotes} invoices={invoices} />
      </aside>
    </div>
  );
}
