import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AmbientMedia from "@/components/ambient-media";
import BrandMark from "@/components/brand-mark";
import ContactPanel from "@/components/contact-panel";
import JsonLd from "@/components/json-ld";
import ParallaxLayer from "@/components/parallax-layer";
import ProcessBlock from "@/components/process-block";
import RevealSection from "@/components/reveal-section";
import ServiceCard from "@/components/service-card";
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
  const projects = content.projects;
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
              <div className="ym-bg-field ym-bg-drift-slow absolute inset-[-4%] opacity-[0.72]" />
            </ParallaxLayer>
            <ParallaxLayer className="absolute inset-0" yRange={[12, -12]}>
              <div className="ym-bg-arc ym-bg-float-fade absolute inset-[-6%] opacity-[0.76]" />
            </ParallaxLayer>
          </div>

          <div className="grid items-center gap-10 lg:min-h-[82vh] lg:grid-cols-[0.86fr_1.14fr]">
            <RevealSection className="relative z-10">
              <div className="max-w-2xl">
                <div className="mb-8 flex items-center gap-4">
                  <div className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[11px] uppercase tracking-[0.32em] text-cyan-200/78">
                    {content.hero.eyebrow}
                  </div>
                  <div className="hidden h-px flex-1 bg-gradient-to-r from-white/20 to-transparent sm:block" />
                </div>

                <h1 className="text-balance max-w-5xl text-[3.4rem] font-semibold leading-[0.94] text-white sm:text-[4.7rem] lg:text-[6.2rem]">
                  {content.hero.title}
                </h1>
                <p className="mt-7 max-w-2xl text-lg leading-8 text-white/66">
                  {content.hero.description}
                </p>

                <div className="mt-10 flex flex-wrap gap-4">
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

                <div className="mt-14 max-w-xl border-t border-white/10 pt-6">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/74">
                    {content.hero.cardEyebrow}
                  </p>
                  <p className="mt-4 text-sm leading-7 text-white/64">
                    {content.hero.cardText}
                  </p>
                  <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
                    {services.slice(0, 3).map((service) => (
                      <Link
                        key={service.path}
                        href={service.path}
                        data-track-event="service_cta_click"
                        data-track-category="homepage"
                        data-track-label={service.navLabel}
                        data-track-location="hero-service-links"
                        className="text-sm text-white/72 transition hover:text-white"
                      >
                        {service.navLabel} <span className="text-cyan-200/75">→</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </RevealSection>

            <RevealSection delay={0.08} className="relative">
              <ParallaxLayer className="absolute inset-x-[12%] bottom-[-6%]" yRange={[-12, 12]}>
                <div className="h-36 rounded-full bg-cyan-300/10 blur-3xl" />
              </ParallaxLayer>
              <ParallaxLayer yRange={[-22, 18]} scaleRange={[1.01, 1.04]}>
                <AmbientMedia
                  src="/images/visuals/hero-master-visual.png"
                  alt="YM Creations premium hero visual"
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
                <div className="max-w-sm border-t border-white/12 pt-4 text-sm leading-7 text-white/70">
                  A premium digital system built around clarity, interface rhythm, and sharp implementation.
                </div>
              </div>
            </RevealSection>
          </div>
        </section>

        <section className="relative mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-10">
          <div className="absolute inset-x-0 top-0 h-full">
            <ParallaxLayer className="absolute inset-0" yRange={[10, -10]}>
              <div className="ym-bg-curve ym-bg-breathe absolute inset-x-[-8%] bottom-[-8%] top-[8%] opacity-[0.66]" />
            </ParallaxLayer>
          </div>
          <div className="relative grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <RevealSection>
              <div className="max-w-2xl">
                <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/72">
                  {content.homeServices.eyebrow}
                </p>
                <h2 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
                  {content.homeServices.title}
                </h2>
                <p className="mt-6 max-w-2xl text-base leading-8 text-white/64">
                  {content.homeServices.description}
                </p>
              </div>
            </RevealSection>
            <RevealSection delay={0.08}>
              <div className="space-y-4">
                {services.slice(0, 3).map((service) => (
                  <Link
                    key={service.path}
                    href={service.path}
                    data-track-event="service_cta_click"
                    data-track-category="homepage"
                    data-track-label={service.navLabel}
                    data-track-location="services-top-links"
                    className="flex items-center justify-between border-b border-white/10 pb-4 text-sm text-white/72 transition duration-300 hover:text-white"
                  >
                    <span className="flex items-center gap-3">
                      <span className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/72">
                        {service.icon}
                      </span>
                      <span>{service.navLabel}</span>
                    </span>
                    <span className="text-cyan-200/75">→</span>
                  </Link>
                ))}
              </div>
            </RevealSection>
          </div>

          <div className="relative mt-14 grid gap-8 lg:grid-cols-[1.18fr_0.82fr]">
            <RevealSection>
              <div className="relative min-h-[560px] overflow-hidden rounded-[2.5rem] border border-white/10">
                <ParallaxLayer className="absolute inset-0" yRange={[-16, 16]} scaleRange={[1.01, 1.05]}>
                  <Image
                    src="/images/visuals/services-system-visual.png"
                    alt="Services system visual"
                    fill
                    sizes="(min-width: 1024px) 56vw, 100vw"
                    className="object-cover object-center"
                  />
                </ParallaxLayer>
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,7,12,0.18),rgba(4,7,12,0.8)_58%,rgba(4,7,12,0.96))]" />
                <div className="absolute left-6 top-6 rounded-full border border-white/10 bg-black/30 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-cyan-200/75 backdrop-blur">
                  System direction
                </div>
                <div className="absolute bottom-6 left-6 max-w-xl">
                  <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/72">
                    Featured service architecture
                  </p>
                  <h3 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
                    {services[0]?.navLabel}
                  </h3>
                  <p className="mt-4 max-w-lg text-sm leading-7 text-white/68">
                    {services[0]?.intro}
                  </p>
                  {services[0] ? (
                    <Link
                      href={services[0].path}
                      data-track-event="service_cta_click"
                      data-track-category="homepage"
                      data-track-label={services[0].navLabel}
                      data-track-location="featured-service"
                      className="mt-7 inline-flex items-center gap-3 rounded-full border border-white/15 bg-black/35 px-5 py-3 text-sm font-medium text-white transition hover:border-cyan-300/40"
                    >
                      {services[0].navLabel}
                      <span className="text-cyan-200">→</span>
                    </Link>
                  ) : null}
                </div>
              </div>
            </RevealSection>

            <div className="grid content-start gap-6">
              {services.slice(1, 4).map((service, index) => (
                <RevealSection key={service.path} delay={index * 0.05}>
                  <Link
                    href={service.path}
                    data-track-event="service_cta_click"
                    data-track-category="homepage"
                    data-track-label={service.navLabel}
                    data-track-location="services-side-list"
                    className="block border-b border-white/10 pb-5 text-white/72 transition hover:text-white"
                  >
                    <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/72">
                      {service.icon}
                    </p>
                    <p className="mt-3 text-xl font-medium text-white">
                      {service.navLabel}
                    </p>
                    <p className="mt-3 text-sm leading-7 text-white/62">
                      {service.intro}
                    </p>
                  </Link>
                </RevealSection>
              ))}
              {services[4] ? (
                <RevealSection delay={0.18}>
                  <ServiceCard service={services[4]} />
                </RevealSection>
              ) : null}
            </div>
          </div>

          <div className="mt-10">
            <Link
              href={getLocalizedPath(locale, "services")}
              data-track-event="primary_cta_click"
              data-track-category="homepage"
              data-track-label={content.homeServices.allServicesLabel}
              data-track-location="services-section"
              className="inline-flex rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white transition hover:border-cyan-400/50 hover:bg-white/10"
            >
              {content.homeServices.allServicesLabel}
            </Link>
          </div>
        </section>

        <section className="relative mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-10">
          <div className="absolute inset-0">
            <ParallaxLayer className="absolute inset-0" yRange={[-14, 14]}>
              <div className="ym-bg-sweep ym-bg-orbit absolute inset-x-[-10%] top-[10%] h-[28rem] opacity-[0.58]" />
            </ParallaxLayer>
          </div>
          <div className="relative grid gap-10 lg:grid-cols-[0.84fr_1.16fr] lg:items-center">
            <RevealSection>
              <div className="max-w-xl">
                <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/72">
                  {projects.eyebrow}
                </p>
                <h2 className="mt-5 text-4xl font-semibold leading-tight text-white sm:text-5xl">
                  {projects.title}
                </h2>
                <p className="mt-6 text-base leading-8 text-white/64">
                  {projects.description}
                </p>
                <div className="mt-10 space-y-4">
                  {projects.stages.map((stage, index) => (
                    <div key={stage} className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-300/20 bg-white/[0.03] text-xs text-cyan-200">
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-sm uppercase tracking-[0.26em] text-white/84">
                          {stage}
                        </p>
                        <p className="mt-1 text-sm leading-7 text-white/52">
                          {projects.sideTexts[index]}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </RevealSection>

            <RevealSection delay={0.08}>
              <div className="relative min-h-[640px] overflow-hidden rounded-[2.6rem] border border-white/10">
                <ParallaxLayer className="absolute inset-0" yRange={[-24, 24]} scaleRange={[1.02, 1.06]}>
                  <Image
                    src="/images/visuals/projects-transformation-visual.png"
                    alt="Projects transformation visual"
                    fill
                    sizes="(min-width: 1024px) 54vw, 100vw"
                    className="object-cover object-center"
                  />
                </ParallaxLayer>
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,7,12,0.15),rgba(4,7,12,0.76)_52%,rgba(4,7,12,0.96))]" />
                <div className="absolute right-6 top-6 rounded-full border border-white/10 bg-black/35 px-4 py-2 text-[10px] uppercase tracking-[0.28em] text-cyan-200/75 backdrop-blur">
                  {projects.conceptLabel}
                </div>
                <div className="absolute bottom-6 left-6 right-6">
                  <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                    <div className="max-w-lg border-t border-white/12 pt-4">
                      <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/72">
                        {projects.itemTitle}
                      </p>
                      <p className="mt-3 text-sm leading-7 text-white/68">
                        {projects.itemText}
                      </p>
                    </div>
                    <Link
                      href={projects.overviewPath}
                      data-track-event="primary_cta_click"
                      data-track-category="homepage"
                      data-track-label={projects.overviewLabel}
                      data-track-location="projects-panel"
                      className="inline-flex rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition hover:border-cyan-400/50 hover:bg-white/10"
                    >
                      {projects.overviewLabel}
                    </Link>
                  </div>
                </div>
              </div>
            </RevealSection>
          </div>
        </section>

        <section
          id="process"
          className="relative mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-10"
        >
          <div className="absolute inset-x-0 top-0 h-full">
            <ParallaxLayer className="absolute inset-0" yRange={[-10, 10]}>
              <div className="ym-bg-field ym-bg-drift-slow absolute inset-[-4%] opacity-[0.48]" />
            </ParallaxLayer>
          </div>
          <div className="relative grid gap-14 lg:grid-cols-[0.8fr_1.2fr]">
            <RevealSection>
              <div className="max-w-xl">
                <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/72">
                  {content.about.eyebrow}
                </p>
                <h2 className="mt-5 text-4xl font-semibold leading-tight text-white sm:text-5xl">
                  {content.about.title}
                </h2>
                <p className="mt-6 text-base leading-8 text-white/64">
                  {content.about.description}
                </p>
              </div>
            </RevealSection>
            <RevealSection delay={0.08}>
              <ProcessBlock
                title={locale === "nl" ? "Hoe het traject meestal verloopt" : "How the process usually works"}
                steps={processSteps[locale]}
              />
            </RevealSection>
          </div>
        </section>

        <section className="relative mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-10">
          <div className="absolute inset-0">
            <ParallaxLayer className="absolute inset-0" yRange={[-10, 12]}>
              <div className="ym-bg-arc ym-bg-float-fade absolute inset-[-6%] opacity-[0.56]" />
            </ParallaxLayer>
          </div>
          <div className="relative">
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
