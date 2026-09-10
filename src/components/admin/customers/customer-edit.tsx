"use client";

import { useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import AdminSection from "@/components/admin/admin-section";
import { SelectField, TextField, TextareaField } from "@/components/admin/form-field";
import SaveControls, { useSave } from "@/components/admin/save-controls";
import { updateCustomer } from "@/lib/admin/customers/actions";
import { customerStatusLabels, type Customer } from "@/lib/admin/customers/types";

/**
 * Editing a customer. The address is required: a quote or an invoice takes a
 * snapshot of it, and documents that were already made keep the snapshot they
 * were made with, so a change here never rewrites history.
 */
function toForm(customer: Customer) {
  return {
    companyName: customer.companyName,
    contactName: customer.contactName,
    email: customer.email,
    phone: customer.phone ?? "",
    street: customer.address.street,
    postalCode: customer.address.postalCode,
    city: customer.address.city,
    country: customer.address.country,
    kvkNumber: customer.kvkNumber ?? "",
    vatNumber: customer.vatNumber ?? "",
    notes: customer.notes,
    status: customer.status as string,
  };
}

export default function CustomerEdit({ customer }: { customer: Customer }) {
  const stored = toForm(customer);
  const [values, setValues] = useState(stored);
  const { save, pending, error, savedAt } = useSave();

  const dirty = (Object.keys(stored) as (keyof typeof stored)[]).some((key) => values[key] !== stored[key]);

  const set = (field: keyof typeof stored) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setValues((previous) => ({ ...previous, [field]: event.target.value }));

  return (
    <AdminSection id="edit" title="Gegevens bewerken" note={dirty ? "Niet opgeslagen" : undefined}>
      <div className="grid max-w-[40rem] gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField id="companyName" label="Bedrijfsnaam" value={values.companyName} onChange={set("companyName")} />
          <TextField id="contactName" label="Contactpersoon" value={values.contactName} onChange={set("contactName")} />
          <TextField id="email" label="E-mail" type="email" value={values.email} onChange={set("email")} />
          <TextField id="phone" label="Telefoon" optional type="tel" value={values.phone} onChange={set("phone")} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TextField id="street" label="Straat en huisnummer" value={values.street} onChange={set("street")} />
          </div>
          <TextField id="postalCode" label="Postcode" value={values.postalCode} onChange={set("postalCode")} />
          <TextField id="city" label="Plaats" value={values.city} onChange={set("city")} />
          <TextField id="country" label="Land" value={values.country} onChange={set("country")} />
          <SelectField id="status" label="Status" value={values.status} onChange={set("status")}>
            {(["active", "inactive"] as const).map((value) => (
              <option key={value} value={value}>
                {customerStatusLabels[value]}
              </option>
            ))}
          </SelectField>
          <TextField id="kvkNumber" label="KvK-nummer" optional value={values.kvkNumber} onChange={set("kvkNumber")} />
          <TextField id="vatNumber" label="Btw-nummer" optional value={values.vatNumber} onChange={set("vatNumber")} />
        </div>

        <TextareaField id="notes" label="Interne notities" optional value={values.notes} onChange={set("notes")} />

        <div className="flex flex-wrap items-end gap-4">
          <SaveControls
            className="w-full max-w-[16rem]"
            label="Opslaan"
            pending={pending}
            error={error}
            savedAt={savedAt}
            disabled={!dirty}
            onSave={() => save(() => updateCustomer(customer.id, values))}
          />
          {dirty ? (
            <AdminButton variant="secondary" onClick={() => setValues(stored)}>
              Wijzigingen ongedaan maken
            </AdminButton>
          ) : null}
        </div>
      </div>
    </AdminSection>
  );
}
