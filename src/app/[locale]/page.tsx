import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BuildOverview from "@/components/build-overview";
import ContactCta from "@/components/contact-cta";
import CtaLink from "@/components/cta-link";
import HeroFlow from "@/components/hero-flow";
import JsonLd from "@/components/json-ld";
import SiteShell from "@/components/site-shell";
import { getLocalizedPath } from "@/lib/content/routes";
import { getServicesForLocale, type ServiceKey } from "@/lib/content/services";
import { isValidLocale, siteContent } from "@/lib/content/site-content";
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
  const homePath = getLocalizedPath(locale, "home");
  const pageUrl = getCanonicalUrl(homePath);
  const servicePath = (key: ServiceKey) =>
    services.find((service) => service.key === key)?.path ??
    getLocalizedPath(locale, "services");

  return (
    <>
      <JsonLd
        data={[
          organizationSchema(),
          websiteSchema(),
          webPageSchema({
            name:
              locale === "nl"
                ? "YM Creations, digitale producten op maat"
                : "YM Creations, custom digital products",
            description: content.hero.description,
            url: pageUrl,
          }),
        ]}
      />

      <SiteShell locale={locale} content={content} currentPath={homePath}>
        {/* Hero: positioning on the left, a request travelling through a product on the right. */}
        <section className="container-x grid gap-12 pb-16 pt-12 sm:pt-16 lg:grid-cols-12 lg:items-center lg:gap-8 lg:pb-24 lg:pt-20">
          <div className="lg:col-span-8 xl:col-span-7">
            <h1 className="display-xl rise max-w-[19ch]">{content.hero.title}</h1>
            <p className="lede rise rise-delay-1 mt-7 max-w-[38rem]">
              {content.hero.description}
            </p>
            <div className="rise rise-delay-2 mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
              <CtaLink
                href={getLocalizedPath(locale, "contact")}
                data-track-event="contact_cta_click"
                data-track-category="homepage"
                data-track-label={content.hero.primaryCta}
                data-track-location="hero-primary"
              >
                {content.hero.primaryCta}
              </CtaLink>
              <CtaLink
                href={getLocalizedPath(locale, "projects")}
                variant="text"
                data-track-event="primary_cta_click"
                data-track-category="homepage"
                data-track-label={content.hero.secondaryCta}
                data-track-location="hero-secondary"
              >
                {content.hero.secondaryCta}
              </CtaLink>
            </div>
          </div>
          <div className="rise rise-delay-2 mx-auto w-full max-w-md lg:col-span-4 lg:ml-auto lg:max-w-none xl:col-span-5">
            <HeroFlow
              caption={content.hero.flow.caption}
              layers={content.hero.flow.layers}
              base={content.hero.flow.base}
            />
          </div>
        </section>

        {/* What we build: the only capabilities section, pointing to /diensten. */}
        <section className="bg-ink text-paper" aria-labelledby="build-heading">
          <BuildOverview
            headingId="build-heading"
            title={content.build.title}
            description={content.build.description}
            linkLabel={content.build.linkLabel}
            linkHref={getLocalizedPath(locale, "services")}
            groups={content.build.groups}
            hrefFor={servicePath}
          />
        </section>

        {/* How working together feels: three promises, set as one statement. */}
        <section className="bg-paper-deep" aria-labelledby="collaboration-heading">
          <div className="container-x grid gap-6 py-16 lg:grid-cols-12 lg:gap-8 lg:py-24">
            <h2 id="collaboration-heading" className="label-mono pt-2 lg:col-span-2">
              {content.collaboration.label}
            </h2>
            <div className="lg:col-span-9 lg:col-start-4 lg:border-l lg:border-line-strong lg:pl-10">
              <p className="display-md max-w-[24ch]">
                {content.collaboration.statements.map((statement) => (
                  <span key={statement} className="block">
                    {statement}
                  </span>
                ))}
              </p>
              <div className="mt-8">
                <CtaLink
                  href={getLocalizedPath(locale, "process")}
                  variant="text"
                  data-track-event="primary_cta_click"
                  data-track-category="homepage"
                  data-track-label={content.collaboration.linkLabel}
                  data-track-location="collaboration"
                >
                  {content.collaboration.linkLabel}
                </CtaLink>
              </div>
            </div>
          </div>
        </section>

        {/* Pointers: proof and pricing live on their own pages. */}
        <section
          className="container-x pt-16 lg:pt-24"
          aria-label={`${content.pointers.projects.label}, ${content.pointers.pricing.label}`}
        >
          <div className="grid gap-4 border-t border-line pt-6 lg:grid-cols-12 lg:gap-8">
            <p className="label-mono lg:col-span-2">{content.pointers.projects.label}</p>
            <div className="lg:col-span-9 lg:col-start-4">
              <Link
                href={getLocalizedPath(locale, "projects")}
                data-track-event="primary_cta_click"
                data-track-category="homepage"
                data-track-label={content.pointers.projects.title}
                data-track-location="pointer-projects"
                className="group inline-flex flex-wrap items-baseline gap-x-4"
              >
                <span className="display-lg text-ink transition-colors group-hover:text-accent">
                  {content.pointers.projects.title}
                </span>
                <span
                  aria-hidden="true"
                  className="display-lg text-faint transition-[transform,color] duration-300 group-hover:translate-x-2 group-hover:text-accent"
                >
                  →
                </span>
              </Link>
              <p className="mt-3 max-w-md text-[1rem] leading-relaxed text-muted">
                {content.pointers.projects.text}
              </p>
            </div>
          </div>

          <div className="mt-10 grid gap-3 border-t border-line pt-6 lg:grid-cols-12 lg:gap-8">
            <p className="label-mono lg:col-span-2">{content.pointers.pricing.label}</p>
            <div className="lg:col-span-9 lg:col-start-4">
              <Link
                href={getLocalizedPath(locale, "pricing")}
                data-track-event="primary_cta_click"
                data-track-category="homepage"
                data-track-label={content.pointers.pricing.title}
                data-track-location="pointer-pricing"
                className="group inline-flex flex-wrap items-baseline gap-x-3"
              >
                <span className="display-sm text-ink transition-colors group-hover:text-accent">
                  {content.pointers.pricing.title}
                </span>
                <span
                  aria-hidden="true"
                  className="text-faint transition-[transform,color] duration-300 group-hover:translate-x-1 group-hover:text-accent"
                >
                  →
                </span>
              </Link>
              <p className="mt-2 text-[0.95rem] text-muted">{content.pointers.pricing.text}</p>
            </div>
          </div>
        </section>

        {/* Closing step. */}
        <section className="container-x pt-20 lg:pt-28" aria-labelledby="contact-heading">
          <ContactCta locale={locale} content={content.contactCta} headingId="contact-heading" />
        </section>
      </SiteShell>
    </>
  );
}
