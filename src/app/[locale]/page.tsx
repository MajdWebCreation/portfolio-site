import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AmbientMedia from "@/components/ambient-media";
import BrandMark from "@/components/brand-mark";
import ContactPanel from "@/components/contact-panel";
import JsonLd from "@/components/json-ld";
import ProcessBlock from "@/components/process-block";
import PrototypeStorySection from "@/components/prototype-story-section";
import RevealSection from "@/components/reveal-section";
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

      <SiteShell
        locale={locale}
        content={content}
        currentPath={getLocalizedPath(locale, "home")}
      >
        <section className="relative mx-auto min-h-[calc(100vh-100px)] w-full max-w-7xl px-4 pb-20 pt-6 sm:px-6 lg:px-10 lg:pb-28 lg:pt-10">
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute left-0 top-12 h-[18rem] w-[18rem] rounded-full bg-cyan-300/5 blur-3xl" />
            <div className="absolute right-0 top-0 h-[16rem] w-[16rem] rounded-full bg-blue-300/5 blur-3xl" />
            <div className="ym-bg-field absolute inset-[-4%] opacity-[0.44]" />
            <div className="ym-bg-arc absolute inset-[-6%] opacity-[0.34]" />
          </div>

          <div className="grid items-center gap-10 lg:min-h-[82vh] lg:grid-cols-[0.84fr_1.16fr]">
            <RevealSection className="relative z-10">
              <div className="mx-auto flex max-w-[22rem] flex-col items-center text-center sm:max-w-[32rem] lg:mx-0 lg:block lg:max-w-2xl lg:text-left">
                <div className="mb-8 flex items-center justify-center gap-4 lg:justify-start">
                  <div className="rounded-full border border-[color:var(--line)] bg-[var(--background-elevated)] px-4 py-2 text-[11px] uppercase tracking-[0.32em] text-[var(--accent-text)]">
                    {content.hero.eyebrow}
                  </div>
                  <div className="hidden h-px flex-1 bg-gradient-to-r from-[color:var(--line)] to-transparent sm:block" />
                </div>

                <h1 className="text-balance max-w-5xl text-[3.35rem] font-semibold leading-[0.94] text-[var(--foreground)] sm:text-[4.6rem] lg:text-[6rem]">
                  {content.hero.title}
                </h1>

                <p className="mt-7 max-w-xl text-lg leading-8 text-[color:var(--muted-foreground)]">
                  {content.hero.description}
                </p>

                <div className="mt-10 flex flex-wrap justify-center gap-4 lg:justify-start">
                  <Link
                    href={content.hero.servicePath}
                    data-track-event="primary_cta_click"
                    data-track-category="homepage"
                    data-track-label={content.hero.primaryCta}
                    data-track-location="hero-primary"
                    className="rounded-full border border-[color:var(--line-strong)] bg-[var(--button-bg)] px-7 py-3.5 text-sm font-medium text-[var(--button-text)] transition hover:opacity-92"
                  >
                    {content.hero.primaryCta}
                  </Link>
                  <Link
                    href={content.hero.contactPath}
                    data-track-event="contact_cta_click"
                    data-track-category="homepage"
                    data-track-label={content.hero.secondaryCta}
                    data-track-location="hero-secondary"
                    className="rounded-full border border-[color:var(--line)] bg-[var(--background-elevated)] px-7 py-3.5 text-sm font-medium text-[var(--foreground)] transition hover:border-[color:var(--line-strong)] hover:bg-[var(--background-elevated)]/90"
                  >
                    {content.hero.secondaryCta}
                  </Link>
                </div>

                <div className="mt-12 flex w-full flex-col items-center justify-center gap-4 border-t border-[color:var(--line)] pt-6 text-center lg:flex-row lg:justify-start lg:text-left">
                  <div
                    data-logo-variant="theme"
                    className="relative h-[4.5rem] w-[6.5rem] shrink-0 sm:h-[5rem] sm:w-[7.2rem]"
                  >
                    <Image
                      src="/images/branding/logo-black.svg"
                      alt="YM Creations"
                      fill
                      className="ym-logo-image ym-logo-image-dark object-contain"
                      sizes="(min-width: 640px) 115px, 104px"
                    />
                    <Image
                      src="/images/branding/logo.svg"
                      alt=""
                      aria-hidden="true"
                      fill
                      className="ym-logo-image ym-logo-image-light object-contain"
                      sizes="(min-width: 640px) 115px, 104px"
                    />
                  </div>
                  <p className="max-w-md text-sm leading-7 text-[color:var(--muted-foreground)]">
                    {content.hero.cardText}
                  </p>
                </div>
              </div>
            </RevealSection>

            <RevealSection delay={0.08} className="relative mx-auto w-full max-w-[26rem] lg:mx-0 lg:max-w-none">
              <div className="pointer-events-none absolute inset-x-[12%] bottom-[-6%] h-24 rounded-full bg-cyan-300/8 blur-3xl" />
              <AmbientMedia
                src="/images/visuals/hero-ui-composition.jpg"
                alt="Interface composition showing a premium website system"
                priority
                sizes="(min-width: 1280px) 44vw, (min-width: 1024px) 48vw, 100vw"
                quality={78}
                className="min-h-[560px] rounded-[2.6rem]"
                imageClassName="object-cover object-center"
              />
              <div className="pointer-events-none absolute right-8 top-10 hidden lg:block">
                <BrandMark
                  variant="light"
                  className="h-12 w-[154px]"
                />
              </div>
              <div className="absolute left-5 top-5 rounded-full border border-[color:var(--line)] bg-[var(--background-elevated)]/84 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-[var(--accent-text)] backdrop-blur-sm">
                {content.hero.blueprintLabel}
              </div>
              <div className="absolute bottom-6 left-6 right-6">
                <div className="mx-auto max-w-sm border-t border-[color:var(--line)] pt-4 text-center text-sm leading-7 text-[color:var(--muted-foreground)] lg:mx-0 lg:text-left">
                  A premium digital system built around clarity, interface rhythm, and sharp implementation.
                </div>
              </div>
            </RevealSection>
          </div>
        </section>

        <section className="relative mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-10">
          <div className="pointer-events-none absolute inset-0">
            <div className="ym-bg-curve absolute inset-x-[-6%] bottom-[-10%] top-[8%] opacity-[0.22]" />
          </div>

          <div className="relative grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <RevealSection>
              <div className="mx-auto max-w-[22rem] text-center sm:max-w-[30rem] lg:mx-0 lg:max-w-xl lg:text-left">
                <p className="text-[11px] uppercase tracking-[0.32em] text-[var(--accent-text)]">
                  {content.homeServices.eyebrow}
                </p>
                <h2 className="mt-5 text-4xl font-semibold leading-tight text-[var(--foreground)] sm:text-5xl">
                  {content.homeServices.title}
                </h2>
                <p className="mt-6 text-base leading-8 text-[color:var(--muted-foreground)]">
                  {content.homeServices.description}
                </p>
                <Link
                  href={getLocalizedPath(locale, "services")}
                  data-track-event="primary_cta_click"
                  data-track-category="homepage"
                  data-track-label={content.homeServices.allServicesLabel}
                  data-track-location="services-section"
                  className="mt-8 inline-flex rounded-full border border-[color:var(--line)] bg-[var(--background-elevated)] px-6 py-3 text-sm font-medium text-[var(--foreground)] transition hover:border-[color:var(--line-strong)]"
                >
                  {content.homeServices.allServicesLabel}
                </Link>
              </div>
            </RevealSection>

            <RevealSection delay={0.08}>
              <div className="mx-auto w-full max-w-[42rem] lg:mx-0">
                <AmbientMedia
                  src="/images/visuals/services-ui-architecture.jpg"
                  alt="Interface architecture visual for service design and development"
                  sizes="(min-width: 1280px) 40vw, (min-width: 1024px) 46vw, 100vw"
                  quality={78}
                  className="min-h-[320px] rounded-[2.3rem]"
                  imageClassName="object-cover object-center"
                />
              </div>
            </RevealSection>
          </div>

          <div className="relative mx-auto mt-12 max-w-[26rem] grid gap-4 md:max-w-none md:grid-cols-3">
            {services.slice(0, 3).map((service, index) => (
              <RevealSection key={service.path} delay={index * 0.05}>
                <Link
                  href={service.path}
                  data-track-event="service_cta_click"
                  data-track-category="homepage"
                  data-track-label={service.navLabel}
                  data-track-location="services-grid-minimal"
                  className="group block rounded-[1.8rem] border border-[color:var(--line)] bg-[var(--background-elevated)]/92 p-6 shadow-[0_16px_32px_rgba(36,60,84,0.06)] transition hover:border-[color:var(--line-strong)]"
                >
                  <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--accent-text)]">
                    {service.icon}
                  </p>
                  <h3 className="mt-5 text-xl font-medium text-[var(--foreground)]">
                    {service.navLabel}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-[color:var(--muted-foreground)]">
                    {service.intro}
                  </p>
                  <span className="mt-6 inline-flex items-center gap-2 text-sm text-[color:var(--muted-foreground)] transition group-hover:text-[var(--foreground)]">
                    {locale === "nl" ? "Meer details" : "More detail"}
                    <span className="text-[var(--accent-text)] transition group-hover:translate-x-1">→</span>
                  </span>
                </Link>
              </RevealSection>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-3 lg:justify-start">
            {services.slice(3).map((service) => (
              <Link
                key={service.path}
                href={service.path}
                data-track-event="service_cta_click"
                data-track-category="homepage"
                data-track-label={service.navLabel}
                data-track-location="services-secondary-links"
                className="text-sm text-[color:var(--muted-foreground)] transition hover:text-[var(--foreground)]"
              >
                {service.navLabel} <span className="text-[var(--accent-text)]">→</span>
              </Link>
            ))}
          </div>
        </section>

        <PrototypeStorySection
          content={content.prototypeStory}
          overviewHref={getLocalizedPath(locale, "projects")}
        />

        <section
          id="process"
          className="relative mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-10"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-full">
            <div className="ym-bg-field absolute inset-[-4%] opacity-[0.22]" />
          </div>
          <div className="relative grid gap-14 lg:grid-cols-[0.8fr_1.2fr]">
            <RevealSection>
              <div className="mx-auto max-w-[22rem] text-center sm:max-w-[30rem] lg:mx-0 lg:max-w-xl lg:text-left">
                <p className="text-[11px] uppercase tracking-[0.32em] text-[var(--accent-text)]">
                  {content.about.eyebrow}
                </p>
                <h2 className="mt-5 text-4xl font-semibold leading-tight text-[var(--foreground)] sm:text-5xl">
                  {content.about.title}
                </h2>
                <p className="mt-6 text-base leading-8 text-[color:var(--muted-foreground)]">
                  {content.about.description}
                </p>
              </div>
            </RevealSection>
            <RevealSection delay={0.08}>
              <div className="mx-auto w-full max-w-[42rem] lg:mx-0 lg:max-w-none">
                <ProcessBlock
                  title={locale === "nl" ? "Hoe het traject meestal verloopt" : "How the process usually works"}
                  steps={processSteps[locale]}
                />
              </div>
            </RevealSection>
          </div>
        </section>

        <section className="relative mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-10">
          <div className="pointer-events-none absolute inset-0">
            <div className="ym-bg-arc absolute inset-[-6%] opacity-[0.22]" />
          </div>
          <div className="relative mx-auto max-w-[42rem] lg:max-w-none">
            <ContactPanel
              locale={locale}
              content={content.contact}
              footer={content.footer}
            />
          </div>
        </section>

        <SiteFooter locale={locale} content={content.footer} />
      </SiteShell>
    </>
  );
}
