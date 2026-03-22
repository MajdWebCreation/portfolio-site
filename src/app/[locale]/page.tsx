import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ContactPanel from "@/components/contact-panel";
import JsonLd from "@/components/json-ld";
import ProcessBlock from "@/components/process-block";
import RevealSection from "@/components/reveal-section";
import SectionHeading from "@/components/section-heading";
import ServiceCard from "@/components/service-card";
import SiteFooter from "@/components/site-footer";
import SiteShell from "@/components/site-shell";
import { getLocalizedPath } from "@/lib/content/routes";
import { getServicesForLocale } from "@/lib/content/services";
import {
  isValidLocale,
  processSteps,
  siteContent,
} from "@/lib/content/site-content";
import { getCanonicalUrl, getHomeMetadata } from "@/lib/seo";
import { organizationSchema, websiteSchema, webPageSchema } from "@/lib/schema";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (!isValidLocale(locale)) {
    return {};
  }

  return getHomeMetadata(locale);
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  const content = siteContent[locale];
  const services = getServicesForLocale(locale);
  const projects = content.projects;
  const pageUrl = getCanonicalUrl(getLocalizedPath(locale, "home"));

  return (
    <>
      <JsonLd
        data={[
          organizationSchema(),
          websiteSchema(),
          webPageSchema({
            name:
              locale === "nl"
                ? "YM Creations homepagina"
                : "YM Creations homepage",
            description: content.hero.description,
            url: pageUrl,
          }),
        ]}
      />

      <SiteShell locale={locale} content={content}>
        <section className="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-7xl items-center px-4 pb-16 pt-10 sm:px-6 sm:pb-20 lg:px-10">
          <div className="grid w-full gap-12 lg:grid-cols-[1.12fr_0.88fr] lg:items-center">
            <div>
              <p className="mb-5 text-[11px] uppercase tracking-[0.3em] text-cyan-300/80 sm:text-sm">
                {content.hero.eyebrow}
              </p>
              <h1 className="max-w-5xl text-[3rem] font-semibold leading-[0.98] text-white sm:text-6xl lg:text-7xl">
                {content.hero.title}
              </h1>
              <p className="mt-6 max-w-3xl text-base leading-8 text-white/65 sm:text-lg">
                {content.hero.description}
              </p>
              <div className="mt-8 flex flex-wrap gap-3 sm:gap-4">
                <Link
                  href={content.hero.servicePath}
                  className="rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:opacity-90"
                >
                  {content.hero.primaryCta}
                </Link>
                <Link
                  href={content.hero.contactPath}
                  className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white transition hover:border-cyan-400/50 hover:bg-white/10"
                >
                  {content.hero.secondaryCta}
                </Link>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 rounded-[2rem] bg-cyan-400/10 blur-3xl" />
              <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-[0_0_80px_rgba(34,211,238,0.08)] backdrop-blur-md">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <span className="text-xs uppercase tracking-[0.25em] text-white/40">
                    {content.hero.blueprintLabel}
                  </span>
                  <div className="flex gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                    <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                    <span className="h-2.5 w-2.5 rounded-full bg-cyan-400/80" />
                  </div>
                </div>

                <div className="mt-6 grid gap-4">
                  {services.slice(0, 4).map((service) => (
                    <Link
                      key={service.path}
                      href={service.path}
                      className="rounded-[1.4rem] border border-white/10 bg-black/35 p-4 transition hover:border-cyan-300/25 hover:bg-black/45"
                    >
                      <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/70">
                        {service.icon}
                      </p>
                      <h2 className="mt-3 text-lg font-medium text-white">
                        {service.navLabel}
                      </h2>
                      <p className="mt-2 text-sm leading-7 text-white/62">
                        {service.intro}
                      </p>
                    </Link>
                  ))}

                  <div className="rounded-[1.4rem] border border-white/10 bg-black/60 p-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-cyan-300/70">
                      {content.hero.cardEyebrow}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-white/68">
                      {content.hero.cardText}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-10">
          <RevealSection>
            <SectionHeading
              eyebrow={content.homeServices.eyebrow}
              title={content.homeServices.title}
              description={content.homeServices.description}
            />
          </RevealSection>
          <div className="mt-12 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {services.map((service, index) => (
              <RevealSection key={service.path} delay={index * 0.04}>
                <ServiceCard service={service} />
              </RevealSection>
            ))}
          </div>
          <div className="mt-10">
            <Link
              href={getLocalizedPath(locale, "services")}
              className="inline-flex rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white transition hover:border-cyan-400/50 hover:bg-white/10"
            >
              {content.homeServices.allServicesLabel}
            </Link>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-10">
          <div className="grid gap-14 lg:grid-cols-[1fr_0.95fr] lg:items-start">
            <RevealSection>
              <SectionHeading
                eyebrow={projects.eyebrow}
                title={projects.title}
                description={projects.description}
              />
            </RevealSection>

            <RevealSection delay={0.08}>
              <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] backdrop-blur">
                <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                  <span className="text-xs uppercase tracking-[0.28em] text-cyan-300/70">
                    {projects.itemTitle}
                  </span>
                  <span className="text-xs uppercase tracking-[0.22em] text-white/35">
                    {projects.conceptLabel}
                  </span>
                </div>

                <div className="grid gap-0 lg:grid-cols-[1.08fr_0.92fr]">
                  <div className="relative min-h-[360px] overflow-hidden border-b border-white/10 bg-black/35 lg:border-b-0 lg:border-r">
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:34px_34px]" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_20%,rgba(34,211,238,0.16),transparent_34%)]" />
                    <div className="absolute left-[12%] top-[16%] h-20 w-48 rounded-2xl border border-cyan-300/30 bg-cyan-400/8" />
                    <div className="absolute right-[14%] top-[22%] h-28 w-28 rounded-full border border-white/12" />
                    <div className="absolute bottom-[14%] left-[12%] right-[12%] rounded-[1.4rem] border border-white/10 bg-black/50 p-5 backdrop-blur">
                      <p className="text-xs uppercase tracking-[0.22em] text-cyan-300/70">
                        {projects.refinedDirectionLabel}
                      </p>
                      <p className="mt-3 text-sm leading-7 text-white/70">
                        {projects.itemText}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col justify-between p-6">
                    <div>
                      <p className="text-xs uppercase tracking-[0.28em] text-white/35">
                        {projects.progressLabel}
                      </p>
                      <div className="mt-5 space-y-4">
                        {projects.stages.map((stage, index) => (
                          <div key={stage} className="flex items-center gap-4">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-400/25 bg-cyan-400/8 text-xs text-cyan-200">
                              {index + 1}
                            </div>
                            <span className="text-sm uppercase tracking-[0.2em] text-white/75">
                              {stage}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-6 rounded-[1.4rem] border border-white/10 bg-black/30 p-5">
                      <p className="text-xs uppercase tracking-[0.22em] text-cyan-300/70">
                        {projects.premiumBuildLabel}
                      </p>
                      <p className="mt-3 text-sm leading-7 text-white/65">
                        {projects.premiumBuildText}
                      </p>
                      <Link
                        href={projects.overviewPath}
                        className="mt-5 inline-flex rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition hover:border-cyan-400/50 hover:bg-white/10"
                      >
                        {projects.overviewLabel}
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </RevealSection>
          </div>
        </section>

        <section
          id="process"
          className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-10"
        >
          <div className="grid gap-14 lg:grid-cols-[0.8fr_1.2fr]">
            <RevealSection>
              <SectionHeading
                eyebrow={content.about.eyebrow}
                title={content.about.title}
                description={content.about.description}
              />
            </RevealSection>
            <RevealSection delay={0.08}>
              <ProcessBlock
                title={locale === "nl" ? "Hoe het traject meestal verloopt" : "How the process usually works"}
                steps={processSteps[locale]}
              />
            </RevealSection>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-10">
          <ContactPanel
            locale={locale}
            content={content.contact}
            footer={content.footer}
          />
        </section>

        <SiteFooter locale={locale} content={content.footer} />
      </SiteShell>
    </>
  );
}
