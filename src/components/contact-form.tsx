"use client";

import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";
import { trackEvent } from "@/lib/analytics/track";
import type { ErrorKind } from "@/lib/analytics/events";
import { attributionPayload, currentAttribution } from "@/lib/attribution/capture";
import { attributionEventParams } from "@/lib/attribution/event-params";
import { packageIdFromSearch, type PackageChoice } from "@/lib/contact/package-request";
import type { PackageId } from "@/lib/pricing";
import { reportLead } from "@/lib/tracking/conversions";

type ContactFormCopy = {
  nameLabel: string;
  emailLabel: string;
  companyLabel: string;
  messageLabel: string;
  namePlaceholder: string;
  emailPlaceholder: string;
  companyPlaceholder: string;
  messagePlaceholder: string;
  submitLabel: string;
  sendingLabel: string;
  successMessage: string;
  errorMessage: string;
  /** Above the chosen project type: "Je keuze". */
  choiceLabel: string;
  /** Link back to the pricing page next to the choice. */
  changeChoiceLabel: string;
  /** Under the choice: what the short form needs. */
  choiceHint: string;
  /** Label of the message field when the choice makes it optional. */
  messageOptionalLabel: string;
  messageOptionalPlaceholder: string;
  /** The button when a project type is chosen: "Verstuur aanvraag". */
  requestLabel: string;
  requestSuccessMessage: string;
};

/**
 * Short lines under the form: who the form is for and where the terms are,
 * and what happens with what is typed in, with the privacy statement a link
 * away. A note, not a checkbox: answering a request needs no consent.
 */
type ContactFormNote = {
  text: string;
  termsLabel: string;
  termsHref: string;
  privacyText: string;
  privacyLabel: string;
  privacyHref: string;
};

type ContactFormProps = {
  copy: ContactFormCopy;
  locale: "nl" | "en";
  note?: ContactFormNote;
  className?: string;
  /**
   * The five project types as the pricing catalog describes them, read on
   * the server. The form shows the one named in `?package=` and sends its
   * id along; without them, or without a known id, it is the plain form.
   */
  packageChoices?: Record<PackageId, PackageChoice>;
  /** Where "change your choice" leads: the pricing page. */
  pricingHref?: string;
};

type FormState = {
  name: string;
  email: string;
  company: string;
  message: string;
  website: string;
};

const initialState: FormState = {
  name: "",
  email: "",
  company: "",
  message: "",
  website: "",
};

type ContactField = "name" | "email" | "message";

/* Thrown after a non-2xx response, so the catch can tell it from a network failure. */
class ContactRequestFailed extends Error {}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/*
  The project type a pricing card put in the URL (?package=...). Read from
  the browser, which is the only place it exists; the page itself stays
  static. Checked against the fixed set of ids: anything else is no choice.
*/
const subscribeNoop = () => () => {};
const readPackageParam = () => packageIdFromSearch(window.location.search);
const noPackage = () => null;

export default function ContactForm({
  copy,
  locale,
  note,
  className = "",
  packageChoices,
  pricingHref,
}: ContactFormProps) {
  const isDutch = locale === "nl";
  const packageParam = useSyncExternalStore(subscribeNoop, readPackageParam, noPackage);
  const choice = packageParam && packageChoices ? packageChoices[packageParam] : null;
  const [form, setForm] = useState<FormState>(initialState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ContactField, string>>>({});
  const [formError, setFormError] = useState("");

  /*
    The funnel, as events: `contact_start` at the first character typed
    (once), `contact_error` by kind with the names of the fields concerned,
    `contact_submit` only after the server said yes. Nothing a visitor typed
    is ever part of an event.
  */
  const started = useRef(false);
  /* Set synchronously on submit, before React re-renders the disabled button. */
  const submitting = useRef(false);

  function trackContactError(kind: ErrorKind, fields: string[]) {
    trackEvent("contact_error", {
      form: "contact",
      error_kind: kind,
      fields: fields.length > 0 ? fields.join(",") : "none",
    });
  }

  /*
    With a project type chosen, the form asks for the least that still lets
    the request be answered: an address, and a name or a company. The plain
    form keeps its name and its message. The server applies the same rules.
  */
  function validateForm(values: FormState) {
    const errors: Partial<Record<ContactField, string>> = {};

    if (choice) {
      if (values.name.trim().length < 2 && values.company.trim().length < 2) {
        errors.name = isDutch ? "Vul je naam of bedrijfsnaam in" : "Enter your name or company name";
      }
    } else if (values.name.trim().length < 2) {
      errors.name = isDutch ? "Vul je naam in" : "Enter your name";
    }

    if (!values.email.trim() || !isValidEmail(values.email.trim())) {
      errors.email = isDutch
        ? "Vul een geldig e-mailadres in"
        : "Enter a valid email address";
    }

    if (!choice) {
      if (!values.message.trim()) {
        errors.message = isDutch ? "Vul je bericht in" : "Enter your message";
      } else if (values.message.trim().length < 12) {
        errors.message = isDutch
          ? "Je bericht is te kort"
          : "Your message is too short";
      }
    }

    return errors;
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    if (!started.current && key !== "website" && value.length > 0) {
      started.current = true;
      trackEvent("contact_start", { form: "contact", preselected_package: choice?.id ?? "none" });
    }
    setForm((prev) => ({ ...prev, [key]: value }));
    if (status !== "idle") setStatus("idle");
    if (formError) setFormError("");
    if (key === "name" || key === "email" || key === "message") {
      const fieldKey = key as ContactField;
      setFieldErrors((prev) => {
        if (!prev[fieldKey]) return prev;
        const next = { ...prev };
        delete next[fieldKey];
        return next;
      });
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    /* A second press while the first is on its way does nothing: one request, one lead. */
    if (submitting.current) return;

    const nextErrors = validateForm(form);
    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      trackContactError("validation", Object.keys(nextErrors));
      setStatus("error");
      setFormError(
        isDutch
          ? "Controleer de verplichte velden en probeer opnieuw."
          : "Check the required fields and try again.",
      );
      return;
    }

    submitting.current = true;
    setIsSubmitting(true);
    setStatus("idle");
    setFormError("");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        /* Where the visit came from travels with the request; the server checks it again. */
        body: JSON.stringify({ ...form, locale, ...(choice ? { package: choice.id } : {}), ...attributionPayload() }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | {
              error?: string;
              fieldErrors?: Partial<Record<ContactField, string>>;
            }
          | null;

        if (data?.fieldErrors) {
          setFieldErrors(data.fieldErrors);
        }

        if (data?.error) {
          setFormError(data.error);
        }

        trackContactError("server", Object.keys(data?.fieldErrors ?? {}));
        throw new ContactRequestFailed();
      }

      /* Accepted by the server: the one moment a lead exists for Meta and Google Ads (lib/tracking/conversions.ts). */
      const accepted = (await response.json().catch(() => null)) as { leadEventId?: unknown } | null;
      reportLead({ form: "contact", eventId: accepted?.leadEventId, contact: { email: form.email } });

      trackEvent("contact_submit", {
        form: "contact",
        preselected_package: choice?.id ?? "none",
        ...attributionEventParams(currentAttribution()),
      });
      setStatus("success");
      setForm(initialState);
      setFieldErrors({});
      setFormError("");
    } catch (error) {
      if (!(error instanceof ContactRequestFailed)) trackContactError("network", []);
      setStatus("error");
      setFormError((prev) => prev || copy.errorMessage);
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  }

  const inputBase =
    "min-h-12 w-full rounded-sm border border-line bg-surface px-3.5 py-3 text-[1rem] text-ink outline-none transition-colors placeholder:text-faint focus:border-ink";
  const inputError = "border-danger focus:border-danger";
  const labelBase = "label-mono mb-2 block";
  const errorText = "mt-2 text-[0.85rem] text-danger";

  /* Masked for Microsoft Clarity as a whole: whatever a visitor types or is shown back here never reaches a recording. */
  return (
    <div className={className} data-clarity-mask="true">
      <div>
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {choice ? (
            /* The choice made on the pricing page, named from the catalog; the visitor does not make it again. */
            <div className="rounded-sm border border-line bg-paper-deep px-4 py-4 sm:px-5" data-package-choice={choice.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <div>
                  <p className="label-mono">{copy.choiceLabel}</p>
                  <p className="mt-1 text-[1.15rem] font-semibold leading-snug tracking-[-0.01em] text-ink">
                    {choice.name}
                  </p>
                  <p className="mt-0.5 text-[0.92rem] leading-snug text-muted">
                    {choice.price} {isDutch ? "excl. btw" : "excl. VAT"}
                    <span aria-hidden="true"> · </span>
                    {isDutch ? "technisch beheer" : "technical management"} {choice.monthly}
                  </p>
                </div>
                {pricingHref ? (
                  <Link href={`${pricingHref}#${choice.id}`} className="link-static text-[0.9rem] text-muted hover:text-ink">
                    {copy.changeChoiceLabel}
                  </Link>
                ) : null}
              </div>
              <p className="mt-3 text-[0.9rem] leading-snug text-body">{copy.choiceHint}</p>
            </div>
          ) : null}

          <div className="hidden">
            <label htmlFor="website">Website</label>
            <input
              id="website"
              name="website"
              value={form.website}
              onChange={(e) => updateField("website", e.target.value)}
              autoComplete="off"
              tabIndex={-1}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className={labelBase}>
                {copy.nameLabel}
              </label>
              <input
                id="name"
                name="name"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder={copy.namePlaceholder}
                className={`${inputBase} ${fieldErrors.name ? inputError : ""}`}
                autoComplete="name"
                required={!choice}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? "contact-name-error" : undefined}
              />
              {fieldErrors.name ? (
                <p id="contact-name-error" className={errorText}>
                  {fieldErrors.name}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="email" className={labelBase}>
                {copy.emailLabel}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                placeholder={copy.emailPlaceholder}
                className={`${inputBase} ${fieldErrors.email ? inputError : ""}`}
                autoComplete="email"
                required
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "contact-email-error" : undefined}
              />
              {fieldErrors.email ? (
                <p id="contact-email-error" className={errorText}>
                  {fieldErrors.email}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <label htmlFor="company" className={labelBase}>
              {copy.companyLabel}
            </label>
            <input
              id="company"
              name="company"
              value={form.company}
              onChange={(e) => updateField("company", e.target.value)}
              placeholder={copy.companyPlaceholder}
              className={inputBase}
              autoComplete="organization"
            />
          </div>

          <div>
            <label htmlFor="message" className={labelBase}>
              {choice ? copy.messageOptionalLabel : copy.messageLabel}
            </label>
            <textarea
              id="message"
              name="message"
              value={form.message}
              onChange={(e) => updateField("message", e.target.value)}
              placeholder={choice ? copy.messageOptionalPlaceholder : copy.messagePlaceholder}
              className={`${inputBase} resize-y ${choice ? "min-h-[120px]" : "min-h-[180px]"} ${fieldErrors.message ? inputError : ""}`}
              required={!choice}
              aria-invalid={Boolean(fieldErrors.message)}
              aria-describedby={fieldErrors.message ? "contact-message-error" : undefined}
            />
            {fieldErrors.message ? (
              <p id="contact-message-error" className={errorText}>
                {fieldErrors.message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-4 pt-1 sm:flex-row sm:items-start sm:justify-between">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-sm bg-ink px-6 text-[0.95rem] font-medium text-paper transition-colors duration-200 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? copy.sendingLabel : choice ? copy.requestLabel : copy.submitLabel}
            </button>

            <div className="min-h-6 text-[0.9rem] leading-snug" aria-live="polite">
              {status === "success" ? (
                <span className="text-success">{choice ? copy.requestSuccessMessage : copy.successMessage}</span>
              ) : null}
              {status === "error" ? (
                <span className="text-danger">{formError || copy.errorMessage}</span>
              ) : null}
            </div>
          </div>

          {note ? (
            <p className="text-[0.85rem] leading-relaxed text-muted">
              {note.text}{" "}
              <Link href={note.termsHref} hrefLang="nl" className="link-static text-body">
                {note.termsLabel}
              </Link>
              {" "}
              {note.privacyText}{" "}
              <Link href={note.privacyHref} className="link-static text-body">
                {note.privacyLabel}
              </Link>
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
