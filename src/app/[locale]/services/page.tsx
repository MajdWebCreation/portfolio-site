import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/json-ld";
import RevealSection from "@/components/reveal-section";
import ServiceCard from "@/components/service-card";
import SiteFooter from "@/components/site-footer";
import SiteShell from "@/components/site-shell";
import ServicesOverviewRail from "@/components/services-overview-rail";
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
  const railServices = services.slice(1);

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

          <div className="relative grid gap-12 lg:grid-cols-[1.04fr_0.96fr] lg:items-start">
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
              <div className="mx-auto max-w-[40rem] border-t border-white/10 pt-7 lg:mx-0">
                <p className="text-[10px] uppercase tracking-[0.32em] text-cyan-300/76">
                  {overview.whyTitle}
                </p>
                <p className="mt-5 max-w-xl text-2xl font-semibold leading-tight text-white">
                  {locale === "nl"
                    ? "Een compacte service stack, met heldere verschillen in scope."
                    : "A compact service stack, with clear differences in scope."}
                </p>
                <div className="mt-7 space-y-4">
                  {overview.whyPoints.map((point) => (
                    <p
                      key={point}
                      className="border-b border-white/8 pb-4 text-sm leading-7 text-white/58 last:border-b-0 last:pb-0"
                    >
                      {point}
                    </p>
                  ))}
                </div>
              </div>
            </RevealSection>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          <RevealSection>
            {featuredService ? <ServiceCard service={featuredService} featured /> : null}
          </RevealSection>
        </section>

        <RevealSection delay={0.1}>
          <section className="mx-auto mt-10 w-full max-w-7xl px-4 pb-4 sm:px-6 lg:px-10">
            <ServicesOverviewRail services={railServices} locale={locale} />

            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 border-t border-white/10 pt-6">
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
          </section>
        </RevealSection>

        <SiteFooter locale={locale} content={content.footer} />
      </SiteShell>
    </>
  );
}
