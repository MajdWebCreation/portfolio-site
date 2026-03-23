import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/json-ld";
import RevealSection from "@/components/reveal-section";
import ServiceCard from "@/components/service-card";
import SiteFooter from "@/components/site-footer";
import SiteShell from "@/components/site-shell";
import { getLocalizedPath, getRouteAlternates } from "@/lib/content/routes";
import {
  getServicesForLocale,
  serviceCollectionSchemaDescription,
  servicesOverviewContent,
} from "@/lib/content/services";
import { buildMetadata, getCanonicalUrl } from "@/lib/seo";
import { webPageSchema } from "@/lib/schema";
import { isValidLocale, siteContent, type Locale } from "@/lib/content/site-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (locale !== "en") {
    return {};
  }

  return buildMetadata({
    locale: "en",
    pathname: "/en/services",
    title: servicesOverviewContent.en.metaTitle,
    description: servicesOverviewContent.en.metaDescription,
    alternates: getRouteAlternates("services"),
  });
}

export async function generateStaticParams() {
  return [{ locale: "en" }];
}

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (locale !== "en" || !isValidLocale(locale)) {
    notFound();
  }

  return <ServicesPageContent locale={locale} />;
}

export function ServicesPageContent({ locale }: { locale: Locale }) {
  const content = siteContent[locale];
  const overview = servicesOverviewContent[locale];
  const services = getServicesForLocale(locale);
  const path = locale === "nl" ? "/nl/diensten" : "/en/services";
  const featuredService = services[0];
  const supportingServices = services.slice(1, 3);
  const additionalServices = services.slice(3);
  const additionalLayout = [
    "max-w-[44rem]",
    "ml-auto max-w-[35rem]",
    "max-w-[40rem] md:ml-[7%]",
  ];

  return (
    <>
      <JsonLd
        data={webPageSchema({
          name: overview.metaTitle,
          description: serviceCollectionSchemaDescription[locale],
          url: getCanonicalUrl(path),
        })}
      />
      <SiteShell locale={locale} content={content} currentPath={path}>
        <section className="relative mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-10 lg:py-20">
          <div className="ym-bg-curve ym-bg-breathe pointer-events-none absolute inset-x-[-6%] inset-y-0 opacity-[0.48]" />

          <div className="relative grid gap-14 lg:grid-cols-[1.03fr_0.97fr] lg:items-start">
            <RevealSection>
              <div className="mx-auto max-w-[22rem] text-center sm:max-w-[34rem] lg:mx-0 lg:max-w-3xl lg:text-left">
                <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/72">
                  {overview.eyebrow}
                </p>
                <h1 className="mt-5 text-balance text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
                  {overview.title}
                </h1>
                <p className="mt-6 max-w-2xl text-base leading-8 text-white/62 sm:text-lg">
                  {overview.intro}
                </p>

                <div className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-3 lg:justify-start">
                  <Link
                    href={getLocalizedPath(locale, "projects")}
                    data-track-event="primary_cta_click"
                    data-track-category="services-overview"
                    data-track-label={locale === "nl" ? "Projecten" : "Projects"}
                    data-track-location="services-hero-links"
                    className="text-sm text-white/56 transition hover:text-white"
                  >
                    {locale === "nl" ? "Bekijk projecten" : "View projects"}{" "}
                    <span className="text-cyan-200/65">→</span>
                  </Link>
                  <Link
                    href={getLocalizedPath(locale, "contact")}
                    data-track-event="contact_cta_click"
                    data-track-category="services-overview"
                    data-track-label={locale === "nl" ? "Contact" : "Contact"}
                    data-track-location="services-hero-links"
                    className="text-sm text-white/56 transition hover:text-white"
                  >
                    {locale === "nl" ? "Neem contact op" : "Contact us"}{" "}
                    <span className="text-cyan-200/65">→</span>
                  </Link>
                </div>
              </div>
            </RevealSection>

            <RevealSection delay={0.08}>
              <div className="mx-auto max-w-[44rem] border-t border-white/10 pt-7 lg:mx-0">
                <p className="text-[10px] uppercase tracking-[0.32em] text-cyan-300/76">
                  {overview.whyTitle}
                </p>

                <div className="mt-7 grid gap-6 md:grid-cols-[0.3fr_0.7fr]">
                  <div className="border-b border-white/8 pb-5 md:border-b-0 md:border-r md:border-white/8 md:pb-0 md:pr-6">
                    <p className="text-3xl font-semibold leading-tight tracking-tight text-white">
                      {locale === "nl"
                        ? "Een compacte service stack, met heldere verschillen in scope."
                        : "A compact service stack, with clear differences in scope."}
                    </p>
                  </div>

                  <div className="space-y-5">
                    {overview.whyPoints.map((point, index) => (
                      <div
                        key={point}
                        className="grid gap-3 border-b border-white/8 pb-5 last:border-b-0 last:pb-0 sm:grid-cols-[auto_1fr]"
                      >
                        <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/76">
                          {String(index + 1).padStart(2, "0")}
                        </p>
                        <p className="max-w-2xl text-sm leading-7 text-white/60">
                          {point}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </RevealSection>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          <div className="grid gap-10 xl:grid-cols-[1.18fr_0.82fr] xl:items-start">
            <RevealSection>
              {featuredService ? <ServiceCard service={featuredService} featured /> : null}
            </RevealSection>

            <RevealSection delay={0.06}>
              <div className="border-t border-white/10 pt-7">
                <div className="max-w-md">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/74">
                    {locale === "nl" ? "Ondersteunende richtingen" : "Supporting directions"}
                  </p>
                  <p className="mt-4 text-sm leading-7 text-white/56">
                    {locale === "nl"
                      ? "Niet elk traject vraagt dezelfde schaal. Deze twee richtingen zitten dicht op de kern van veel trajecten."
                      : "Not every project needs the same scale. These two directions sit close to the core of many trajectories."}
                  </p>
                </div>

                <div className="mt-10 space-y-10">
                  {supportingServices.map((service, index) => (
                    <Link
                      key={service.path}
                      href={service.path}
                      data-track-event="service_cta_click"
                      data-track-category="services-overview"
                      data-track-label={service.navLabel}
                      data-track-location="services-supporting-links"
                      className={`group block border-b border-white/8 pb-7 transition last:border-b-0 last:pb-0 ${
                        index === 1 ? "xl:ml-10" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/74">
                          {service.icon}
                        </p>
                        <p className="text-[10px] uppercase tracking-[0.28em] text-white/28">
                          {String(index + 2).padStart(2, "0")}
                        </p>
                      </div>
                      <h2 className="mt-5 max-w-sm text-2xl font-medium leading-tight text-white">
                        {service.navLabel}
                      </h2>
                      <p className="mt-4 max-w-xl text-sm leading-7 text-white/56">
                        {service.intro}
                      </p>
                      <span className="mt-5 inline-flex items-center gap-2 text-sm text-white/66 transition group-hover:text-white">
                        {locale === "nl" ? "Meer details" : "More detail"}
                        <span className="text-cyan-200 transition group-hover:translate-x-1">→</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </RevealSection>
          </div>
        </section>

        <RevealSection delay={0.1}>
          <section className="mx-auto mt-10 w-full max-w-7xl border-t border-white/10 px-4 pt-10 sm:px-6 lg:px-10 lg:pt-14">
            <div className="grid gap-10 lg:grid-cols-[0.32fr_0.68fr]">
              <div className="max-w-sm">
                <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/74">
                  {locale === "nl" ? "Meer richtingen" : "More directions"}
                </p>
                <h2 className="mt-5 text-3xl font-semibold leading-tight text-white">
                  {locale === "nl"
                    ? "Compactere services, voor scherpere specifieke vragen."
                    : "More compact services, for sharper and more specific needs."}
                </h2>
                <p className="mt-5 text-sm leading-7 text-white/54">
                  {locale === "nl"
                    ? "Niet iedere service hoeft dezelfde nadruk te krijgen. Sommige trajecten zijn compacter, maar wel belangrijk in hoe een site of systeem wordt aangescherpt."
                    : "Not every service needs the same emphasis. Some directions are more compact, but still important in how a site or system gets refined."}
                </p>

                <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
                  <Link
                    href={getLocalizedPath(locale, "pricing")}
                    data-track-event="primary_cta_click"
                    data-track-category="services-overview"
                    data-track-label={locale === "nl" ? "Tarieven" : "Pricing"}
                    data-track-location="services-bottom-links"
                    className="text-sm text-white/48 transition hover:text-white"
                  >
                    {locale === "nl"
                      ? "Bekijk instapniveaus en logische uitbreidingen"
                      : "View entry levels and logical upgrades"}{" "}
                    <span className="text-cyan-200/65">→</span>
                  </Link>

                  <Link
                    href={getLocalizedPath(locale, "projectPlanner")}
                    data-track-event="primary_cta_click"
                    data-track-category="services-overview"
                    data-track-label={
                      locale === "nl"
                        ? "Gebruik de Project Planner"
                        : "Use the Project Planner"
                    }
                    data-track-location="services-bottom-links"
                    className="text-sm text-white/48 transition hover:text-white"
                  >
                    {locale === "nl"
                      ? "Hulp nodig bij het kiezen? Gebruik de Project Planner"
                      : "Need help choosing? Use the Project Planner"}{" "}
                    <span className="text-cyan-200/65">→</span>
                  </Link>
                </div>
              </div>

              <div className="space-y-10">
                {additionalServices.map((service, index) => (
                  <RevealSection key={service.path} delay={index * 0.05}>
                    <Link
                      href={service.path}
                      data-track-event="service_cta_click"
                      data-track-category="services-overview"
                      data-track-label={service.navLabel}
                      data-track-location="services-editorial-list"
                      className={`group block border-t border-white/10 pt-5 transition ${additionalLayout[index] ?? "max-w-[42rem]"}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/74">
                            {service.icon}
                          </p>
                          <h3 className="mt-4 text-2xl font-medium leading-tight text-white sm:text-[1.75rem]">
                            {service.navLabel}
                          </h3>
                        </div>
                        <p className="pt-1 text-[10px] uppercase tracking-[0.28em] text-white/26">
                          {String(index + 4).padStart(2, "0")}
                        </p>
                      </div>
                      <p className="mt-4 max-w-2xl text-sm leading-7 text-white/56">
                        {service.intro}
                      </p>
                      <span className="mt-5 inline-flex items-center gap-2 text-sm text-white/66 transition group-hover:text-white">
                        {locale === "nl" ? "Meer details" : "More detail"}
                        <span className="text-cyan-200 transition group-hover:translate-x-1">
                          →
                        </span>
                      </span>
                    </Link>
                  </RevealSection>
                ))}
              </div>
            </div>
          </section>
        </RevealSection>

        <SiteFooter locale={locale} content={content.footer} />
      </SiteShell>
    </>
  );
}
