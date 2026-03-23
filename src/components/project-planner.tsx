"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { trackEvent } from "@/lib/analytics";
import {
  buildPlannerSummary,
  formatEuro,
  getPlannerPageContent,
  initialPlannerState,
  type PlannerPackageKey,
  type PlannerPriority,
  type PlannerReadiness,
  type PlannerState,
  type PlannerTimeline,
} from "@/lib/content/project-planner";
import { type Locale } from "@/lib/content/site-content";

type ProjectPlannerProps = {
  locale: Locale;
};

type PlannerErrorKey =
  | "projectType"
  | "pageCount"
  | "smartScope"
  | "webshopProducts"
  | "customScope"
  | "launchTimeline"
  | "contentReady"
  | "brandingReady"
  | "priority"
  | "name"
  | "email";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function ProgressBar({
  labels,
  currentStep,
}: {
  labels: string[];
  currentStep: number;
}) {
  return (
    <div className="border-y border-white/10 py-4">
      <div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-300/76">
            Step {String(currentStep + 1).padStart(2, "0")} / {String(labels.length).padStart(2, "0")}
          </p>
          <p className="mt-2 text-sm text-white">{labels[currentStep]}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {labels.map((label, index) => (
          <span
            key={label}
            className={`h-1.5 flex-1 rounded-full transition ${
              index <= currentStep ? "bg-cyan-300/70" : "bg-white/10"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function ChoiceButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[1.2rem] border px-4 py-3 text-left text-sm transition ${
        active
          ? "border-cyan-300/38 bg-[rgba(15,28,40,0.82)] text-white"
          : "border-white/10 bg-white/[0.025] text-white/64 hover:border-white/18 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function ToggleRow({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 border-b border-white/8 py-4 text-left last:border-b-0"
    >
      <span className="text-sm leading-7 text-white/66">{label}</span>
      <span
        className={`h-6 w-11 rounded-full border transition ${
          checked
            ? "border-cyan-300/40 bg-cyan-300/20"
            : "border-white/12 bg-white/[0.04]"
        }`}
      >
        <span
          className={`mt-[3px] block h-4 w-4 rounded-full bg-white transition ${
            checked ? "ml-[22px]" : "ml-[3px]"
          }`}
        />
      </span>
    </button>
  );
}

function SectionLabel({
  title,
  support,
  trailing,
  expandedInfo,
}: {
  title: string;
  support?: string;
  trailing?: React.ReactNode;
  expandedInfo?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <p className="text-[10px] uppercase tracking-[0.26em] text-cyan-300/74">
          {title}
        </p>
        {trailing}
      </div>
      {support ? (
        <p className="mt-3 max-w-2xl text-sm leading-7 text-white/48">
          {support}
        </p>
      ) : null}
      {expandedInfo}
    </div>
  );
}

function InlineError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;

  return (
    <p id={id} className="mt-3 text-sm text-red-200">
      {message}
    </p>
  );
}

function getTimelineLabel(locale: Locale, value: PlannerTimeline) {
  if (!value) return "";
  return getPlannerPageContent(locale).options.timeline[value];
}

function getReadinessLabel(locale: Locale, value: PlannerReadiness) {
  if (!value) return "";
  const content = getPlannerPageContent(locale);
  if (value === "yes") return content.options.yes;
  if (value === "partly") return content.options.partly;
  return content.options.no;
}

function getPriorityLabel(locale: Locale, value: PlannerPriority) {
  if (!value) return "";
  return getPlannerPageContent(locale).options.priority[value];
}

export default function ProjectPlanner({ locale }: ProjectPlannerProps) {
  const content = getPlannerPageContent(locale);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<PlannerErrorKey, string>>>({});
  const [formError, setFormError] = useState("");
  const [openInfoKey, setOpenInfoKey] = useState<"content" | "branding" | null>(null);
  const [form, setForm] = useState<PlannerState>({
    ...initialPlannerState,
    locale,
  });

  const summary = useMemo(() => buildPlannerSummary(form), [form]);

  const summaryRange = summary.range
    ? `${formatEuro(summary.range.min, locale)} - ${formatEuro(summary.range.max, locale)}`
    : null;
  const infoCopy = {
    content:
      locale === "nl"
        ? "Content betekent de tekst, beelden, productinformatie of andere inhoud die op de website moet komen."
        : "Content means the text, imagery, product information, or other material that needs to go on the website.",
    branding:
      locale === "nl"
        ? "Branding betekent je merkuitstraling, zoals logo, kleuren, typografie en de algemene visuele richting."
        : "Branding means your brand direction, such as logo, colors, typography, and the overall visual identity.",
  } as const;

  function renderInfoButton(key: keyof typeof infoCopy) {
    const isOpen = openInfoKey === key;

    return (
      <button
        type="button"
        onClick={() => setOpenInfoKey((prev) => (prev === key ? null : key))}
        aria-expanded={isOpen}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/16 text-[11px] font-medium text-white/62 transition hover:border-cyan-300/35 hover:text-white"
      >
        !
      </button>
    );
  }

  function renderInfoText(key: keyof typeof infoCopy) {
    const isOpen = openInfoKey === key;

    if (!isOpen) return null;

    return (
      <p className="mt-3 max-w-2xl text-sm leading-7 text-white/52">
        {infoCopy[key]}
      </p>
    );
  }

  function update<K extends keyof PlannerState>(key: K, value: PlannerState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (status !== "idle") setStatus("idle");
    if (formError) setFormError("");
  }

  function clearError(key: PlannerErrorKey) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function getErrorCopy(key: PlannerErrorKey) {
    const nl = {
      projectType: "Kies een projecttype",
      pageCount: "Maak een keuze voordat je doorgaat",
      smartScope: "Kies minimaal een relevante functie",
      webshopProducts: "Maak een keuze voordat je doorgaat",
      customScope: "Kies minimaal een relevante functie",
      launchTimeline: "Maak een keuze voordat je doorgaat",
      contentReady: "Maak een keuze voordat je doorgaat",
      brandingReady: "Maak een keuze voordat je doorgaat",
      priority: "Maak een keuze voordat je doorgaat",
      name: "Vul je naam in",
      email: "Vul een geldig e-mailadres in",
    } satisfies Record<PlannerErrorKey, string>;
    const en = {
      projectType: "Select a project type",
      pageCount: "Make a selection before continuing",
      smartScope: "Select at least one relevant option",
      webshopProducts: "Make a selection before continuing",
      customScope: "Select at least one relevant option",
      launchTimeline: "Make a selection before continuing",
      contentReady: "Make a selection before continuing",
      brandingReady: "Make a selection before continuing",
      priority: "Make a selection before continuing",
      name: "Enter your name",
      email: "Enter a valid email address",
    } satisfies Record<PlannerErrorKey, string>;

    return (locale === "nl" ? nl : en)[key];
  }

  function validateStep(currentStep: number) {
    const errors: Partial<Record<PlannerErrorKey, string>> = {};

    if (currentStep === 0) {
      if (!form.projectType) {
        errors.projectType = getErrorCopy("projectType");
      }
      return errors;
    }

    if (currentStep === 1) {
      if (!form.projectType) {
        errors.projectType = getErrorCopy("projectType");
        return errors;
      }

      if (form.projectType === "starter" || form.projectType === "business") {
        if (!form.pageCount) {
          errors.pageCount = getErrorCopy("pageCount");
        }
      }

      if (form.projectType === "smart") {
        if (
          !form.smartBookingFlow &&
          !form.smartConfirmations &&
          !form.smartPayments &&
          !form.smartMaps &&
          !form.smartCrm &&
          !form.smartAdmin &&
          !form.smartExpandedAdmin &&
          !form.smartReminderAutomation
        ) {
          errors.smartScope = getErrorCopy("smartScope");
        }
      }

      if (form.projectType === "webshop" && !form.webshopProducts) {
        errors.webshopProducts = getErrorCopy("webshopProducts");
      }

      if (form.projectType === "platform") {
        if (
          !form.customLogin &&
          !form.customDashboards &&
          !form.customRoles &&
          !form.customWorkflows &&
          !form.customApi &&
          !form.customReporting &&
          !form.customNotifications &&
          !form.customAppExpansion
        ) {
          errors.customScope = getErrorCopy("customScope");
        }
      }

      return errors;
    }

    if (currentStep === 2) {
      if (!form.launchTimeline) {
        errors.launchTimeline = getErrorCopy("launchTimeline");
      }
      if (!form.contentReady) {
        errors.contentReady = getErrorCopy("contentReady");
      }
      if (!form.brandingReady) {
        errors.brandingReady = getErrorCopy("brandingReady");
      }
      if (!form.priority) {
        errors.priority = getErrorCopy("priority");
      }
      return errors;
    }

    if (currentStep === 3) {
      if (form.name.trim().length < 2) {
        errors.name = getErrorCopy("name");
      }

      if (!form.email.trim() || !isValidEmail(form.email.trim())) {
        errors.email = getErrorCopy("email");
      }
    }

    return errors;
  }

  function handleNext() {
    const errors = validateStep(step);
    setFieldErrors((prev) => ({ ...prev, ...errors }));

    if (Object.keys(errors).length > 0) {
      setStatus("error");
      setFormError(
        locale === "nl"
          ? "Controleer deze stap en vul de ontbrekende keuzes aan."
          : "Check this step and complete the missing choices.",
      );
      return;
    }

    setStatus("idle");
    setFormError("");
    setStep((prev) => Math.min(prev + 1, 3));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateStep(3);
    setFieldErrors((prev) => ({ ...prev, ...errors }));

    if (Object.keys(errors).length > 0 || isSubmitting) {
      setStatus("error");
      setFormError(
        locale === "nl"
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
        body: JSON.stringify({
          mode: "project_planner",
          locale,
          name: form.name,
          email: form.email,
          company: form.company,
          phone: form.phone,
          website: form.website,
          message: form.notes || summary.reason,
          planner: {
            projectTypeKey: form.projectType || "",
            selectedProjectType: form.projectType
              ? content.options.projectTypes[form.projectType]
              : "",
            recommendedPackage: summary.recommendedLabel,
            reason: summary.reason,
            startingPrice: formatEuro(summary.startingPrice, locale),
            indicativeRange: summaryRange,
            selectedFeatures: summary.selectedFeatures,
            selectedAddOns: summary.selectedAddOns,
            pageCount: form.pageCount,
            smartScopeSelected: Boolean(
              form.smartBookingFlow ||
                form.smartConfirmations ||
                form.smartPayments ||
                form.smartMaps ||
                form.smartCrm ||
                form.smartAdmin ||
                form.smartExpandedAdmin ||
                form.smartReminderAutomation,
            ),
            webshopProducts: form.webshopProducts,
            customScopeSelected: Boolean(
              form.customLogin ||
                form.customDashboards ||
                form.customRoles ||
                form.customWorkflows ||
                form.customApi ||
                form.customReporting ||
                form.customNotifications ||
                form.customAppExpansion,
            ),
            launchTimelineKey: form.launchTimeline,
            launchTimeline: getTimelineLabel(locale, form.launchTimeline),
            contentReadyKey: form.contentReady,
            contentReady: getReadinessLabel(locale, form.contentReady),
            brandingReadyKey: form.brandingReady,
            brandingReady: getReadinessLabel(locale, form.brandingReady),
            priorityKey: form.priority,
            priority: getPriorityLabel(locale, form.priority),
            notes: form.notes,
          },
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | {
              error?: string;
              fieldErrors?: Partial<Record<PlannerErrorKey, string>>;
            }
          | null;

        if (data?.fieldErrors) {
          setFieldErrors((prev) => ({ ...prev, ...data.fieldErrors }));
        }

        if (data?.error) {
          setFormError(data.error);
        }

        throw new Error("Request failed");
      }

      setStatus("success");
      setForm({ ...initialPlannerState, locale });
      setStep(0);
      setFieldErrors({});
      setFormError("");
      trackEvent({
        name: "contact_form_submit_success",
        category: "project-planner",
        label: "project-planner",
        location: "project-planner",
      });
    } catch {
      setStatus("error");
      setFormError((prev) =>
        prev ||
        (locale === "nl"
          ? "Je aanvraag kon niet worden verzonden. Probeer het opnieuw."
          : "Your request could not be sent. Please try again."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputBase =
    "w-full rounded-[1.15rem] border border-white/14 bg-white/[0.08] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-cyan-400/50 focus:bg-white/[0.1]";
  const labelBase =
    "mb-2 block text-[11px] uppercase tracking-[0.24em] text-white/56";

  return (
    <div className="grid gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-start">
      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.7 }}
        className="space-y-8"
      >
        <ProgressBar labels={content.stepLabels} currentStep={step} />

        <section className="border-t border-white/10 pt-8">
          {step === 0 ? (
            <div className="space-y-6">
              <SectionLabel title={content.questions.projectType} />
              <div className="grid gap-3 sm:grid-cols-2">
                {(Object.keys(content.options.projectTypes) as PlannerPackageKey[]).map(
                  (key) => (
                    <ChoiceButton
                      key={key}
                      active={form.projectType === key}
                      label={content.options.projectTypes[key]}
                      onClick={() => {
                        update("projectType", key);
                        clearError("projectType");
                      }}
                    />
                  ),
                )}
              </div>
              <InlineError id="planner-project-type-error" message={fieldErrors.projectType} />
            </div>
          ) : null}

          {step === 1 && (form.projectType === "starter" || form.projectType === "business") ? (
            <div className="space-y-8">
              <div className="space-y-4">
                <SectionLabel title={content.questions.pageCount} />
                <div className="grid gap-3 sm:grid-cols-3">
                  {Object.entries(content.options.pageCount).map(([value, label]) => (
                    <ChoiceButton
                      key={value}
                      active={form.pageCount === value}
                      label={label}
                      onClick={() => {
                        update("pageCount", value as PlannerState["pageCount"]);
                        clearError("pageCount");
                      }}
                    />
                  ))}
                </div>
                <InlineError id="planner-page-count-error" message={fieldErrors.pageCount} />
              </div>

              <div className="space-y-4">
                <SectionLabel title={content.questions.multilingual} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <ChoiceButton
                    active={!form.multilingual}
                    label={content.options.no}
                    onClick={() => update("multilingual", false)}
                  />
                  <ChoiceButton
                    active={form.multilingual}
                    label={content.options.yes}
                    onClick={() => update("multilingual", true)}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <SectionLabel
                  title={
                    form.projectType === "starter"
                      ? content.questions.starterAddOns
                      : content.questions.businessAddOns
                  }
                />
                <div className="border-t border-white/10">
                  {form.projectType === "starter" ? (
                    <>
                      <ToggleRow
                        checked={form.starterSeoBoost}
                        label={locale === "nl" ? "SEO-boost" : "SEO boost"}
                        onChange={(checked) => update("starterSeoBoost", checked)}
                      />
                      <ToggleRow
                        checked={form.starterMotion}
                        label={
                          locale === "nl"
                            ? "Extra motion / premium animatie"
                            : "Extra motion / premium animation"
                        }
                        onChange={(checked) => update("starterMotion", checked)}
                      />
                    </>
                  ) : (
                    <>
                      <ToggleRow
                        checked={form.businessSeoGrowth}
                        label="SEO Growth"
                        onChange={(checked) => update("businessSeoGrowth", checked)}
                      />
                      <ToggleRow
                        checked={form.businessAdvancedEmail}
                        label={
                          locale === "nl"
                            ? "Geavanceerde e-mailflow"
                            : "Advanced email flow"
                        }
                        onChange={(checked) =>
                          update("businessAdvancedEmail", checked)
                        }
                      />
                      <ToggleRow
                        checked={form.businessAdminLite}
                        label="Admin-lite / content management"
                        onChange={(checked) => update("businessAdminLite", checked)}
                      />
                      <ToggleRow
                        checked={form.businessLightApi}
                        label={
                          locale === "nl"
                            ? "Lichte API-integratie"
                            : "Light API integration"
                        }
                        onChange={(checked) => update("businessLightApi", checked)}
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <SectionLabel
                  title={
                    form.projectType === "starter"
                      ? content.questions.starterUpgrade
                      : content.questions.businessUpgrade
                  }
                />
                <div className="border-t border-white/10">
                  {form.projectType === "starter" ? (
                    <>
                      <ToggleRow
                        checked={form.starterNeedBooking}
                        label={locale === "nl" ? "Booking of reservering" : "Booking or reservation"}
                        onChange={(checked) => update("starterNeedBooking", checked)}
                      />
                      <ToggleRow
                        checked={form.starterNeedAdmin}
                        label={locale === "nl" ? "Admin panel" : "Admin panel"}
                        onChange={(checked) => update("starterNeedAdmin", checked)}
                      />
                      <ToggleRow
                        checked={form.starterNeedAccounts}
                        label={locale === "nl" ? "Login of accounts" : "Login or accounts"}
                        onChange={(checked) => update("starterNeedAccounts", checked)}
                      />
                      <ToggleRow
                        checked={form.starterNeedPayments}
                        label={locale === "nl" ? "Betalingen" : "Payments"}
                        onChange={(checked) => update("starterNeedPayments", checked)}
                      />
                      <ToggleRow
                        checked={form.starterNeedApi}
                        label={locale === "nl" ? "Geavanceerde API-logica" : "Advanced API logic"}
                        onChange={(checked) => update("starterNeedApi", checked)}
                      />
                    </>
                  ) : (
                    <>
                      <ToggleRow
                        checked={form.businessNeedBooking}
                        label={locale === "nl" ? "Bookingflow" : "Booking flow"}
                        onChange={(checked) => update("businessNeedBooking", checked)}
                      />
                      <ToggleRow
                        checked={form.businessNeedDashboard}
                        label={locale === "nl" ? "Dashboards of statusoverzicht" : "Dashboards or status overview"}
                        onChange={(checked) => update("businessNeedDashboard", checked)}
                      />
                      <ToggleRow
                        checked={form.businessNeedPricingLogic}
                        label={locale === "nl" ? "Prijslogica" : "Pricing logic"}
                        onChange={(checked) => update("businessNeedPricingLogic", checked)}
                      />
                      <ToggleRow
                        checked={form.businessNeedStatusHandling}
                        label={locale === "nl" ? "Statushandling" : "Status handling"}
                        onChange={(checked) => update("businessNeedStatusHandling", checked)}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {step === 1 && form.projectType === "smart" ? (
            <div className="space-y-8">
              <SectionLabel title={content.questions.smartScope} />
              <div className="border-t border-white/10">
                <ToggleRow checked={form.smartBookingFlow} label={locale === "nl" ? "Booking of reserveringsflow" : "Booking or reservation flow"} onChange={(checked) => { update("smartBookingFlow", checked); clearError("smartScope"); }} />
                <ToggleRow checked={form.smartConfirmations} label={locale === "nl" ? "Bevestigingen per e-mail" : "Confirmation emails"} onChange={(checked) => { update("smartConfirmations", checked); clearError("smartScope"); }} />
                <ToggleRow checked={form.smartPayments} label={locale === "nl" ? "Betalingen" : "Payments"} onChange={(checked) => { update("smartPayments", checked); clearError("smartScope"); }} />
                <ToggleRow checked={form.smartMaps} label={locale === "nl" ? "Google Maps / Routes / km-pricing" : "Google Maps / Routes / km pricing"} onChange={(checked) => { update("smartMaps", checked); clearError("smartScope"); }} />
                <ToggleRow checked={form.smartCrm} label={locale === "nl" ? "CRM- of kalenderintegratie" : "CRM or calendar integration"} onChange={(checked) => { update("smartCrm", checked); clearError("smartScope"); }} />
                <ToggleRow checked={form.smartAdmin} label={locale === "nl" ? "Admin-omgeving" : "Admin area"} onChange={(checked) => { update("smartAdmin", checked); clearError("smartScope"); }} />
                <ToggleRow checked={form.smartExpandedAdmin} label={locale === "nl" ? "Uitgebreider admin panel" : "Expanded admin panel"} onChange={(checked) => { update("smartExpandedAdmin", checked); clearError("smartScope"); }} />
                <ToggleRow checked={form.smartReminderAutomation} label={locale === "nl" ? "Reminder e-mails / automatisering" : "Reminder emails / automation"} onChange={(checked) => { update("smartReminderAutomation", checked); clearError("smartScope"); }} />
              </div>
              <InlineError id="planner-smart-scope-error" message={fieldErrors.smartScope} />

              <div className="space-y-4">
                <SectionLabel title={content.questions.smartUpgrade} />
                <div className="border-t border-white/10">
                  <ToggleRow checked={form.smartNeedRoles} label={locale === "nl" ? "Meerdere gebruikersrollen" : "Multiple user roles"} onChange={(checked) => update("smartNeedRoles", checked)} />
                  <ToggleRow checked={form.smartNeedDashboards} label={locale === "nl" ? "Dashboardsystemen" : "Dashboard systems"} onChange={(checked) => update("smartNeedDashboards", checked)} />
                  <ToggleRow checked={form.smartNeedPlatformLogic} label={locale === "nl" ? "Platformlogica" : "Platform logic"} onChange={(checked) => update("smartNeedPlatformLogic", checked)} />
                  <ToggleRow checked={form.smartNeedWorkflows} label={locale === "nl" ? "Bredere workflows" : "Broader workflows"} onChange={(checked) => update("smartNeedWorkflows", checked)} />
                </div>
              </div>
            </div>
          ) : null}

          {step === 1 && form.projectType === "webshop" ? (
            <div className="space-y-8">
              <div className="space-y-4">
                <SectionLabel title={locale === "nl" ? "Hoeveel producten ongeveer?" : "How many products approximately?"} />
                <div className="grid gap-3 sm:grid-cols-3">
                  {Object.entries(content.options.productCount).map(([value, label]) => (
                    <ChoiceButton
                      key={value}
                      active={form.webshopProducts === value}
                      label={label}
                      onClick={() => {
                        update("webshopProducts", value as PlannerState["webshopProducts"]);
                        clearError("webshopProducts");
                      }}
                    />
                  ))}
                </div>
                <InlineError
                  id="planner-webshop-products-error"
                  message={fieldErrors.webshopProducts}
                />
              </div>

              <div className="space-y-4">
                <SectionLabel title={content.questions.webshopScope} />
                <div className="border-t border-white/10">
                  <ToggleRow checked={form.webshopSubscriptions} label="Subscriptions / memberships" onChange={(checked) => update("webshopSubscriptions", checked)} />
                  <ToggleRow checked={form.webshopFilters} label={locale === "nl" ? "Geavanceerde filters / search" : "Advanced filters / search"} onChange={(checked) => update("webshopFilters", checked)} />
                  <ToggleRow checked={form.webshopIntegrations} label={locale === "nl" ? "CRM / ERP / boekhoudintegratie" : "CRM / ERP / accounting integration"} onChange={(checked) => update("webshopIntegrations", checked)} />
                  <ToggleRow checked={form.webshopMultilingual} label={locale === "nl" ? "Meertalige ondersteuning" : "Multilingual support"} onChange={(checked) => update("webshopMultilingual", checked)} />
                  <ToggleRow checked={form.webshopSeo} label={locale === "nl" ? "Geavanceerde SEO voor producten / categorieën" : "Advanced SEO for products / categories"} onChange={(checked) => update("webshopSeo", checked)} />
                </div>
              </div>

              <div className="space-y-4">
                <SectionLabel title={content.questions.webshopUpgrade} />
                <div className="border-t border-white/10">
                  <ToggleRow checked={form.webshopNeedAccountLogic} label={locale === "nl" ? "Accountlogica buiten standaard webshop" : "Account logic beyond a standard webshop"} onChange={(checked) => update("webshopNeedAccountLogic", checked)} />
                  <ToggleRow checked={form.webshopNeedWorkflowLogic} label={locale === "nl" ? "Diepere workflow- of portaalfunctionaliteit" : "Deeper workflow or portal functionality"} onChange={(checked) => update("webshopNeedWorkflowLogic", checked)} />
                </div>
              </div>
            </div>
          ) : null}

          {step === 1 && form.projectType === "platform" ? (
            <div className="space-y-4">
              <SectionLabel title={content.questions.customScope} />
              <div className="border-t border-white/10">
                <ToggleRow checked={form.customLogin} label={locale === "nl" ? "Login of accounts" : "Login or accounts"} onChange={(checked) => { update("customLogin", checked); clearError("customScope"); }} />
                <ToggleRow checked={form.customDashboards} label={locale === "nl" ? "Dashboard(s)" : "Dashboard(s)"} onChange={(checked) => { update("customDashboards", checked); clearError("customScope"); }} />
                <ToggleRow checked={form.customRoles} label={locale === "nl" ? "Gebruikersrollen en rechten" : "User roles and permissions"} onChange={(checked) => { update("customRoles", checked); clearError("customScope"); }} />
                <ToggleRow checked={form.customWorkflows} label={locale === "nl" ? "Adminworkflows" : "Admin workflows"} onChange={(checked) => { update("customWorkflows", checked); clearError("customScope"); }} />
                <ToggleRow checked={form.customApi} label={locale === "nl" ? "API-integraties" : "API integrations"} onChange={(checked) => { update("customApi", checked); clearError("customScope"); }} />
                <ToggleRow checked={form.customReporting} label={locale === "nl" ? "Reporting / analytics" : "Reporting / analytics"} onChange={(checked) => { update("customReporting", checked); clearError("customScope"); }} />
                <ToggleRow checked={form.customNotifications} label={locale === "nl" ? "Notificatiesysteem" : "Notification system"} onChange={(checked) => { update("customNotifications", checked); clearError("customScope"); }} />
                <ToggleRow checked={form.customAppExpansion} label={locale === "nl" ? "App-uitbreiding later" : "App expansion later"} onChange={(checked) => { update("customAppExpansion", checked); clearError("customScope"); }} />
              </div>
              <InlineError id="planner-custom-scope-error" message={fieldErrors.customScope} />
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-8">
              <div className="space-y-4">
                <SectionLabel title={content.questions.timeline} />
                <div className="grid gap-3 sm:grid-cols-2">
                  {(Object.keys(content.options.timeline) as Exclude<PlannerTimeline, "">[]).map(
                    (value) => (
                      <ChoiceButton
                        key={value}
                        active={form.launchTimeline === value}
                        label={content.options.timeline[value]}
                        onClick={() => {
                          update("launchTimeline", value);
                          clearError("launchTimeline");
                        }}
                      />
                    ),
                  )}
                </div>
                <InlineError
                  id="planner-launch-timeline-error"
                  message={fieldErrors.launchTimeline}
                />
              </div>

              <div className="space-y-4">
                <SectionLabel
                  title={content.questions.contentReady}
                  trailing={renderInfoButton("content")}
                  expandedInfo={renderInfoText("content")}
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  {(["yes", "partly", "no"] as PlannerReadiness[]).map((value) => (
                    <ChoiceButton
                      key={value}
                      active={form.contentReady === value}
                      label={getReadinessLabel(locale, value)}
                      onClick={() => {
                        update("contentReady", value);
                        clearError("contentReady");
                      }}
                    />
                  ))}
                </div>
                <InlineError id="planner-content-ready-error" message={fieldErrors.contentReady} />
              </div>

              <div className="space-y-4">
                <SectionLabel
                  title={content.questions.brandingReady}
                  trailing={renderInfoButton("branding")}
                  expandedInfo={renderInfoText("branding")}
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  {(["yes", "partly", "no"] as PlannerReadiness[]).map((value) => (
                    <ChoiceButton
                      key={value}
                      active={form.brandingReady === value}
                      label={getReadinessLabel(locale, value)}
                      onClick={() => {
                        update("brandingReady", value);
                        clearError("brandingReady");
                      }}
                    />
                  ))}
                </div>
                <InlineError
                  id="planner-branding-ready-error"
                  message={fieldErrors.brandingReady}
                />
              </div>

              <div className="space-y-4">
                <SectionLabel title={content.questions.priority} />
                <div className="grid gap-3 sm:grid-cols-2">
                  {(Object.keys(content.options.priority) as Exclude<PlannerPriority, "">[]).map(
                    (value) => (
                      <ChoiceButton
                        key={value}
                        active={form.priority === value}
                        label={content.options.priority[value]}
                        onClick={() => {
                          update("priority", value);
                          clearError("priority");
                        }}
                      />
                    ),
                  )}
                </div>
                <InlineError id="planner-priority-error" message={fieldErrors.priority} />
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-6">
              <SectionLabel title={content.questions.contactHeading} />

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="planner-name" className={labelBase}>
                    {content.fields.name}
                  </label>
                  <input
                    id="planner-name"
                    value={form.name}
                    onChange={(e) => {
                      update("name", e.target.value);
                      clearError("name");
                    }}
                    placeholder={content.fields.placeholders.name}
                    className={`${inputBase} ${fieldErrors.name ? "border-red-300/55 bg-red-400/[0.06] focus:border-red-300/65" : ""}`}
                    autoComplete="name"
                    aria-invalid={Boolean(fieldErrors.name)}
                    aria-describedby={fieldErrors.name ? "planner-name-error" : undefined}
                  />
                  <InlineError id="planner-name-error" message={fieldErrors.name} />
                </div>
                <div>
                  <label htmlFor="planner-email" className={labelBase}>
                    {content.fields.email}
                  </label>
                  <input
                    id="planner-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => {
                      update("email", e.target.value);
                      clearError("email");
                    }}
                    placeholder={content.fields.placeholders.email}
                    className={`${inputBase} ${fieldErrors.email ? "border-red-300/55 bg-red-400/[0.06] focus:border-red-300/65" : ""}`}
                    autoComplete="email"
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? "planner-email-error" : undefined}
                  />
                  <InlineError id="planner-email-error" message={fieldErrors.email} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="planner-company" className={labelBase}>
                    {content.fields.company}
                  </label>
                  <input
                    id="planner-company"
                    value={form.company}
                    onChange={(e) => update("company", e.target.value)}
                    placeholder={content.fields.placeholders.company}
                    className={inputBase}
                    autoComplete="organization"
                  />
                </div>
                <div>
                  <label htmlFor="planner-phone" className={labelBase}>
                    {content.fields.phone}
                  </label>
                  <input
                    id="planner-phone"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    placeholder={content.fields.placeholders.phone}
                    className={inputBase}
                    autoComplete="tel"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="planner-notes" className={labelBase}>
                  {content.questions.notes}
                </label>
                <textarea
                  id="planner-notes"
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  placeholder={content.fields.placeholders.notes}
                  className={`${inputBase} min-h-[160px] resize-none`}
                />
              </div>

              <div className="hidden">
                <label htmlFor="planner-website">Website</label>
                <input
                  id="planner-website"
                  value={form.website}
                  onChange={(e) => update("website", e.target.value)}
                />
              </div>
            </div>
          ) : null}
        </section>

        <div className="flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setStatus("idle");
                setFormError("");
                setStep((prev) => Math.max(prev - 1, 0));
              }}
              disabled={step === 0}
              className="rounded-full border border-white/12 px-5 py-3 text-sm text-white/74 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              {content.backLabel}
            </button>

            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                className="rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:opacity-90"
              >
                {content.nextLabel}
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isSubmitting ? content.submittingLabel : content.submitLabel}
              </button>
            )}
          </div>

          <div className="min-h-[24px] text-sm text-white/72">
            {status === "success" ? (
              <span className="text-cyan-300/85">{content.successMessage}</span>
            ) : null}
            {status === "error" ? (
              <span className="text-red-300/85">{formError || content.errorMessage}</span>
            ) : null}
          </div>
        </div>
      </motion.form>

      <aside className="lg:sticky lg:top-28">
        <div className="border-t border-white/10 pt-6 lg:pt-8">
          <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/74">
            {content.summary.eyebrow}
          </p>
          <h2 className="mt-4 text-3xl font-semibold text-white">
            {content.summary.title}
          </h2>

          <div className="mt-8 space-y-6">
            <div className="border-b border-white/8 pb-5">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/36">
                {content.summary.recommendedLabel}
              </p>
              <p className="mt-3 text-2xl font-semibold text-white">
                {summary.recommendedLabel}
              </p>
            </div>

            <div className="border-b border-white/8 pb-5">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/36">
                {content.summary.priceLabel}
              </p>
              <p className="mt-3 text-xl font-medium text-white">
                {formatEuro(summary.startingPrice, locale)}
              </p>
              {summaryRange ? (
                <p className="mt-3 text-sm text-white/54">
                  {content.summary.rangeLabel}: {summaryRange}
                </p>
              ) : null}
            </div>

            <div className="border-b border-white/8 pb-5">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/36">
                {content.summary.reasonLabel}
              </p>
              <p className="mt-3 text-sm leading-7 text-white/64">
                {summary.reason}
              </p>
            </div>

            <div className="border-b border-white/8 pb-5">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/36">
                {content.summary.selectedFeaturesLabel}
              </p>
              {summary.selectedFeatures.length > 0 ? (
                <ul className="mt-3 space-y-3">
                  {summary.selectedFeatures.map((item) => (
                    <li key={item} className="text-sm leading-7 text-white/64">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm leading-7 text-white/42">
                  {locale === "nl"
                    ? "Nog geen extra scope geselecteerd."
                    : "No additional scope selected yet."}
                </p>
              )}
            </div>

            <div className="border-b border-white/8 pb-5">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/36">
                {content.summary.selectedAddOnsLabel}
              </p>
              {summary.selectedAddOns.length > 0 ? (
                <ul className="mt-3 space-y-3">
                  {summary.selectedAddOns.map((item) => (
                    <li key={item} className="text-sm leading-7 text-white/64">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm leading-7 text-white/42">
                  {locale === "nl"
                    ? "Nog geen relevante add-ons."
                    : "No relevant add-ons yet."}
                </p>
              )}
            </div>

            <p className="text-sm leading-7 text-white/44">
              {summary.disclaimer}
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
