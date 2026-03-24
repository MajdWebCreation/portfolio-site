import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AmbientMedia from "@/components/ambient-media";
import FaqBlock from "@/components/faq-block";
import JsonLd from "@/components/json-ld";
import ProcessBlock from "@/components/process-block";
import RevealSection from "@/components/reveal-section";
import SeoCta from "@/components/seo-cta";
import SiteFooter from "@/components/site-footer";
import SiteShell from "@/components/site-shell";
import { getLocalizedPath } from "@/lib/content/routes";
import {
  getServiceAlternates,
  getServiceBySlug,
  getServicesForLocale,
  serviceDefinitions,
  serviceKeys,
} from "@/lib/content/services";
import { buildMetadata, getCanonicalUrl } from "@/lib/seo";
import { serviceSchema, webPageSchema } from "@/lib/schema";
import { isValidLocale, siteContent, type Locale } from "@/lib/content/site-content";

export async function generateStaticParams() {
  return serviceKeys.map((key) => ({
    locale: "en",
    slug: serviceDefinitions[key].locale.en.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;

  if (!isValidLocale(locale)) {
    return {};
  }

  const service = getServiceBySlug(locale, slug);

  if (!service) {
    return {};
  }

  return buildMetadata({
    locale,
    pathname: service.path,
    title: service.metaTitle,
    description: service.metaDescription,
    alternates: getServiceAlternates(service.key),
  });
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  if (locale !== "en") {
    notFound();
  }

  return <ServiceDetailContent locale={locale} slug={slug} />;
}

export function ServiceDetailContent({
  locale,
  slug,
}: {
  locale: Locale;
  slug: string;
}) {
  const service = getServiceBySlug(locale, slug);

  if (!service) {
    notFound();
  }

  const content = siteContent[locale];
  const siblingServices = getServicesForLocale(locale).filter(
    (item) => item.key !== service.key,
  );
  const supportsPlannerCta =
    service.key === "business-websites" ||
    service.key === "web-app-development" ||
    service.key === "ecommerce-development";
  const secondaryCtaLabel = supportsPlannerCta
    ? locale === "nl"
      ? "Gebruik de Project Planner"
      : "Use the Project Planner"
    : locale === "nl"
      ? "Terug naar diensten"
      : "Back to services";
  const secondaryCtaHref = supportsPlannerCta
    ? getLocalizedPath(locale, "projectPlanner")
    : service.overviewPath;

  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            name: service.metaTitle,
            description: service.metaDescription,
            url: getCanonicalUrl(service.path),
          }),
          serviceSchema({
            name: service.navLabel,
            description: service.intro,
            url: getCanonicalUrl(service.path),
          }),
        ]}
      />
      <SiteShell locale={locale} content={content} currentPath={service.path}>
        <section className="relative mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-10 lg:py-20">
          <div className="ym-bg-arc pointer-events-none absolute inset-[-6%] opacity-[0.22]" />
          <div className="relative grid gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-end">
            <RevealSection>
              <p className="mb-4 text-sm uppercase tracking-[0.3em] text-[var(--accent-text)]">
                {content.nav.services}
              </p>
              <h1 className="max-w-4xl text-4xl font-semibold leading-tight text-[var(--foreground)] sm:text-5xl lg:text-6xl">
                {service.title}
              </h1>
              <p className="mt-6 max-w-3xl text-base leading-8 text-[color:var(--muted-foreground)] sm:text-lg">
                {service.intro}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={service.contactPath}
                  data-track-event="contact_cta_click"
                  data-track-category="service-detail"
                  data-track-label={locale === "nl" ? "Bespreek je project" : "Discuss your project"}
                  data-track-location="service-hero"
                  className="rounded-full bg-[var(--button-bg)] px-6 py-3 text-sm font-medium text-[var(--button-text)] transition hover:opacity-92"
                >
                  {locale === "nl" ? "Bespreek je project" : "Discuss your project"}
                </Link>
                <Link
                  href={service.overviewPath}
                  data-track-event="primary_cta_click"
                  data-track-category="service-detail"
                  data-track-label={locale === "nl" ? "Bekijk alle diensten" : "View all services"}
                  data-track-location="service-hero"
                  className="rounded-full border border-[color:var(--line)] bg-[var(--background-elevated)] px-6 py-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[color:var(--line-strong)]"
                >
                  {locale === "nl" ? "Bekijk alle diensten" : "View all services"}
                </Link>
              </div>
            </RevealSection>

            <RevealSection delay={0.08}>
              <div className="grid gap-4">
                <AmbientMedia
                  src="/images/visuals/services-ui-architecture.jpg"
                  alt="Service interface architecture visual"
                  quality={78}
                  className="min-h-[360px]"
                  imageClassName="object-cover object-center"
                />
                <div className="grid gap-4 md:grid-cols-2">
                  {service.deliverables.slice(0, 4).map((item) => (
                    <div
                      key={item}
                      className="rounded-[1.7rem] border border-[color:var(--line)] bg-[var(--background-elevated)] p-5"
                    >
                      <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--accent-text)]">
                        {service.icon}
                      </p>
                      <p className="mt-4 text-sm leading-7 text-[color:var(--muted-foreground)]">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </RevealSection>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-10">
          <section className="rounded-[2.2rem] border border-[color:var(--line)] bg-[var(--background-elevated)]/94 p-6 md:p-8">
            <h2 className="text-3xl font-semibold text-[var(--foreground)]">
              {service.forWhoTitle}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-[color:var(--muted-foreground)]">
              {service.forWhoDescription}
            </p>
            <ul className="mt-6 space-y-3">
              {service.suitableFor.map((item) => (
                <li
                  key={item}
                  className="rounded-[1.2rem] border border-[color:var(--line)] bg-[var(--background)] px-4 py-4 text-sm leading-7 text-[color:var(--muted-foreground)]"
                >
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="relative overflow-hidden rounded-[2.2rem] border border-[color:var(--line)] bg-[var(--background-elevated)]/94 p-6 md:p-8">
            <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(113,227,255,0.08),transparent_70%)]" />
            <h2 className="text-3xl font-semibold text-[var(--foreground)]">
              {service.useCasesTitle}
            </h2>
            <ul className="mt-6 space-y-3">
              {service.useCases.map((item) => (
                <li
                  key={item}
                  className="rounded-[1.2rem] border border-[color:var(--line)] bg-[var(--background)] px-4 py-4 text-sm leading-7 text-[color:var(--muted-foreground)]"
                >
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
          <ProcessBlock
            title={locale === "nl" ? "Het projectproces" : "The project process"}
            steps={service.process}
          />
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
          <FaqBlock title={service.faqTitle} items={service.faqs} />
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
          <SeoCta
            title={service.ctaTitle}
            text={
              supportsPlannerCta
                ? locale === "nl"
                  ? `${service.ctaText} Twijfel je nog over het juiste niveau of de juiste scope, dan helpt de Project Planner om dat eerst helder te krijgen.`
                  : `${service.ctaText} If you are still unsure about the right level or scope, the Project Planner helps clarify that first.`
                : service.ctaText
            }
            primaryLabel={locale === "nl" ? "Neem contact op" : "Contact us"}
            primaryHref={service.contactPath}
            secondaryLabel={secondaryCtaLabel}
            secondaryHref={secondaryCtaHref}
            trackingContext="service"
          />
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
          <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="rounded-[2.2rem] border border-[color:var(--line)] bg-[var(--background-elevated)]/94 p-6 md:p-8">
              <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--accent-text)]">
                Service compass
              </p>
              <p className="mt-5 text-base leading-8 text-[color:var(--muted-foreground)]">
                {service.intro}
              </p>
            </div>
            <div className="rounded-[2.2rem] border border-[color:var(--line)] bg-[var(--background-elevated)]/94 p-6 md:p-8">
            <h2 className="text-3xl font-semibold text-[var(--foreground)]">
              {locale === "nl" ? "Andere diensten" : "Other services"}
            </h2>
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {siblingServices.slice(0, 3).map((item) => (
                <Link
                  key={item.path}
                  href={item.path}
                  data-track-event="service_cta_click"
                  data-track-category="service-detail"
                  data-track-label={item.navLabel}
                  data-track-location="related-services"
                  className="rounded-[1.4rem] border border-[color:var(--line)] bg-[var(--background)]/84 p-5 transition hover:border-[color:var(--line-strong)]"
                >
                  <p className="text-sm font-medium text-[var(--foreground)]">{item.navLabel}</p>
                  <p className="mt-3 text-sm leading-7 text-[color:var(--muted-foreground)]">
                    {item.intro}
                  </p>
                </Link>
              ))}
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <Link
                href={locale === "nl" ? "/nl/projecten" : "/en/projects"}
                data-track-event="primary_cta_click"
                data-track-category="service-detail"
                data-track-label={locale === "nl" ? "Projecten" : "Projects"}
                data-track-location="service-related-links"
                className="rounded-[1.4rem] border border-[color:var(--line)] bg-[var(--background)]/84 p-5 text-sm leading-7 text-[color:var(--muted-foreground)] transition hover:border-[color:var(--line-strong)]"
              >
                {locale === "nl"
                  ? "Bekijk het projectenoverzicht voor de manier waarop werk en richting worden opgebouwd."
                  : "View the projects overview for how work and direction are shaped."}
              </Link>
              <Link
                href={locale === "nl" ? "/nl/blog" : "/en/blog"}
                data-track-event="article_cta_click"
                data-track-category="service-detail"
                data-track-label={locale === "nl" ? "Inzichten" : "Insights"}
                data-track-location="service-related-links"
                className="rounded-[1.4rem] border border-[color:var(--line)] bg-[var(--background)]/84 p-5 text-sm leading-7 text-[color:var(--muted-foreground)] transition hover:border-[color:var(--line-strong)]"
              >
                {locale === "nl"
                  ? "Lees inzichten over performance, structuur en technische keuzes."
                  : "Read insights on performance, structure, and technical decisions."}
              </Link>
              <Link
                href={service.contactPath}
                data-track-event="contact_cta_click"
                data-track-category="service-detail"
                data-track-label={locale === "nl" ? "Contact" : "Contact"}
                data-track-location="service-related-links"
                className="rounded-[1.4rem] border border-[color:var(--line)] bg-[var(--background)]/84 p-5 text-sm leading-7 text-[color:var(--muted-foreground)] transition hover:border-[color:var(--line-strong)]"
              >
                {locale === "nl"
                  ? "Neem contact op om te bespreken of deze dienst past bij je project."
                  : "Get in touch to discuss whether this service fits your project."}
              </Link>
            </div>
            </div>
          </div>
        </section>

        <SiteFooter locale={locale} content={content.footer} />
      </SiteShell>
    </>
  );
}
