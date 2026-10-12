"use client";

import { useActionState, useState } from "react";
import { saveProfileAction, type ProfileFormState } from "@/lib/portal/profile/actions";
import { normalizeProfile, profileLabels, profileLimits, validateProfile, type ProfileErrors, type ProfileField, type ProfileFields } from "@/lib/portal/profile/model";

/**
 * The customer's details as a form. It checks what it can before sending,
 * shows the server's answer next to the field it is about, keeps what was
 * typed when a save is refused, and after a save shows what is stored --
 * read back from the server, not echoed from the inputs.
 */
const initial: ProfileFormState = { status: "idle" };

type FieldSpec = { field: ProfileField; type?: string; autoComplete?: string; optional?: boolean; hint?: string; wide?: boolean };

const companyFields: FieldSpec[] = [
  { field: "companyName", autoComplete: "organization", wide: true },
  { field: "kvkNumber", optional: true },
  { field: "vatNumber", optional: true },
  { field: "street", autoComplete: "street-address", wide: true },
  { field: "postalCode", autoComplete: "postal-code" },
  { field: "city", autoComplete: "address-level2" },
  { field: "country", autoComplete: "country-name" },
];

const contactFields: FieldSpec[] = [
  { field: "contactName", autoComplete: "name", wide: true },
  {
    field: "email",
    type: "email",
    autoComplete: "email",
    hint: "Hier sturen wij offertes en algemene berichten naartoe. Dit verandert niet het e-mailadres waarmee u inlogt in het klantportaal.",
    wide: true,
  },
  { field: "phone", type: "tel", autoComplete: "tel", optional: true },
  {
    field: "billingEmail",
    type: "email",
    optional: true,
    hint: "Facturen, herinneringen, creditnota's en incassoberichten gaan naar dit adres. Leeg laten: dan naar het e-mailadres hierboven.",
    wide: true,
  },
];

function Field({ spec, value, error, onChange }: { spec: FieldSpec; value: string; error?: string; onChange: (value: string) => void }) {
  const id = `profile-${spec.field}`;
  const describedBy = [spec.hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={spec.wide ? "sm:col-span-2" : ""}>
      <label htmlFor={id} className="block text-[0.88rem] text-ink">
        {profileLabels[spec.field]}
        {spec.optional ? <span className="ml-1 text-muted">(optioneel)</span> : null}
      </label>
      <input
        id={id}
        name={spec.field}
        type={spec.type ?? "text"}
        value={value}
        maxLength={profileLimits[spec.field]}
        autoComplete={spec.autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-1.5 min-h-11 w-full rounded-sm border bg-surface px-3 text-[0.95rem] text-ink outline-none focus:border-ink ${error ? "border-danger" : "border-line"}`}
      />
      {spec.hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[0.82rem] text-muted">
          {spec.hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[0.85rem] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function ProfileForm({ customerId, fields, version }: { customerId: string; fields: ProfileFields; version: string }) {
  const [values, setValues] = useState<ProfileFields>(fields);
  const [stored, setStored] = useState({ fields, version });
  const [clientErrors, setClientErrors] = useState<ProfileErrors>({});

  const [state, action, pending] = useActionState(async (previous: ProfileFormState, formData: FormData) => {
    const result = await saveProfileAction(previous, formData);
    if (result.status === "saved" || result.status === "unchanged") {
      setStored({ fields: result.fields, version: result.version });
      setValues(result.fields);
    }
    return result;
  }, initial);

  const errors: ProfileErrors = { ...(state.status === "invalid" ? state.errors : {}), ...clientErrors };

  function set(field: ProfileField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (clientErrors[field]) setClientErrors((current) => ({ ...current, [field]: undefined }));
  }

  function check(event: React.FormEvent<HTMLFormElement>) {
    const found = validateProfile(normalizeProfile(values));
    const cleaned = Object.fromEntries(Object.entries(found).filter(([, message]) => message)) as ProfileErrors;
    setClientErrors(cleaned);
    const first = Object.keys(cleaned)[0];
    if (first) {
      event.preventDefault();
      document.getElementById(`profile-${first}`)?.focus();
    }
  }

  const section = (title: string, specs: FieldSpec[]) => (
    <fieldset className="mt-10 border-t border-line pt-6">
      <legend className="label-mono text-muted">{title}</legend>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {specs.map((spec) => (
          <Field key={spec.field} spec={spec} value={values[spec.field]} error={errors[spec.field]} onChange={(value) => set(spec.field, value)} />
        ))}
      </div>
    </fieldset>
  );

  return (
    <form action={action} onSubmit={check} noValidate>
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="version" value={stored.version} />

      {section("Bedrijfsgegevens", companyFields)}
      {section("Contactgegevens", contactFields)}

      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-6">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-sm bg-ink px-5 text-[0.95rem] font-medium text-paper transition-opacity disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "Bezig met opslaan…" : "Wijzigingen opslaan"}
        </button>
        <p role="status" aria-live="polite" className="text-[0.9rem]">
          {state.status === "saved" ? <span className="text-success">Uw gegevens zijn opgeslagen.</span> : null}
          {state.status === "unchanged" ? <span className="text-muted">Er was niets gewijzigd.</span> : null}
          {state.status === "invalid" ? <span className="text-danger">Controleer de gemarkeerde velden.</span> : null}
        </p>
      </div>
      {state.status === "conflict" || state.status === "stale_customer" || state.status === "error" ? (
        <div role="alert" className="mt-4 max-w-prose border-l-2 border-danger pl-4 text-[0.92rem] text-body">
          <p>{state.message}</p>
          {state.status !== "error" ? (
            <button type="button" onClick={() => window.location.reload()} className="link-static mt-2 text-ink">
              Pagina opnieuw laden
            </button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
