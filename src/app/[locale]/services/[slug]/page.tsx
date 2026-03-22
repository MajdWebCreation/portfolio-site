import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import FaqBlock from "@/components/faq-block";
import JsonLd from "@/components/json-ld";
import ProcessBlock from "@/components/process-block";
import RevealSection from "@/components/reveal-section";
import SeoCta from "@/components/seo-cta";
import SiteFooter from "@/components/site-footer";
import SiteShell from "@/components/site-shell";
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
      <SiteShell locale={locale} content={content}>
        <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-10 lg:py-20">
          <div className="grid gap-12 lg:grid-cols-[1fr_0.9fr]">
            <RevealSection>
              <p className="mb-4 text-sm uppercase tracking-[0.3em] text-cyan-300/80">
                {content.nav.services}
              </p>
              <h1 className="max-w-4xl text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
                {service.title}
              </h1>
              <p className="mt-6 max-w-3xl text-base leading-8 text-white/65 sm:text-lg">
                {service.intro}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={service.contactPath}
                  className="rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:opacity-90"
                >
                  {locale === "nl" ? "Bespreek je project" : "Discuss your project"}
                </Link>
                <Link
                  href={service.overviewPath}
                  className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white transition hover:border-cyan-400/50 hover:bg-white/10"
                >
                  {locale === "nl" ? "Bekijk alle diensten" : "View all services"}
                </Link>
              </div>
            </RevealSection>

            <RevealSection delay={0.08}>
              <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
                <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
                  <span className="text-xs uppercase tracking-[0.25em] text-white/40">
                    {locale === "nl" ? "Service blueprint" : "Service blueprint"}
                  </span>
                  <span className="text-xs uppercase tracking-[0.22em] text-cyan-300/70">
                    {service.icon}
                  </span>
                </div>
                <div className="space-y-4">
                  {service.deliverables.map((item) => (
                    <div
                      key={item}
                      className="rounded-[1.25rem] border border-white/10 bg-black/35 p-4"
                    >
                      <p className="text-sm leading-7 text-white/68">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </RevealSection>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-2 lg:px-10">
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 backdrop-blur md:p-8">
            <h2 className="text-3xl font-semibold text-white">
              {service.forWhoTitle}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-white/65">
              {service.forWhoDescription}
            </p>
            <ul className="mt-6 space-y-3">
              {service.suitableFor.map((item) => (
                <li
                  key={item}
                  className="rounded-[1.2rem] border border-white/10 bg-black/35 px-4 py-4 text-sm leading-7 text-white/68"
                >
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 backdrop-blur md:p-8">
            <h2 className="text-3xl font-semibold text-white">
              {service.useCasesTitle}
            </h2>
            <ul className="mt-6 space-y-3">
              {service.useCases.map((item) => (
                <li
                  key={item}
                  className="rounded-[1.2rem] border border-white/10 bg-black/35 px-4 py-4 text-sm leading-7 text-white/68"
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
            text={service.ctaText}
            primaryLabel={locale === "nl" ? "Neem contact op" : "Contact us"}
            primaryHref={service.contactPath}
            secondaryLabel={locale === "nl" ? "Terug naar diensten" : "Back to services"}
            secondaryHref={service.overviewPath}
          />
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
          <div className="rounded-[2rem] border border-white/10 bg-black/35 p-6 md:p-8">
            <h2 className="text-3xl font-semibold text-white">
              {locale === "nl" ? "Andere diensten" : "Other services"}
            </h2>
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {siblingServices.slice(0, 3).map((item) => (
                <Link
                  key={item.path}
                  href={item.path}
                  className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-5 transition hover:border-cyan-300/25 hover:bg-white/[0.05]"
                >
                  <p className="text-sm font-medium text-white">{item.navLabel}</p>
                  <p className="mt-3 text-sm leading-7 text-white/62">
                    {item.intro}
                  </p>
                </Link>
              ))}
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <Link
                href={locale === "nl" ? "/nl/projecten" : "/en/projects"}
                className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-white/62 transition hover:border-cyan-300/25 hover:bg-white/[0.05]"
              >
                {locale === "nl"
                  ? "Bekijk het projectenoverzicht voor de manier waarop werk en richting worden opgebouwd."
                  : "View the projects overview for how work and direction are shaped."}
              </Link>
              <Link
                href={locale === "nl" ? "/nl/blog" : "/en/blog"}
                className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-white/62 transition hover:border-cyan-300/25 hover:bg-white/[0.05]"
              >
                {locale === "nl"
                  ? "Lees inzichten over performance, structuur en technische keuzes."
                  : "Read insights on performance, structure, and technical decisions."}
              </Link>
              <Link
                href={service.contactPath}
                className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-white/62 transition hover:border-cyan-300/25 hover:bg-white/[0.05]"
              >
                {locale === "nl"
                  ? "Neem contact op om te bespreken of deze dienst past bij je project."
                  : "Get in touch to discuss whether this service fits your project."}
              </Link>
            </div>
          </div>
        </section>

        <SiteFooter locale={locale} content={content.footer} />
      </SiteShell>
    </>
  );
}
