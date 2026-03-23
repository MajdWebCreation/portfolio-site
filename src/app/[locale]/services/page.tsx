import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/json-ld";
import RevealSection from "@/components/reveal-section";
import ServiceCard from "@/components/service-card";
import SiteFooter from "@/components/site-footer";
import SiteShell from "@/components/site-shell";
import Link from "next/link";
import { getRouteAlternates } from "@/lib/content/routes";
import { getLocalizedPath } from "@/lib/content/routes";
import {
  getServicesForLocale,
  serviceCollectionSchemaDescription,
  servicesOverviewContent,
} from "@/lib/content/services";
import { isValidLocale, siteContent, type Locale } from "@/lib/content/site-content";
import { buildMetadata, getCanonicalUrl } from "@/lib/seo";
import { webPageSchema } from "@/lib/schema";

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
          <div className="ym-bg-curve ym-bg-breathe absolute inset-x-[-6%] inset-y-0 opacity-[0.48]" />

          <div className="relative grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
            <RevealSection>
              <div className="mx-auto max-w-[22rem] text-center sm:max-w-[32rem] lg:mx-0 lg:max-w-2xl lg:text-left">
                <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/72">
                  {overview.eyebrow}
                </p>
                <h1 className="mt-5 text-balance text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
                  {overview.title}
                </h1>
                <p className="mt-6 max-w-xl text-base leading-8 text-white/62">
                  {overview.intro}
                </p>
              </div>
            </RevealSection>

            <RevealSection delay={0.08}>
              <div className="mx-auto max-w-[42rem] rounded-[2.25rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] p-6 text-center md:p-7 lg:mx-0 lg:text-left">
                <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/76">
                  {overview.whyTitle}
                </p>

                <div className="mt-6 space-y-5">
                  {overview.whyPoints.map((point) => (
                    <div key={point} className="border-b border-white/8 pb-5 last:border-b-0 last:pb-0">
                      <p className="mx-auto max-w-md text-sm leading-7 text-white/58 lg:mx-0">{point}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-3 lg:justify-start">
                  <Link
                    href={getLocalizedPath(locale, "projects")}
                    data-track-event="primary_cta_click"
                    data-track-category="services-overview"
                    data-track-label={locale === "nl" ? "Projecten" : "Projects"}
                    data-track-location="services-hero-links"
                    className="text-sm text-white/50 transition hover:text-white"
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
                    className="text-sm text-white/50 transition hover:text-white"
                  >
                    {locale === "nl" ? "Neem contact op" : "Contact us"}{" "}
                    <span className="text-cyan-200/65">→</span>
                  </Link>
                </div>
              </div>
            </RevealSection>
          </div>

          <div className="mx-auto mt-14 max-w-[26rem] grid gap-6 sm:max-w-[42rem] xl:max-w-none xl:grid-cols-[1.15fr_0.85fr]">
            <RevealSection>
              {services[0] ? <ServiceCard service={services[0]} featured /> : null}
            </RevealSection>

            <RevealSection delay={0.06}>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                {services.slice(1, 3).map((service) => (
                  <Link
                    key={service.path}
                    href={service.path}
                    data-track-event="service_cta_click"
                    data-track-category="services-overview"
                    data-track-label={service.navLabel}
                    data-track-location="services-top-links"
                    className="group rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-5 transition hover:border-cyan-300/24 hover:bg-white/[0.035]"
                  >
                    <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/74">
                      {service.icon}
                    </p>
                    <h2 className="mt-4 text-xl font-medium text-white">
                      {service.navLabel}
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-white/56">
                      {service.intro}
                    </p>
                    <span className="mt-5 inline-flex items-center gap-2 text-sm text-white/66 transition group-hover:text-white">
                      {locale === "nl" ? "Meer details" : "More detail"}
                      <span className="text-cyan-200 transition group-hover:translate-x-1">→</span>
                    </span>
                  </Link>
                ))}
              </div>
            </RevealSection>
          </div>

          <div className="mx-auto mt-8 max-w-[26rem] grid gap-5 sm:max-w-[42rem] md:grid-cols-2 xl:max-w-none xl:grid-cols-3">
            {services.slice(3).map((service, index) => (
              <RevealSection key={service.path} delay={index * 0.04}>
                <ServiceCard service={service} />
              </RevealSection>
            ))}
          </div>

          <div className="mt-12 border-t border-white/10 pt-8">
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 lg:justify-start">
              <Link
                href={getLocalizedPath(locale, "blog")}
                data-track-event="primary_cta_click"
                data-track-category="services-overview"
                data-track-label={locale === "nl" ? "Inzichten" : "Insights"}
                data-track-location="services-bottom-links"
                className="text-sm text-white/48 transition hover:text-white"
              >
                {locale === "nl"
                  ? "Lees inzichten over websites en performance"
                  : "Read insights on websites and performance"}{" "}
                <span className="text-cyan-200/65">→</span>
              </Link>

              <Link
                href={getLocalizedPath(locale, "contact")}
                data-track-event="contact_cta_click"
                data-track-category="services-overview"
                data-track-label={locale === "nl" ? "Contact" : "Contact"}
                data-track-location="services-bottom-links"
                className="text-sm text-white/48 transition hover:text-white"
              >
                {locale === "nl"
                  ? "Start een gesprek over de juiste richting"
                  : "Start a conversation about the right direction"}{" "}
                <span className="text-cyan-200/65">→</span>
              </Link>
            </div>
          </div>
        </section>

        <SiteFooter locale={locale} content={content.footer} />
      </SiteShell>
    </>
  );
}
