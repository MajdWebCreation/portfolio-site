"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import AdminButton from "@/components/admin/admin-button";
import { SelectField, TextField, TextareaField } from "@/components/admin/form-field";
import type { Customer } from "@/lib/admin/customers/types";
import { createProject } from "@/lib/admin/projects/actions";
import { projectStatusLabels, projectStatusOrder } from "@/lib/admin/projects/types";
import { hasProjectErrors, validateProject, type ProjectErrors } from "@/lib/admin/projects/validation";

type FormValues = {
  customerId: string;
  name: string;
  status: string;
  startDate: string;
  deadline: string;
  notes: string;
};

function initial(customerId: string): FormValues {
  return { customerId, name: "", status: "planned", startDate: "", deadline: "", notes: "" };
}

export default function ProjectForm({
  customers,
  customerId = "",
}: {
  customers: Customer[];
  /** Preselected customer, when the form was opened from a customer page. */
  customerId?: string;
}) {
  const formId = useId();
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(initial(customerId));
  const [errors, setErrors] = useState<ProjectErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (field: keyof FormValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => (previous[field as keyof ProjectErrors] ? { ...previous, [field]: undefined } : previous));
  };

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateProject(values, { requireCustomer: true });
    setErrors(nextErrors);
    if (hasProjectErrors(nextErrors)) {
      document.getElementById(Object.keys(nextErrors)[0])?.focus();
      return;
    }

    const optional = (value: string) => (value.trim() ? value.trim() : undefined);
    setSaveError(null);
    startTransition(async () => {
      const result = await createProject({
        customerId: values.customerId,
        name: values.name,
        status: values.status,
        startDate: optional(values.startDate),
        deadline: optional(values.deadline),
        notes: values.notes.trim(),
      });

      if (!result.ok) {
        setSaveError(result.error);
        return;
      }

      setCreated({ id: result.value, name: values.name.trim() });
      setValues(initial(customerId));
      router.refresh();
    });
  }

  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-12">
      <form onSubmit={handleSubmit} noValidate className="max-w-[40rem] space-y-8" aria-describedby={`${formId}-note`}>
        {errorCount > 0 ? (
          <p role="alert" className="border-l-2 border-danger pl-3 text-[0.9rem] text-danger">
            {errorCount === 1 ? "Eén veld vraagt aandacht." : `${errorCount} velden vragen aandacht.`}
          </p>
        ) : null}
        {saveError ? (
          <p role="alert" className="border-l-2 border-danger pl-3 text-[0.9rem] text-danger">
            {saveError}
          </p>
        ) : null}

        <fieldset className="space-y-5">
          <legend className="label-mono mb-4 text-ink">Opdrachtgever</legend>
          <SelectField
            id="customerId"
            label="Klant"
            value={values.customerId}
            onChange={set("customerId")}
            error={errors.customerId}
            hint="De klant ligt na het aanmaken vast; een project verhuist niet."
          >
            <option value="">Kies een klant</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.companyName}
              </option>
            ))}
          </SelectField>
        </fieldset>

        <fieldset className="space-y-5">
          <legend className="label-mono mb-4 text-ink">Project</legend>
          <TextField id="name" label="Projectnaam" value={values.name} onChange={set("name")} error={errors.name} autoComplete="off" autoFocus={Boolean(customerId)} />
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField id="status" label="Status" value={values.status} onChange={set("status")} error={errors.status}>
              {projectStatusOrder.map((value) => (
                <option key={value} value={value}>
                  {projectStatusLabels[value]}
                </option>
              ))}
            </SelectField>
            <div className="hidden sm:block" aria-hidden="true" />
            <TextField id="startDate" label="Startdatum" optional type="date" min="2000-01-01" max="2100-12-31" value={values.startDate} onChange={set("startDate")} error={errors.startDate} />
            <TextField id="deadline" label="Deadline" optional type="date" min={values.startDate || "2000-01-01"} max="2100-12-31" value={values.deadline} onChange={set("deadline")} error={errors.deadline} />
          </div>
          <TextareaField id="notes" label="Interne omschrijving" optional value={values.notes} onChange={set("notes")} placeholder="Wat er gebouwd wordt, afspraken, aandachtspunten" />
        </fieldset>

        <div className="flex flex-wrap items-center gap-4 border-t border-line pt-6">
          <AdminButton type="submit" disabled={pending}>
            {pending ? "Opslaan…" : "Project toevoegen"}
          </AdminButton>
          <Link href="/admin/projecten" className="link-static text-[0.92rem] text-ink">
            Annuleren
          </Link>
        </div>
      </form>

      <aside className="space-y-4 lg:border-l lg:border-line lg:pl-8" id={`${formId}-note`} aria-live="polite">
        {created ? (
          <>
            <h2 className="label-mono text-ink">Opgeslagen</h2>
            <p className="text-[0.95rem] font-medium text-ink">{created.name}</p>
            <Link href={`/admin/projecten/${created.id}`} className="link-static block text-[0.92rem] text-ink">
              Project bekijken
            </Link>
            <Link href="/admin/projecten" className="link-static block text-[0.92rem] text-ink">
              Naar de projectenlijst
            </Link>
          </>
        ) : (
          <>
            <h2 className="label-mono text-ink">Over projecten</h2>
            <p className="text-[0.88rem] leading-snug text-muted">
              Een project hoort bij één klant en houdt bij wat er loopt: status, startdatum en deadline. Beide datums
              zijn los van elkaar optioneel. Offertes en facturen koppel je vanaf het document zelf; de bedragen blijven
              daar waar ze horen.
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
