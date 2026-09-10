"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import AdminButton from "@/components/admin/admin-button";
import { SelectField, TextField, TextareaField } from "@/components/admin/form-field";
import StatusBadge from "@/components/admin/status-badge";
import { isDateKey } from "@/lib/admin/format";
import { createLead } from "@/lib/admin/leads/actions";
import {
  isLeadSource,
  isLeadStatus,
  leadSourceLabels,
  leadSourceOrder,
  leadStatusLabels,
  leadStatusOrder,
} from "@/lib/admin/leads/types";

type FormValues = {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  source: string;
  status: string;
  lastContactAt: string;
  nextFollowUpAt: string;
  notes: string;
};

type FormErrors = Partial<Record<keyof FormValues, string>>;

const empty: FormValues = {
  companyName: "",
  contactName: "",
  email: "",
  phone: "",
  website: "",
  source: "",
  status: "new",
  lastContactAt: "",
  nextFollowUpAt: "",
  notes: "",
};

export function validateLead(values: FormValues, todayKey: string): FormErrors {
  const errors: FormErrors = {};
  if (values.companyName.trim().length < 2) errors.companyName = "Vul de bedrijfsnaam in.";
  if (values.contactName.trim().length < 2) errors.contactName = "Vul de contactpersoon in.";
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = "Dit is geen geldig e-mailadres.";
  if (values.website && !/^https?:\/\/\S+\.\S+$/.test(values.website.trim())) errors.website = "Gebruik een volledig adres, inclusief https://.";
  if (!isLeadSource(values.source)) errors.source = "Kies hoe deze lead is ontstaan.";
  if (!isLeadStatus(values.status)) errors.status = "Kies een status.";
  if (values.lastContactAt && !isDateKey(values.lastContactAt)) errors.lastContactAt = "Dit is geen geldige datum.";
  else if (values.lastContactAt && values.lastContactAt > todayKey) errors.lastContactAt = "Het laatste contact kan niet in de toekomst liggen.";
  if (values.nextFollowUpAt && !isDateKey(values.nextFollowUpAt)) errors.nextFollowUpAt = "Dit is geen geldige datum.";
  else if (values.nextFollowUpAt && values.lastContactAt && values.nextFollowUpAt < values.lastContactAt)
    errors.nextFollowUpAt = "De opvolgdatum ligt vóór het laatste contact.";
  return errors;
}

export default function LeadForm({ todayKey }: { todayKey: string }) {
  const formId = useId();
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(empty);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; companyName: string; contactName: string; status: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (field: keyof FormValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => (previous[field] ? { ...previous, [field]: undefined } : previous));
  };

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateLead(values, todayKey);
    setErrors(nextErrors);
    const firstError = Object.keys(nextErrors)[0];
    if (firstError) {
      document.getElementById(firstError)?.focus();
      return;
    }

    const optional = (value: string) => (value.trim() ? value.trim() : undefined);
    setSaveError(null);
    startTransition(async () => {
      const result = await createLead({
        companyName: values.companyName,
        contactName: values.contactName,
        email: optional(values.email),
        phone: optional(values.phone),
        website: optional(values.website),
        source: values.source,
        status: values.status,
        notes: values.notes.trim(),
        lastContactAt: optional(values.lastContactAt),
        nextFollowUpAt: optional(values.nextFollowUpAt),
      });

      if (!result.ok) {
        setSaveError(result.error);
        return;
      }

      setCreated({
        id: result.value,
        companyName: values.companyName.trim(),
        contactName: values.contactName.trim(),
        status: values.status,
      });
      setValues(empty);
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
          <legend className="label-mono mb-4 text-ink">Bedrijf</legend>
          <TextField id="companyName" label="Bedrijfsnaam" value={values.companyName} onChange={set("companyName")} error={errors.companyName} autoComplete="organization" autoFocus />
          <TextField id="website" label="Website" optional type="url" inputMode="url" placeholder="https://" value={values.website} onChange={set("website")} error={errors.website} autoComplete="url" />
        </fieldset>

        <fieldset className="space-y-5">
          <legend className="label-mono mb-4 text-ink">Contactpersoon</legend>
          <TextField id="contactName" label="Naam" value={values.contactName} onChange={set("contactName")} error={errors.contactName} autoComplete="name" />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField id="email" label="E-mail" optional type="email" inputMode="email" value={values.email} onChange={set("email")} error={errors.email} autoComplete="email" />
            <TextField id="phone" label="Telefoon" optional type="tel" inputMode="tel" value={values.phone} onChange={set("phone")} autoComplete="tel" />
          </div>
        </fieldset>

        <fieldset className="space-y-5">
          <legend className="label-mono mb-4 text-ink">Opvolging</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField id="source" label="Bron" value={values.source} onChange={set("source")} error={errors.source}>
              <option value="">Kies een bron</option>
              {leadSourceOrder.map((value) => (
                <option key={value} value={value}>
                  {leadSourceLabels[value]}
                </option>
              ))}
            </SelectField>
            <SelectField id="status" label="Status" value={values.status} onChange={set("status")} error={errors.status}>
              {leadStatusOrder.map((value) => (
                <option key={value} value={value}>
                  {leadStatusLabels[value]}
                </option>
              ))}
            </SelectField>
            <TextField id="lastContactAt" label="Laatste contact" optional type="date" min="2000-01-01" max={todayKey} value={values.lastContactAt} onChange={set("lastContactAt")} error={errors.lastContactAt} />
            <TextField id="nextFollowUpAt" label="Volgende opvolging" optional type="date" min="2000-01-01" max="2100-12-31" value={values.nextFollowUpAt} onChange={set("nextFollowUpAt")} error={errors.nextFollowUpAt} />
          </div>
          <TextareaField id="notes" label="Interne notities" optional value={values.notes} onChange={set("notes")} placeholder="Context, afspraken, wat is besproken" />
        </fieldset>

        <div className="flex flex-wrap items-center gap-4 border-t border-line pt-6">
          <AdminButton type="submit" disabled={pending}>
            {pending ? "Opslaan…" : "Lead toevoegen"}
          </AdminButton>
          <Link href="/admin/leads" className="link-static text-[0.92rem] text-ink">
            Annuleren
          </Link>
        </div>
      </form>

      <aside className="space-y-4 lg:border-l lg:border-line lg:pl-8" id={`${formId}-note`} aria-live="polite">
        {created ? (
          <>
            <h2 className="label-mono text-ink">Opgeslagen</h2>
            <p className="text-[0.95rem] font-medium text-ink">{created.companyName}</p>
            <p className="text-[0.88rem] text-muted">{created.contactName}</p>
            {isLeadStatus(created.status) ? <StatusBadge tone="accent">{leadStatusLabels[created.status]}</StatusBadge> : null}
            <p className="text-[0.88rem] leading-snug text-muted">
              De lead staat in de database en blijft bestaan na verversen.
            </p>
            <Link href={`/admin/leads/${created.id}`} className="link-static block text-[0.92rem] text-ink">
              Lead bekijken
            </Link>
            <Link href="/admin/leads" className="link-static block text-[0.92rem] text-ink">
              Naar de leadlijst
            </Link>
          </>
        ) : (
          <>
            <h2 className="label-mono text-ink">Over leads</h2>
            <p className="text-[0.88rem] leading-snug text-muted">
              Leads zijn prospects die je zelf benadert of toevoegt. Aanvragen via de website staan apart, onder Aanvragen.
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
