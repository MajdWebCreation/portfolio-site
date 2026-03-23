import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AmbientMedia from "@/components/ambient-media";
import BrandMark from "@/components/brand-mark";
import ContactPanel from "@/components/contact-panel";
import JsonLd from "@/components/json-ld";
import ParallaxLayer from "@/components/parallax-layer";
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
            <ParallaxLayer className="absolute inset-0" yRange={[-18, 18]}>
              <div className="absolute left-0 top-12 h-[22rem] w-[22rem] rounded-full bg-cyan-300/6 blur-3xl" />
              <div className="absolute right-0 top-0 h-[20rem] w-[20rem] rounded-full bg-blue-300/6 blur-3xl" />
              <div className="ym-bg-field ym-bg-drift-slow absolute inset-[-4%] opacity-[0.68]" />
            </ParallaxLayer>
            <ParallaxLayer className="absolute inset-0" yRange={[12, -12]}>
              <div className="ym-bg-arc ym-bg-float-fade absolute inset-[-6%] opacity-[0.72]" />
            </ParallaxLayer>
          </div>

          <div className="grid items-center gap-10 lg:min-h-[82vh] lg:grid-cols-[0.84fr_1.16fr]">
            <RevealSection className="relative z-10">
              <div className="mx-auto flex max-w-[22rem] flex-col items-center text-center sm:max-w-[32rem] lg:mx-0 lg:block lg:max-w-2xl lg:text-left">
                <div className="mb-8 flex items-center justify-center gap-4 lg:justify-start">
                  <div className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[11px] uppercase tracking-[0.32em] text-cyan-200/78">
                    {content.hero.eyebrow}
                  </div>
                  <div className="hidden h-px flex-1 bg-gradient-to-r from-white/20 to-transparent sm:block" />
                </div>

                <h1 className="text-balance max-w-5xl text-[3.35rem] font-semibold leading-[0.94] text-white sm:text-[4.6rem] lg:text-[6rem]">
                  {content.hero.title}
                </h1>

                <p className="mt-7 max-w-xl text-lg leading-8 text-white/64">
                  {content.hero.description}
                </p>

                <div className="mt-10 flex flex-wrap justify-center gap-4 lg:justify-start">
                  <Link
                    href={content.hero.servicePath}
                    data-track-event="primary_cta_click"
                    data-track-category="homepage"
                    data-track-label={content.hero.primaryCta}
                    data-track-location="hero-primary"
                    className="rounded-full border border-white/10 bg-white px-7 py-3.5 text-sm font-medium text-black shadow-[0_0_45px_rgba(255,255,255,0.12)] transition hover:opacity-90"
                  >
                    {content.hero.primaryCta}
                  </Link>
                  <Link
                    href={content.hero.contactPath}
                    data-track-event="contact_cta_click"
                    data-track-category="homepage"
                    data-track-label={content.hero.secondaryCta}
                    data-track-location="hero-secondary"
                    className="rounded-full border border-cyan-300/20 bg-white/[0.04] px-7 py-3.5 text-sm font-medium text-white transition hover:border-cyan-300/45 hover:bg-white/[0.08]"
                  >
                    {content.hero.secondaryCta}
                  </Link>
                </div>

                <div className="mt-12 flex w-full flex-col items-center justify-center gap-4 border-t border-white/10 pt-6 text-center lg:flex-row lg:justify-start lg:text-left">
                  <BrandMark className="h-8 w-[104px] opacity-[0.18]" />
                  <p className="max-w-md text-sm leading-7 text-white/48">
                    {content.hero.cardText}
                  </p>
                </div>
              </div>
            </RevealSection>

            <RevealSection delay={0.08} className="relative mx-auto w-full max-w-[26rem] lg:mx-0 lg:max-w-none">
              <ParallaxLayer className="absolute inset-x-[12%] bottom-[-6%]" yRange={[-12, 12]}>
                <div className="h-36 rounded-full bg-cyan-300/10 blur-3xl" />
              </ParallaxLayer>
              <ParallaxLayer yRange={[-22, 18]} scaleRange={[1.01, 1.04]}>
                <AmbientMedia
                  src="/images/visuals/hero-ui-composition.png"
                  alt="Interface composition showing a premium website system"
                  priority
                  className="min-h-[620px] rounded-[2.6rem]"
                  imageClassName="object-cover object-center scale-[1.02]"
                />
              </ParallaxLayer>
              <ParallaxLayer className="absolute right-8 top-10 hidden lg:block" yRange={[-12, 12]}>
                <BrandMark className="h-12 w-[154px] opacity-[0.12]" />
              </ParallaxLayer>
              <div className="absolute left-5 top-5 rounded-full border border-white/10 bg-black/35 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-cyan-200/75 backdrop-blur">
                {content.hero.blueprintLabel}
              </div>
              <div className="absolute bottom-6 left-6 right-6">
                <div className="mx-auto max-w-sm border-t border-white/12 pt-4 text-center text-sm leading-7 text-white/66 lg:mx-0 lg:text-left">
                  A premium digital system built around clarity, interface rhythm, and sharp implementation.
                </div>
              </div>
            </RevealSection>
          </div>
        </section>

        <section className="relative mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-10">
          <div className="absolute inset-0">
            <ParallaxLayer className="absolute inset-0" yRange={[10, -10]}>
              <div className="ym-bg-curve ym-bg-breathe absolute inset-x-[-6%] bottom-[-10%] top-[8%] opacity-[0.4]" />
            </ParallaxLayer>
          </div>

          <div className="relative grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <RevealSection>
              <div className="mx-auto max-w-[22rem] text-center sm:max-w-[30rem] lg:mx-0 lg:max-w-xl lg:text-left">
                <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/72">
                  {content.homeServices.eyebrow}
                </p>
                <h2 className="mt-5 text-4xl font-semibold leading-tight text-white sm:text-5xl">
                  {content.homeServices.title}
                </h2>
                <p className="mt-6 text-base leading-8 text-white/62">
                  {content.homeServices.description}
                </p>
                <Link
                  href={getLocalizedPath(locale, "services")}
                  data-track-event="primary_cta_click"
                  data-track-category="homepage"
                  data-track-label={content.homeServices.allServicesLabel}
                  data-track-location="services-section"
                  className="mt-8 inline-flex rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white transition hover:border-cyan-400/50 hover:bg-white/10"
                >
                  {content.homeServices.allServicesLabel}
                </Link>
              </div>
            </RevealSection>

            <RevealSection delay={0.08}>
              <div className="mx-auto w-full max-w-[42rem] lg:mx-0">
                <AmbientMedia
                  src="/images/visuals/services-ui-architecture.png"
                  alt="Interface architecture visual for service design and development"
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
                  className="group block rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-6 transition hover:border-cyan-300/28 hover:bg-white/[0.04]"
                >
                  <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/76">
                    {service.icon}
                  </p>
                  <h3 className="mt-5 text-xl font-medium text-white">
                    {service.navLabel}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-white/58">
                    {service.intro}
                  </p>
                  <span className="mt-6 inline-flex items-center gap-2 text-sm text-white/66 transition group-hover:text-white">
                    {locale === "nl" ? "Meer details" : "More detail"}
                    <span className="text-cyan-200 transition group-hover:translate-x-1">→</span>
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
                className="text-sm text-white/48 transition hover:text-white"
              >
                {service.navLabel} <span className="text-cyan-200/65">→</span>
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
          <div className="absolute inset-x-0 top-0 h-full">
            <ParallaxLayer className="absolute inset-0" yRange={[-10, 10]}>
              <div className="ym-bg-field ym-bg-drift-slow absolute inset-[-4%] opacity-[0.38]" />
            </ParallaxLayer>
          </div>
          <div className="relative grid gap-14 lg:grid-cols-[0.8fr_1.2fr]">
            <RevealSection>
              <div className="mx-auto max-w-[22rem] text-center sm:max-w-[30rem] lg:mx-0 lg:max-w-xl lg:text-left">
                <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/72">
                  {content.about.eyebrow}
                </p>
                <h2 className="mt-5 text-4xl font-semibold leading-tight text-white sm:text-5xl">
                  {content.about.title}
                </h2>
                <p className="mt-6 text-base leading-8 text-white/62">
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
          <div className="absolute inset-0">
            <ParallaxLayer className="absolute inset-0" yRange={[-10, 12]}>
              <div className="ym-bg-arc ym-bg-float-fade absolute inset-[-6%] opacity-[0.42]" />
            </ParallaxLayer>
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
