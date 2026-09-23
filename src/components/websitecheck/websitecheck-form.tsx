"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { currentAttribution } from "@/lib/attribution/capture";
import { normalizeWebsiteUrl, websiteUrlHost } from "@/lib/contact/website-url";
import type { WebsitecheckFormCopy } from "@/lib/content/websitecheck";

type Field = "websiteUrl" | "name" | "email" | "phone";

type FormState = Record<Field, string> & {
  /** Honeypot; never shown, must stay empty. */
  website: string;
};

/**
 * Idle, sending, refused, or received. `success` is set in exactly one place:
 * after the server answered 2xx with `ok: true`, which it only does once the
 * request is stored. The state is mirrored on the wrapper as
 * `data-websitecheck-state`, so later conversion tracking has one hook.
 */
type Status = "idle" | "submitting" | "error" | "success";

const initialState: FormState = { websiteUrl: "", name: "", email: "", phone: "", website: "" };

const fieldIds: Record<Field, string> = {
  websiteUrl: "websitecheck-url",
  name: "websitecheck-name",
  email: "websitecheck-email",
  phone: "websitecheck-phone",
};

const phonePattern = /^\+?[0-9][0-9 ()./-]{5,29}$/;

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/* Thrown after a non-2xx response, so the catch can tell it from a network failure. */
class RequestFailed extends Error {}

type WebsitecheckFormProps = {
  copy: WebsitecheckFormCopy;
  privacyHref: string;
};

export default function WebsitecheckForm({ copy, privacyHref }: WebsitecheckFormProps) {
  const [form, setForm] = useState<FormState>(initialState);
  const [status, setStatus] = useState<Status>("idle");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState("");
  const [received, setReceived] = useState<{ host: string; email: string } | null>(null);
  const successHeading = useRef<HTMLHeadingElement>(null);

  /* Once the request is in, the heading of the confirmation takes focus so a screen reader announces it. */
  useEffect(() => {
    if (status === "success") successHeading.current?.focus();
  }, [status]);

  function validate(values: FormState) {
    const errors: Partial<Record<Field, string>> = {};
    if (!normalizeWebsiteUrl(values.websiteUrl)) errors.websiteUrl = copy.errors.websiteUrl;
    if (values.name.trim().length < 2) errors.name = copy.errors.name;
    if (!isValidEmail(values.email.trim())) errors.email = copy.errors.email;
    if (values.phone.trim() && !phonePattern.test(values.phone.trim())) errors.phone = copy.errors.phone;
    return errors;
  }

  function update(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (status === "error") setStatus("idle");
    if (formError) setFormError("");
    if (key !== "website") {
      setFieldErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;

    const errors = validate(form);
    setFieldErrors(errors);
    const firstInvalid = (Object.keys(errors) as Field[])[0];
    if (firstInvalid) {
      setStatus("error");
      setFormError(copy.checkFields);
      document.getElementById(fieldIds[firstInvalid])?.focus();
      return;
    }

    setStatus("submitting");
    setFormError("");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /* Where the visit came from travels with the request; the server checks it again. */
        body: JSON.stringify({
          mode: "websitecheck",
          locale: "nl",
          websiteUrl: form.websiteUrl,
          name: form.name,
          email: form.email,
          phone: form.phone,
          website: form.website,
          attribution: currentAttribution() ?? undefined,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; fieldErrors?: Partial<Record<Field, string>> }
        | null;

      if (!response.ok || data?.ok !== true) {
        if (data?.fieldErrors) setFieldErrors(data.fieldErrors);
        if (data?.error) setFormError(data.error);
        throw new RequestFailed();
      }

      /* The one success condition: the server confirmed the request is stored. */
      setReceived({
        host: websiteUrlHost(normalizeWebsiteUrl(form.websiteUrl) ?? form.websiteUrl),
        email: form.email.trim().toLowerCase(),
      });
      setStatus("success");
    } catch {
      setStatus("error");
      setFormError((prev) => prev || copy.errorMessage);
    }
  }

  const inputBase =
    "min-h-12 w-full rounded-sm border border-line-strong bg-paper px-3.5 py-3 text-[1rem] text-ink outline-none transition-colors placeholder:text-faint focus:border-ink";
  const inputError = "border-danger focus:border-danger";
  const labelBase = "label-mono mb-2 flex items-baseline justify-between gap-3";
  const errorText = "mt-2 text-[0.85rem] text-danger";

  function field(
    key: Field,
    label: string,
    input: Omit<React.ComponentProps<"input">, "id" | "name" | "value" | "onChange" | "className">,
    optional = false,
  ) {
    const error = fieldErrors[key];
    const errorId = `${fieldIds[key]}-error`;
    return (
      <div>
        <label htmlFor={fieldIds[key]} className={labelBase}>
          <span>{label}</span>
          {optional ? <span className="normal-case tracking-normal text-faint">{copy.optionalLabel}</span> : null}
        </label>
        <input
          id={fieldIds[key]}
          name={key}
          value={form[key]}
          onChange={(e) => update(key, e.target.value)}
          className={`${inputBase} ${error ? inputError : ""}`}
          required={!optional}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          {...input}
        />
        {error ? (
          <p id={errorId} className={errorText}>
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  /* Masked for Microsoft Clarity as a whole: whatever a visitor types or is shown back here never reaches a recording. */
  return (
    <div
      id="websitecheck-form"
      data-websitecheck-state={status}
      data-clarity-mask="true"
      className="scroll-mt-6 rounded-md border border-line bg-surface p-5 shadow-lift sm:p-7"
    >
      {status === "success" && received ? (
        <div id="websitecheck-success" role="status" className="consent-in">
          <p className="label-mono flex items-center gap-2.5 text-success">
            <span aria-hidden="true" className="block h-[7px] w-[7px] rounded-full bg-success" />
            {copy.success.label}
          </p>
          <h2 ref={successHeading} tabIndex={-1} className="display-sm mt-4 outline-none">
            {copy.success.title.replace("{host}", received.host)}
          </h2>
          <p className="mt-4 text-[1rem] leading-relaxed text-body">
            {copy.success.text.replace("{email}", received.email)}
          </p>
          <p className="mt-6 border-t border-line pt-4 text-[0.9rem] leading-relaxed text-muted">{copy.success.note}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5" noValidate>
          <h2 className="display-sm max-sm:text-[1.25rem]">{copy.title}</h2>

          <div className="hidden">
            <label htmlFor="websitecheck-website">Website</label>
            <input
              id="websitecheck-website"
              name="website"
              value={form.website}
              onChange={(e) => update("website", e.target.value)}
              autoComplete="off"
              tabIndex={-1}
            />
          </div>

          {field("websiteUrl", copy.websiteLabel, {
            type: "url",
            inputMode: "url",
            autoComplete: "url",
            autoCapitalize: "none",
            autoCorrect: "off",
            spellCheck: false,
            placeholder: copy.websitePlaceholder,
          })}
          {field("name", copy.nameLabel, {
            type: "text",
            autoComplete: "name",
            autoCapitalize: "words",
            placeholder: copy.namePlaceholder,
          })}
          {field("email", copy.emailLabel, {
            type: "email",
            inputMode: "email",
            autoComplete: "email",
            autoCapitalize: "none",
            autoCorrect: "off",
            spellCheck: false,
            placeholder: copy.emailPlaceholder,
          })}
          {field(
            "phone",
            copy.phoneLabel,
            { type: "tel", inputMode: "tel", autoComplete: "tel", placeholder: copy.phonePlaceholder },
            true,
          )}

          <div className="pt-1">
            <button
              type="submit"
              disabled={status === "submitting"}
              aria-busy={status === "submitting"}
              className="inline-flex min-h-13 w-full items-center justify-center rounded-sm bg-ink px-4 text-center text-[0.95rem] font-medium leading-snug text-paper transition-colors duration-200 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 sm:px-6 sm:text-[1rem]"
            >
              {status === "submitting" ? copy.sendingLabel : copy.submitLabel}
            </button>
            <div className="min-h-6 pt-3 text-[0.9rem] leading-snug" aria-live="polite">
              {status === "error" && formError ? <p className="text-danger">{formError}</p> : null}
            </div>
          </div>

          <div className="space-y-2 border-t border-line pt-4 text-[0.85rem] leading-relaxed text-muted">
            <p className="flex items-center gap-2.5 text-body">
              <span aria-hidden="true" className="block h-[7px] w-[7px] shrink-0 rounded-full bg-accent" />
              {copy.confirmationNote}
            </p>
            <p>{copy.businessNote}</p>
            <p>
              {copy.privacyNote}{" "}
              <Link href={privacyHref} className="link-static text-body">
                {copy.privacyLabel}
              </Link>
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
