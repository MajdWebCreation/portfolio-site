"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

type ContactFormCopy = {
  eyebrow: string;
  title: string;
  description: string;
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
};

type ContactFormProps = {
  copy: ContactFormCopy;
  className?: string;
  hideIntro?: boolean;
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

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function ContactForm({
  copy,
  className = "",
  hideIntro = false,
}: ContactFormProps) {
  const [form, setForm] = useState<FormState>(initialState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ContactField, string>>>({});
  const [formError, setFormError] = useState("");

  function validateForm(values: FormState) {
    const errors: Partial<Record<ContactField, string>> = {};

    if (values.name.trim().length < 2) {
      errors.name = copy.nameLabel.toLowerCase().includes("naam")
        ? "Vul je naam in"
        : "Enter your name";
    }

    if (!values.email.trim()) {
      errors.email = copy.emailLabel.toLowerCase().includes("e-mail")
        ? "Vul een geldig e-mailadres in"
        : "Enter a valid email address";
    } else if (!isValidEmail(values.email.trim())) {
      errors.email = copy.emailLabel.toLowerCase().includes("e-mail")
        ? "Vul een geldig e-mailadres in"
        : "Enter a valid email address";
    }

    if (!values.message.trim()) {
      errors.message = copy.messageLabel.toLowerCase().includes("bericht")
        ? "Vul je bericht in"
        : "Enter your message";
    } else if (values.message.trim().length < 12) {
      errors.message = copy.messageLabel.toLowerCase().includes("bericht")
        ? "Je bericht is te kort"
        : "Your message is too short";
    }

    return errors;
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
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
    const nextErrors = validateForm(form);
    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0 || isSubmitting) {
      setStatus("error");
      setFormError(
        copy.messageLabel.toLowerCase().includes("bericht")
          ? "Controleer de verplichte velden en probeer opnieuw."
          : "Check the required fields and try again.",
      );
      return;
    }

    setIsSubmitting(true);
    setStatus("idle");
    setFormError("");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
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

        throw new Error("Request failed");
      }

      setStatus("success");
      setForm(initialState);
      setFieldErrors({});
      setFormError("");
      trackEvent({
        name: "contact_form_submit_success",
        category: "contact",
        label: "contact-form",
        location: "contact-form",
      });
    } catch {
      setStatus("error");
      setFormError((prev) => prev || copy.errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputBase =
    "w-full rounded-[1.15rem] border border-[color:var(--line)] bg-[var(--background-elevated)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[color:var(--muted-foreground)] focus:border-[color:var(--line-strong)]";
  const labelBase =
    "mb-2 block text-[11px] uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]";

  return (
    <div
      className={`ym-surface-soft relative overflow-hidden rounded-[2rem] p-5 sm:p-6 ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_34%)]" />

      <div className="relative z-10">
        {!hideIntro ? (
          <>
            <p className="mb-3 text-[11px] uppercase tracking-[0.28em] text-[var(--accent-text)]">
              {copy.eyebrow}
            </p>
            <h3 className="max-w-xl text-2xl font-semibold text-[var(--foreground)] sm:text-3xl">
              {copy.title}
            </h3>
            <p className="mt-4 max-w-xl text-sm leading-7 text-[color:var(--muted-foreground)]">
              {copy.description}
            </p>
          </>
        ) : null}

        <form onSubmit={handleSubmit} className={hideIntro ? "space-y-4" : "mt-8 space-y-4"}>
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

          <div className="grid gap-4 sm:grid-cols-2">
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
                className={`${inputBase} ${fieldErrors.name ? "border-red-300/55 bg-red-400/[0.06] focus:border-red-300/65" : ""}`}
                autoComplete="name"
                required
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? "contact-name-error" : undefined}
              />
              {fieldErrors.name ? (
                <p id="contact-name-error" className="mt-2 text-sm text-red-200">
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
                className={`${inputBase} ${fieldErrors.email ? "border-red-300/55 bg-red-400/[0.06] focus:border-red-300/65" : ""}`}
                autoComplete="email"
                required
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "contact-email-error" : undefined}
              />
              {fieldErrors.email ? (
                <p id="contact-email-error" className="mt-2 text-sm text-red-200">
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
              {copy.messageLabel}
            </label>
            <textarea
              id="message"
              name="message"
              value={form.message}
              onChange={(e) => updateField("message", e.target.value)}
              placeholder={copy.messagePlaceholder}
              className={`${inputBase} min-h-[160px] resize-none ${fieldErrors.message ? "border-red-300/55 bg-red-400/[0.06] focus:border-red-300/65" : ""}`}
              required
              aria-invalid={Boolean(fieldErrors.message)}
              aria-describedby={fieldErrors.message ? "contact-message-error" : undefined}
            />
            {fieldErrors.message ? (
              <p id="contact-message-error" className="mt-2 text-sm text-red-200">
                {fieldErrors.message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="submit"
              disabled={isSubmitting}
              data-track-event="contact_cta_click"
              data-track-category="contact"
              data-track-label={copy.submitLabel}
              data-track-location="contact-form-submit"
              className="inline-flex items-center justify-center rounded-full bg-[var(--button-bg)] px-6 py-3 text-sm font-medium text-[var(--button-text)] transition hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? copy.sendingLabel : copy.submitLabel}
            </button>

            <div className="min-h-[24px] text-sm text-[color:var(--muted-foreground)]">
              {status === "success" && <span className="text-[var(--accent-text)]">{copy.successMessage}</span>}
              {status === "error" && (
                <span className="text-red-300/85">{formError || copy.errorMessage}</span>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
