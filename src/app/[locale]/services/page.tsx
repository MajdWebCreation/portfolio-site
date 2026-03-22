import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/json-ld";
import AmbientMedia from "@/components/ambient-media";
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
          <div className="ym-bg-curve ym-bg-breathe absolute inset-x-[-6%] inset-y-0 opacity-[0.56]" />
          <div className="relative grid gap-10 lg:grid-cols-[0.94fr_1.06fr] lg:items-end">
            <RevealSection>
              <div className="max-w-2xl">
                <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/72">
                  {overview.eyebrow}
                </p>
                <h1 className="mt-5 text-balance text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
                  {overview.title}
                </h1>
                <p className="mt-6 text-base leading-8 text-white/64">
                  {overview.intro}
                </p>
              </div>
            </RevealSection>
            <RevealSection delay={0.08}>
              <AmbientMedia
                src="/images/visuals/services-system-visual.png"
                alt="Services system overview"
                className="min-h-[420px]"
                imageClassName="object-cover object-center"
              />
            </RevealSection>
          </div>

          <div className="relative mt-12 grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
            <RevealSection>
              {services[0] ? <ServiceCard service={services[0]} /> : null}
            </RevealSection>
            <RevealSection delay={0.06}>
              <div className="grid gap-4 sm:grid-cols-2">
                {overview.whyPoints.map((point, index) => (
                  <div
                    key={point}
                    className={`rounded-[1.8rem] border border-white/10 p-5 ${
                      index === 0
                        ? "bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]"
                        : "bg-black/25"
                    }`}
                  >
                    <p className="text-sm leading-7 text-white/68">{point}</p>
                  </div>
                ))}
              </div>
            </RevealSection>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {services.slice(1).map((service, index) => (
              <RevealSection key={service.path} delay={index * 0.04}>
                <ServiceCard service={service} />
              </RevealSection>
            ))}
          </div>

          <div className="mt-14 grid gap-4 md:grid-cols-3">
            <Link
              href={getLocalizedPath(locale, "projects")}
              data-track-event="primary_cta_click"
              data-track-category="services-overview"
              data-track-label={locale === "nl" ? "Projecten" : "Projects"}
              data-track-location="services-overview-links"
              className="rounded-[1.8rem] border border-white/10 bg-black/30 p-6 text-sm leading-7 text-white/68 transition hover:border-cyan-300/25 hover:bg-black/45"
            >
              {locale === "nl"
                ? "Bekijk hoe projecten worden benaderd via het projectenoverzicht."
                : "See how project work is approached through the projects overview."}
            </Link>
            <Link
              href={getLocalizedPath(locale, "blog")}
              data-track-event="primary_cta_click"
              data-track-category="services-overview"
              data-track-label={locale === "nl" ? "Inzichten" : "Insights"}
              data-track-location="services-overview-links"
              className="rounded-[1.8rem] border border-white/10 bg-black/30 p-6 text-sm leading-7 text-white/68 transition hover:border-cyan-300/25 hover:bg-black/45"
            >
              {locale === "nl"
                ? "Lees inzichten over websites, performance en meertalige structuur."
                : "Read insights on websites, performance, and multilingual structure."}
            </Link>
            <Link
              href={getLocalizedPath(locale, "contact")}
              data-track-event="contact_cta_click"
              data-track-category="services-overview"
              data-track-label={locale === "nl" ? "Contact" : "Contact"}
              data-track-location="services-overview-links"
              className="rounded-[1.8rem] border border-white/10 bg-black/30 p-6 text-sm leading-7 text-white/68 transition hover:border-cyan-300/25 hover:bg-black/45"
            >
              {locale === "nl"
                ? "Start een gesprek over de dienst die het beste past."
                : "Start a conversation about the service that fits best."}
            </Link>
          </div>
        </section>
        <SiteFooter locale={locale} content={content.footer} />
      </SiteShell>
    </>
  );
}
