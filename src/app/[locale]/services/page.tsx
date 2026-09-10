import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/json-ld";
import PageHeader from "@/components/page-header";
import ServiceCta from "@/components/service-cta";
import ServiceHeroSketch from "@/components/service-hero-sketch";
import ServiceIndex from "@/components/service-index";
import SiteShell from "@/components/site-shell";
import { getLocalizedPath, getRouteAlternates } from "@/lib/content/routes";
import {
  getServicesForLocale,
  serviceCollectionSchemaDescription,
  servicesOverviewContent,
} from "@/lib/content/services";
import { buildMetadata, getCanonicalUrl } from "@/lib/seo";
import { collectionPageSchema } from "@/lib/schema";
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
  const path = getLocalizedPath(locale, "services");

  return (
    <>
      <JsonLd
        data={collectionPageSchema({
          name: overview.label,
          description: serviceCollectionSchemaDescription[locale],
          url: getCanonicalUrl(path),
        })}
      />
      <SiteShell locale={locale} content={content} currentPath={path}>
        <PageHeader
          label={overview.label}
          title={overview.title}
          intro={overview.intro}
          visual={<ServiceHeroSketch />}
        />

        <div className="pt-10 lg:pt-14">
          <ServiceIndex
            locale={locale}
            services={services}
            pricing={overview.pricing}
            pricingHref={getLocalizedPath(locale, "pricing")}
            buildTitle={overview.build.title}
            improveTitle={overview.improve.title}
            improveText={overview.improve.text}
            trackingLocation="services-overview-index"
          />
        </div>

        <section className="pt-16 lg:pt-24" aria-labelledby="services-cta">
          <ServiceCta
            headingId="services-cta"
            title={overview.cta.title}
            text={overview.cta.text}
            hintsLabel={overview.cta.hintsLabel}
            hints={overview.cta.hints}
            primaryLabel={overview.cta.primaryLabel}
            primaryHref={getLocalizedPath(locale, "contact")}
            secondaryLabel={overview.cta.secondaryLabel}
            secondaryHref={getLocalizedPath(locale, "projectPlanner")}
          />
        </section>
      </SiteShell>
    </>
  );
}
