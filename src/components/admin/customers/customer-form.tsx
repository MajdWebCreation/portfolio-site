"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import AdminButton from "@/components/admin/admin-button";
import { SelectField, TextField, TextareaField } from "@/components/admin/form-field";
import { createCustomer } from "@/lib/admin/customers/actions";
import { customerStatusLabels } from "@/lib/admin/customers/types";

/**
 * Adding a customer by hand, for the ones that never passed through the
 * contact form or the planner. The fields are the same as on the customer
 * page, and required for the same reason: a quote or an invoice snapshots
 * name, address and e-mail, so an incomplete customer cannot be billed.
 */
export type ExistingCustomer = { id: string; companyName: string; email: string };

type FormValues = {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  kvkNumber: string;
  vatNumber: string;
  status: string;
  notes: string;
};

type FormErrors = Partial<Record<keyof FormValues, string>>;

const empty: FormValues = {
  companyName: "",
  contactName: "",
  email: "",
  phone: "",
  street: "",
  postalCode: "",
  city: "",
  country: "Nederland",
  kvkNumber: "",
  vatNumber: "",
  status: "active",
  notes: "",
};

export function validateCustomerForm(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  if (values.companyName.trim().length < 2) errors.companyName = "Vul de bedrijfsnaam in.";
  if (values.contactName.trim().length < 2) errors.contactName = "Vul de contactpersoon in.";
  if (!values.email.trim()) errors.email = "Vul een e-mailadres in; offertes en facturen gaan er naartoe.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = "Dit is geen geldig e-mailadres.";
  if (!values.street.trim()) errors.street = "Vul straat en huisnummer in.";
  if (!values.postalCode.trim()) errors.postalCode = "Vul de postcode in.";
  if (!values.city.trim()) errors.city = "Vul de plaats in.";
  if (!values.country.trim()) errors.country = "Vul het land in.";
  if (values.status !== "active" && values.status !== "inactive") errors.status = "Kies een status.";
  return errors;
}

export default function CustomerForm({ existing }: { existing: ExistingCustomer[] }) {
  const formId = useId();
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(empty);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; companyName: string } | null>(null);
  const [pending, startTransition] = useTransition();

  /*
    Nothing stops two customers sharing an e-mail address -- a holding and its
    subsidiary legitimately can -- so this warns instead of blocking, and
    names the customer that already exists so the choice is an informed one.
  */
  const duplicate = useMemo(() => {
    const needle = values.email.trim().toLowerCase();
    return needle ? existing.find((customer) => customer.email.toLowerCase() === needle) : undefined;
  }, [existing, values.email]);

  const set = (field: keyof FormValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => (previous[field] ? { ...previous, [field]: undefined } : previous));
  };

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateCustomerForm(values);
    setErrors(nextErrors);
    const firstError = Object.keys(nextErrors)[0];
    if (firstError) {
      document.getElementById(firstError)?.focus();
      return;
    }

    const optional = (value: string) => (value.trim() ? value.trim() : undefined);
    setSaveError(null);
    startTransition(async () => {
      const result = await createCustomer({
        companyName: values.companyName,
        contactName: values.contactName,
        email: values.email,
        phone: optional(values.phone),
        street: values.street,
        postalCode: values.postalCode,
        city: values.city,
        country: values.country,
        kvkNumber: optional(values.kvkNumber),
        vatNumber: optional(values.vatNumber),
        notes: values.notes.trim(),
        status: values.status,
      });

      if (!result.ok) {
        setSaveError(result.error);
        return;
      }

      setCreated({ id: result.value, companyName: values.companyName.trim() });
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
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField id="kvkNumber" label="KvK-nummer" optional value={values.kvkNumber} onChange={set("kvkNumber")} autoComplete="off" />
            <TextField id="vatNumber" label="Btw-nummer" optional value={values.vatNumber} onChange={set("vatNumber")} autoComplete="off" />
          </div>
        </fieldset>

        <fieldset className="space-y-5">
          <legend className="label-mono mb-4 text-ink">Contactpersoon</legend>
          <TextField id="contactName" label="Naam" value={values.contactName} onChange={set("contactName")} error={errors.contactName} autoComplete="name" />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField id="email" label="E-mail" type="email" inputMode="email" value={values.email} onChange={set("email")} error={errors.email} autoComplete="email" />
            <TextField id="phone" label="Telefoon" optional type="tel" inputMode="tel" value={values.phone} onChange={set("phone")} autoComplete="tel" />
          </div>
        </fieldset>

        <fieldset className="space-y-5">
          <legend className="label-mono mb-4 text-ink">Adres</legend>
          <TextField id="street" label="Straat en huisnummer" value={values.street} onChange={set("street")} error={errors.street} autoComplete="street-address" hint="Offertes en facturen nemen dit adres over." />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField id="postalCode" label="Postcode" value={values.postalCode} onChange={set("postalCode")} error={errors.postalCode} autoComplete="postal-code" />
            <TextField id="city" label="Plaats" value={values.city} onChange={set("city")} error={errors.city} autoComplete="address-level2" />
            <TextField id="country" label="Land" value={values.country} onChange={set("country")} error={errors.country} autoComplete="country-name" />
            <SelectField id="status" label="Status" value={values.status} onChange={set("status")} error={errors.status}>
              {(["active", "inactive"] as const).map((value) => (
                <option key={value} value={value}>
                  {customerStatusLabels[value]}
                </option>
              ))}
            </SelectField>
          </div>
        </fieldset>

        <fieldset className="space-y-5">
          <legend className="label-mono mb-4 text-ink">Notities</legend>
          <TextareaField id="notes" label="Interne notities" optional value={values.notes} onChange={set("notes")} placeholder="Afspraken, context, wie de klant heeft aangebracht" />
        </fieldset>

        <div className="flex flex-wrap items-center gap-4 border-t border-line pt-6">
          <AdminButton type="submit" disabled={pending}>
            {pending ? "Opslaan…" : "Klant toevoegen"}
          </AdminButton>
          <Link href="/admin/klanten" className="link-static text-[0.92rem] text-ink">
            Annuleren
          </Link>
        </div>
      </form>

      <aside className="space-y-4 lg:border-l lg:border-line lg:pl-8" id={`${formId}-note`} aria-live="polite">
        {created ? (
          <>
            <h2 className="label-mono text-ink">Opgeslagen</h2>
            <p className="text-[0.95rem] font-medium text-ink">{created.companyName}</p>
            <p className="text-[0.88rem] leading-snug text-muted">
              De klant staat in de database en is meteen te kiezen bij een offerte of factuur.
            </p>
            <Link href={`/admin/klanten/${created.id}`} className="link-static block text-[0.92rem] text-ink">
              Klant bekijken
            </Link>
            <Link href="/admin/klanten" className="link-static block text-[0.92rem] text-ink">
              Naar de klantenlijst
            </Link>
          </>
        ) : (
          <>
            <h2 className="label-mono text-ink">Over klanten</h2>
            <p className="text-[0.88rem] leading-snug text-muted">
              Voor opdrachtgevers die niet via het contactformulier of de projectplanner binnenkomen. Kwam de klant wél
              via de website of via een lead, gebruik dan de knop op die aanvraag of lead: de koppeling blijft dan bewaard.
            </p>
            {duplicate ? (
              <p className="border-l-2 border-line-strong pl-3 text-[0.88rem] leading-snug text-muted">
                <span className="font-medium text-ink">{duplicate.companyName}</span> heeft al ditzelfde e-mailadres.{" "}
                <Link href={`/admin/klanten/${duplicate.id}`} className="link-static text-ink">
                  Die klant bekijken
                </Link>
              </p>
            ) : null}
          </>
        )}
      </aside>
    </div>
  );
}
