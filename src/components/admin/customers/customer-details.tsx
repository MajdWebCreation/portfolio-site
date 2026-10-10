"use client";

import { useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import AdminSection from "@/components/admin/admin-section";
import { validateCustomerForm } from "@/components/admin/customers/customer-form";
import { DetailList, DetailRow } from "@/components/admin/detail-list";
import { SelectField, TextField, TextareaField } from "@/components/admin/form-field";
import SaveControls, { useSave } from "@/components/admin/save-controls";
import StatusBadge from "@/components/admin/status-badge";
import { formatDateTime } from "@/lib/admin/format";
import { updateCustomer, type CustomerInput } from "@/lib/admin/customers/actions";
import { customerStatusLabels, customerStatusTone, type Customer } from "@/lib/admin/customers/types";

/**
 * The customer's own data: a quiet read-only list by default, and the same
 * rows as inputs, in the same place, after the pencil. One copy of the data
 * on the page, never two.
 *
 * Saving goes through `updateCustomer`, the same action and the same server
 * checks the old form used; the client runs the create form's validation
 * first so a mistake is pointed at before the round trip. The address is
 * required because documents snapshot it, and documents already made keep
 * the snapshot they were made with.
 *
 * Internal notes are the one thing that is always editable (below), and are
 * saved on their own: a note typed while the rest is being edited is not
 * lost, and the general save never carries an unsaved note along.
 */
type Fields = {
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
};

function fieldsOf(customer: Customer): Fields {
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
    status: customer.status,
  };
}

/** The action's input: the fields given, with whatever the record holds for the rest. */
function inputOf(fields: Fields, notes: string): CustomerInput {
  const optional = (value: string) => (value.trim() ? value.trim() : undefined);
  return {
    companyName: fields.companyName,
    contactName: fields.contactName,
    email: fields.email,
    phone: optional(fields.phone),
    street: fields.street,
    postalCode: fields.postalCode,
    city: fields.city,
    country: fields.country,
    kvkNumber: optional(fields.kvkNumber),
    vatNumber: optional(fields.vatNumber),
    notes,
    status: fields.status,
  };
}

function Dash() {
  return <span className="text-muted">—</span>;
}

/** The pencil: a real button, so it is reachable by keyboard and named for a screen reader. */
function EditButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Klantgegevens bewerken"
      title="Klantgegevens bewerken"
      className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-line text-muted transition-colors hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11.3 2.2a1.6 1.6 0 0 1 2.3 2.3L5.2 12.9l-3.1.8.8-3.1z" />
        <path d="M9.8 3.7l2.3 2.3" />
      </svg>
    </button>
  );
}

/** Every field as a row, as the page shows it when nobody is editing. */
export function CustomerDetailsView({ customer }: { customer: Customer }) {
  const { address } = customer;
  return (
    <DetailList>
      <DetailRow term="Bedrijf">{customer.companyName}</DetailRow>
      <DetailRow term="Contactpersoon">{customer.contactName}</DetailRow>
      <DetailRow term="E-mail">
        <a href={`mailto:${customer.email}`} className="link-static">
          {customer.email}
        </a>
      </DetailRow>
      <DetailRow term="Telefoon">
        {customer.phone ? (
          <a href={`tel:${customer.phone.replace(/\s/g, "")}`} className="link-static tabular">
            {customer.phone}
          </a>
        ) : (
          <Dash />
        )}
      </DetailRow>
      <DetailRow term="Status">
        <StatusBadge tone={customerStatusTone[customer.status]}>{customerStatusLabels[customer.status]}</StatusBadge>
      </DetailRow>
      <DetailRow term="Adres">
        {address.street}
        <span className="block">
          {address.postalCode} {address.city}
        </span>
        <span className="block">{address.country}</span>
      </DetailRow>
      <DetailRow term="KvK-nummer">{customer.kvkNumber ?? <Dash />}</DetailRow>
      <DetailRow term="Btw-nummer">{customer.vatNumber ?? <Dash />}</DetailRow>
      <DetailRow term="Klant sinds">{formatDateTime(customer.createdAt)}</DetailRow>
    </DetailList>
  );
}

type FieldErrors = Partial<Record<keyof Fields, string>>;

/** The same fields as inputs, prefilled, with their own errors under them. */
export function CustomerDetailsFields({
  values,
  errors,
  onChange,
}: {
  values: Fields;
  errors: FieldErrors;
  onChange: (field: keyof Fields, value: string) => void;
}) {
  const set = (field: keyof Fields) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange(field, event.target.value);
  return (
    <div className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField id="companyName" label="Bedrijfsnaam" value={values.companyName} onChange={set("companyName")} error={errors.companyName} />
        <TextField id="contactName" label="Contactpersoon" value={values.contactName} onChange={set("contactName")} error={errors.contactName} />
        <TextField id="email" label="E-mail" type="email" value={values.email} onChange={set("email")} error={errors.email} />
        <TextField id="phone" label="Telefoon" optional type="tel" value={values.phone} onChange={set("phone")} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <TextField id="street" label="Straat en huisnummer" value={values.street} onChange={set("street")} error={errors.street} />
        </div>
        <TextField id="postalCode" label="Postcode" value={values.postalCode} onChange={set("postalCode")} error={errors.postalCode} />
        <TextField id="city" label="Plaats" value={values.city} onChange={set("city")} error={errors.city} />
        <TextField id="country" label="Land" value={values.country} onChange={set("country")} error={errors.country} />
        <SelectField id="status" label="Status" value={values.status} onChange={set("status")} error={errors.status}>
          {(["active", "inactive"] as const).map((value) => (
            <option key={value} value={value}>
              {customerStatusLabels[value]}
            </option>
          ))}
        </SelectField>
        <TextField id="kvkNumber" label="KvK-nummer" optional value={values.kvkNumber} onChange={set("kvkNumber")} />
        <TextField id="vatNumber" label="Btw-nummer" optional value={values.vatNumber} onChange={set("vatNumber")} />
      </div>
    </div>
  );
}

export default function CustomerDetails({ customer }: { customer: Customer }) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Fields>(() => fieldsOf(customer));
  const [errors, setErrors] = useState<FieldErrors>({});
  const { save, pending, error, savedAt } = useSave();

  function startEditing() {
    // Always from the record as it is now, not from an earlier, cancelled attempt.
    setValues(fieldsOf(customer));
    setErrors({});
    setEditing(true);
  }

  function cancel() {
    setValues(fieldsOf(customer));
    setErrors({});
    setEditing(false);
  }

  function submit() {
    const found = validateCustomerForm({ ...values, notes: customer.notes });
    const relevant: FieldErrors = Object.fromEntries(
      Object.entries(found).filter(([key, message]) => key !== "notes" && message),
    ) as FieldErrors;
    setErrors(relevant);
    const first = Object.keys(relevant)[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    // The notes travel as they are stored; they have their own save below.
    save(
      () => updateCustomer(customer.id, inputOf(values, customer.notes)),
      () => setEditing(false),
    );
  }

  const dirty = editing && (Object.keys(values) as (keyof Fields)[]).some((key) => values[key] !== fieldsOf(customer)[key]);

  return (
    <section aria-labelledby="customer" className="border-t border-line-strong pt-4">
      <div className="flex items-center justify-between gap-4">
        <h2 id="customer" className="label-mono text-ink">
          Klantgegevens
        </h2>
        {editing ? (
          <p className="text-[0.85rem] text-muted">{dirty ? "Niet opgeslagen" : "Bewerken"}</p>
        ) : (
          <EditButton onClick={startEditing} />
        )}
      </div>
      <div className="mt-4">
        {editing ? (
          <div className="grid max-w-[40rem] gap-5">
            <CustomerDetailsFields
              values={values}
              errors={errors}
              onChange={(field, value) => {
                setValues((previous) => ({ ...previous, [field]: value }));
                setErrors((previous) => (previous[field] ? { ...previous, [field]: undefined } : previous));
              }}
            />
            <div className="flex flex-wrap items-end gap-4">
              <SaveControls
                className="w-full max-w-[16rem]"
                label="Wijzigingen opslaan"
                pending={pending}
                error={error}
                savedAt={null}
                disabled={!dirty}
                onSave={submit}
              />
              <AdminButton variant="secondary" onClick={cancel} disabled={pending}>
                Annuleren
              </AdminButton>
            </div>
          </div>
        ) : (
          <>
            <CustomerDetailsView customer={customer} />
            {savedAt ? <p className="mt-2 text-[0.85rem] text-muted">Opgeslagen {formatDateTime(savedAt)}</p> : null}
          </>
        )}
      </div>
    </section>
  );
}

/**
 * Internal notes, always open and always editable, saved on their own
 * through the same `updateCustomer` action: every other field is sent as
 * the record holds it, so saving a note changes a note and nothing else.
 */
export function CustomerNotes({ customer }: { customer: Customer }) {
  const [notes, setNotes] = useState(customer.notes);
  const { save, pending, error, savedAt } = useSave();
  const dirty = notes !== customer.notes;

  return (
    <AdminSection id="notes" title="Interne notities" note={dirty ? "Niet opgeslagen" : undefined}>
      <div className="grid max-w-[40rem] gap-4">
        <TextareaField
          id="notes"
          label="Notities"
          optional
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="min-h-44"
          placeholder="Afspraken, context, wie de klant heeft aangebracht"
        />
        <SaveControls
          className="w-full max-w-[16rem]"
          label="Notities opslaan"
          pending={pending}
          error={error}
          savedAt={savedAt}
          disabled={!dirty}
          onSave={() => save(() => updateCustomer(customer.id, inputOf(fieldsOf(customer), notes)))}
        />
      </div>
    </AdminSection>
  );
}
