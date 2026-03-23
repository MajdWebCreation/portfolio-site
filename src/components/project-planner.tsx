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

function StepRail({
  labels,
  currentStep,
}: {
  labels: string[];
  currentStep: number;
}) {
  return (
    <div className="flex overflow-x-auto border-y border-white/10">
      {labels.map((label, index) => {
        const active = currentStep === index;
        const complete = currentStep > index;

        return (
          <div
            key={label}
            className="min-w-[180px] border-r border-white/10 px-4 py-4 last:border-r-0"
          >
            <p
              className={`text-[10px] uppercase tracking-[0.24em] ${
                active || complete ? "text-cyan-300/76" : "text-white/32"
              }`}
            >
              {String(index + 1).padStart(2, "0")}
            </p>
            <p className={`mt-2 text-sm ${active ? "text-white" : "text-white/56"}`}>
              {label}
            </p>
          </div>
        );
      })}
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
}: {
  title: string;
  support?: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.26em] text-cyan-300/74">
        {title}
      </p>
      {support ? (
        <p className="mt-3 max-w-2xl text-sm leading-7 text-white/48">
          {support}
        </p>
      ) : null}
    </div>
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
  const [form, setForm] = useState<PlannerState>({
    ...initialPlannerState,
    locale,
  });

  const summary = useMemo(() => buildPlannerSummary(form), [form]);

  const summaryRange = summary.range
    ? `${formatEuro(summary.range.min, locale)} - ${formatEuro(summary.range.max, locale)}`
    : null;

  function update<K extends keyof PlannerState>(key: K, value: PlannerState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (status !== "idle") setStatus("idle");
  }

  function isStepValid(currentStep: number) {
    if (currentStep === 0) {
      return Boolean(form.projectType);
    }

    if (currentStep === 1) {
      if (!form.projectType) return false;

      if (form.projectType === "starter" || form.projectType === "business") {
        return Boolean(form.pageCount && form.brandingContentState);
      }

      if (form.projectType === "smart") {
        return (
          form.smartBookingFlow ||
          form.smartConfirmations ||
          form.smartPayments ||
          form.smartMaps ||
          form.smartCrm ||
          form.smartAdmin ||
          form.smartExpandedAdmin ||
          form.smartReminderAutomation
        );
      }

      if (form.projectType === "webshop") {
        return Boolean(form.webshopProducts);
      }

      if (form.projectType === "platform") {
        return (
          form.customLogin ||
          form.customDashboards ||
          form.customRoles ||
          form.customWorkflows ||
          form.customApi ||
          form.customReporting ||
          form.customNotifications ||
          form.customAppExpansion
        );
      }
    }

    if (currentStep === 2) {
      return Boolean(
        form.launchTimeline && form.contentReady && form.brandingReady && form.priority,
      );
    }

    if (currentStep === 3) {
      return form.name.trim().length >= 2 && form.email.trim().length >= 5;
    }

    return false;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isStepValid(3) || isSubmitting) return;

    setIsSubmitting(true);
    setStatus("idle");

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
            selectedProjectType: form.projectType
              ? content.options.projectTypes[form.projectType]
              : "",
            recommendedPackage: summary.recommendedLabel,
            reason: summary.reason,
            startingPrice: formatEuro(summary.startingPrice, locale),
            indicativeRange: summaryRange,
            selectedFeatures: summary.selectedFeatures,
            selectedAddOns: summary.selectedAddOns,
            launchTimeline: getTimelineLabel(locale, form.launchTimeline),
            contentReady: getReadinessLabel(locale, form.contentReady),
            brandingReady: getReadinessLabel(locale, form.brandingReady),
            priority: getPriorityLabel(locale, form.priority),
            notes: form.notes,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Request failed");
      }

      setStatus("success");
      setForm({ ...initialPlannerState, locale });
      setStep(0);
      trackEvent({
        name: "contact_form_submit_success",
        category: "project-planner",
        label: "project-planner",
        location: "project-planner",
      });
    } catch {
      setStatus("error");
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
        <StepRail labels={content.stepLabels} currentStep={step} />

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
                      onClick={() => update("projectType", key)}
                    />
                  ),
                )}
              </div>
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
                      onClick={() => update("pageCount", value as PlannerState["pageCount"])}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <SectionLabel
                  title={content.questions.multilingual}
                  support={content.questions.brandingContentSupport}
                />
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
                <SectionLabel title={content.questions.brandingContentState} />
                <div className="grid gap-3 sm:grid-cols-3">
                  {(["yes", "partly", "no"] as PlannerReadiness[]).map((value) => (
                    <ChoiceButton
                      key={value}
                      active={form.brandingContentState === value}
                      label={getReadinessLabel(locale, value)}
                      onClick={() => update("brandingContentState", value)}
                    />
                  ))}
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
                <ToggleRow checked={form.smartBookingFlow} label={locale === "nl" ? "Booking of reserveringsflow" : "Booking or reservation flow"} onChange={(checked) => update("smartBookingFlow", checked)} />
                <ToggleRow checked={form.smartConfirmations} label={locale === "nl" ? "Bevestigingen per e-mail" : "Confirmation emails"} onChange={(checked) => update("smartConfirmations", checked)} />
                <ToggleRow checked={form.smartPayments} label={locale === "nl" ? "Betalingen" : "Payments"} onChange={(checked) => update("smartPayments", checked)} />
                <ToggleRow checked={form.smartMaps} label={locale === "nl" ? "Google Maps / Routes / km-pricing" : "Google Maps / Routes / km pricing"} onChange={(checked) => update("smartMaps", checked)} />
                <ToggleRow checked={form.smartCrm} label={locale === "nl" ? "CRM- of kalenderintegratie" : "CRM or calendar integration"} onChange={(checked) => update("smartCrm", checked)} />
                <ToggleRow checked={form.smartAdmin} label={locale === "nl" ? "Admin-omgeving" : "Admin area"} onChange={(checked) => update("smartAdmin", checked)} />
                <ToggleRow checked={form.smartExpandedAdmin} label={locale === "nl" ? "Uitgebreider admin panel" : "Expanded admin panel"} onChange={(checked) => update("smartExpandedAdmin", checked)} />
                <ToggleRow checked={form.smartReminderAutomation} label={locale === "nl" ? "Reminder e-mails / automatisering" : "Reminder emails / automation"} onChange={(checked) => update("smartReminderAutomation", checked)} />
              </div>

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
                      onClick={() => update("webshopProducts", value as PlannerState["webshopProducts"])}
                    />
                  ))}
                </div>
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
                <ToggleRow checked={form.customLogin} label={locale === "nl" ? "Login of accounts" : "Login or accounts"} onChange={(checked) => update("customLogin", checked)} />
                <ToggleRow checked={form.customDashboards} label={locale === "nl" ? "Dashboard(s)" : "Dashboard(s)"} onChange={(checked) => update("customDashboards", checked)} />
                <ToggleRow checked={form.customRoles} label={locale === "nl" ? "Gebruikersrollen en rechten" : "User roles and permissions"} onChange={(checked) => update("customRoles", checked)} />
                <ToggleRow checked={form.customWorkflows} label={locale === "nl" ? "Adminworkflows" : "Admin workflows"} onChange={(checked) => update("customWorkflows", checked)} />
                <ToggleRow checked={form.customApi} label={locale === "nl" ? "API-integraties" : "API integrations"} onChange={(checked) => update("customApi", checked)} />
                <ToggleRow checked={form.customReporting} label={locale === "nl" ? "Reporting / analytics" : "Reporting / analytics"} onChange={(checked) => update("customReporting", checked)} />
                <ToggleRow checked={form.customNotifications} label={locale === "nl" ? "Notificatiesysteem" : "Notification system"} onChange={(checked) => update("customNotifications", checked)} />
                <ToggleRow checked={form.customAppExpansion} label={locale === "nl" ? "App-uitbreiding later" : "App expansion later"} onChange={(checked) => update("customAppExpansion", checked)} />
              </div>
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
                        onClick={() => update("launchTimeline", value)}
                      />
                    ),
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <SectionLabel title={content.questions.contentReady} />
                <div className="grid gap-3 sm:grid-cols-3">
                  {(["yes", "partly", "no"] as PlannerReadiness[]).map((value) => (
                    <ChoiceButton
                      key={value}
                      active={form.contentReady === value}
                      label={getReadinessLabel(locale, value)}
                      onClick={() => update("contentReady", value)}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <SectionLabel title={content.questions.brandingReady} />
                <div className="grid gap-3 sm:grid-cols-3">
                  {(["yes", "partly", "no"] as PlannerReadiness[]).map((value) => (
                    <ChoiceButton
                      key={value}
                      active={form.brandingReady === value}
                      label={getReadinessLabel(locale, value)}
                      onClick={() => update("brandingReady", value)}
                    />
                  ))}
                </div>
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
                        onClick={() => update("priority", value)}
                      />
                    ),
                  )}
                </div>
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
                    onChange={(e) => update("name", e.target.value)}
                    placeholder={content.fields.placeholders.name}
                    className={inputBase}
                    autoComplete="name"
                  />
                </div>
                <div>
                  <label htmlFor="planner-email" className={labelBase}>
                    {content.fields.email}
                  </label>
                  <input
                    id="planner-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    placeholder={content.fields.placeholders.email}
                    className={inputBase}
                    autoComplete="email"
                  />
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
              onClick={() => setStep((prev) => Math.max(prev - 1, 0))}
              disabled={step === 0}
              className="rounded-full border border-white/12 px-5 py-3 text-sm text-white/74 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              {content.backLabel}
            </button>

            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep((prev) => Math.min(prev + 1, 3))}
                disabled={!isStepValid(step)}
                className="rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {content.nextLabel}
              </button>
            ) : (
              <button
                type="submit"
                disabled={!isStepValid(3) || isSubmitting}
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
              <span className="text-red-300/85">{content.errorMessage}</span>
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
