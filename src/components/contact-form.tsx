"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";

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

export default function ContactForm({
  copy,
  className = "",
}: ContactFormProps) {
  const [form, setForm] = useState<FormState>(initialState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const isValid = useMemo(() => {
    return (
      form.name.trim().length >= 2 &&
      form.email.trim().length >= 5 &&
      form.message.trim().length >= 12
    );
  }, [form]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (status !== "idle") setStatus("idle");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    setStatus("idle");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        throw new Error("Request failed");
      }

      setStatus("success");
      setForm(initialState);
    } catch {
      setStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputBase =
    "w-full rounded-[1.15rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/28 focus:border-cyan-400/40 focus:bg-white/[0.05]";
  const labelBase =
    "mb-2 block text-[11px] uppercase tracking-[0.24em] text-white/42";

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: false, amount: 0.2 }}
      transition={{ duration: 0.7 }}
      className={`relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md sm:p-6 ${className}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_36%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:34px_34px]" />

      <div className="relative z-10">
        <p className="mb-3 text-[11px] uppercase tracking-[0.28em] text-cyan-300/78">
          {copy.eyebrow}
        </p>
        <h3 className="max-w-xl text-2xl font-semibold text-white sm:text-3xl">
          {copy.title}
        </h3>
        <p className="mt-4 max-w-xl text-sm leading-7 text-white/62">
          {copy.description}
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
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
                className={inputBase}
                autoComplete="name"
                required
              />
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
                className={inputBase}
                autoComplete="email"
                required
              />
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
              className={`${inputBase} min-h-[160px] resize-none`}
              required
            />
          </div>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? copy.sendingLabel : copy.submitLabel}
            </button>

            <div className="min-h-[24px] text-sm">
              {status === "success" && (
                <span className="text-cyan-300/85">{copy.successMessage}</span>
              )}
              {status === "error" && (
                <span className="text-red-300/85">{copy.errorMessage}</span>
              )}
            </div>
          </div>
        </form>
      </div>
    </motion.div>
  );
}