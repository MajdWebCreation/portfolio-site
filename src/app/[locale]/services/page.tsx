import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/json-ld";
import RevealSection from "@/components/reveal-section";
import SectionHeading from "@/components/section-heading";
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
      <SiteShell locale={locale} content={content}>
        <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-10 lg:py-20">
          <RevealSection>
            <SectionHeading
              as="h1"
              eyebrow={overview.eyebrow}
              title={overview.title}
              description={overview.intro}
            />
          </RevealSection>

          <div className="mt-10 grid gap-4 rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 md:grid-cols-3">
            {overview.whyPoints.map((point) => (
              <div key={point} className="rounded-[1.25rem] border border-white/10 bg-black/35 p-5">
                <p className="text-sm leading-7 text-white/68">{point}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {services.map((service, index) => (
              <RevealSection key={service.path} delay={index * 0.04}>
                <ServiceCard service={service} />
              </RevealSection>
            ))}
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            <Link
              href={getLocalizedPath(locale, "projects")}
              className="rounded-[1.4rem] border border-white/10 bg-black/35 p-5 text-sm leading-7 text-white/68 transition hover:border-cyan-300/25 hover:bg-black/45"
            >
              {locale === "nl"
                ? "Bekijk hoe projecten worden benaderd via het projectenoverzicht."
                : "See how project work is approached through the projects overview."}
            </Link>
            <Link
              href={getLocalizedPath(locale, "blog")}
              className="rounded-[1.4rem] border border-white/10 bg-black/35 p-5 text-sm leading-7 text-white/68 transition hover:border-cyan-300/25 hover:bg-black/45"
            >
              {locale === "nl"
                ? "Lees inzichten over websites, performance en meertalige structuur."
                : "Read insights on websites, performance, and multilingual structure."}
            </Link>
            <Link
              href={getLocalizedPath(locale, "contact")}
              className="rounded-[1.4rem] border border-white/10 bg-black/35 p-5 text-sm leading-7 text-white/68 transition hover:border-cyan-300/25 hover:bg-black/45"
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
