import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/json-ld";
import RevealSection from "@/components/reveal-section";
import SeoCta from "@/components/seo-cta";
import SiteFooter from "@/components/site-footer";
import SiteShell from "@/components/site-shell";
import { projectsOverviewContent } from "@/lib/content/projects";
import { getRouteAlternates } from "@/lib/content/routes";
import { buildMetadata, getCanonicalUrl } from "@/lib/seo";
import { collectionPageSchema } from "@/lib/schema";
import { isValidLocale, siteContent, type Locale } from "@/lib/content/site-content";
import { getLocalizedPath } from "@/lib/content/routes";

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
    pathname: "/en/projects",
    title: projectsOverviewContent.en.metaTitle,
    description: projectsOverviewContent.en.metaDescription,
    alternates: getRouteAlternates("projects"),
  });
}

export async function generateStaticParams() {
  return [{ locale: "en" }];
}

export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (locale !== "en" || !isValidLocale(locale)) {
    notFound();
  }

  return <ProjectsPageContent locale={locale} />;
}

export function ProjectsPageContent({ locale }: { locale: Locale }) {
  const content = siteContent[locale];
  const overview = projectsOverviewContent[locale];
  const path = locale === "nl" ? "/nl/projecten" : "/en/projects";

  return (
    <>
      <JsonLd
        data={collectionPageSchema({
          name: overview.metaTitle,
          description: overview.metaDescription,
          url: getCanonicalUrl(path),
        })}
      />
      <SiteShell locale={locale} content={content} currentPath={path}>
        <section className="relative mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-10 lg:py-20">
          <div className="absolute inset-0">
            <Image
              src="/images/visuals/ambient-texture-sweeping-streak.png"
              alt=""
              fill
              sizes="100vw"
              className="object-cover opacity-16"
            />
          </div>
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
              <div className="relative min-h-[420px] overflow-hidden rounded-[2.4rem] border border-white/10">
                <Image
                  src="/images/visuals/projects-transformation-visual.png"
                  alt="Projects transformation visual"
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover object-center"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,7,12,0.18),rgba(4,7,12,0.82)_65%,rgba(4,7,12,0.96))]" />
              </div>
            </RevealSection>
          </div>

          <div className="relative mt-12 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <RevealSection>
              <div className="rounded-[2.2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-6 md:p-8">
                <h2 className="text-3xl font-semibold text-white">
                  {overview.highlightsTitle}
                </h2>
                <ul className="mt-6 space-y-4">
                  {overview.highlights.map((highlight) => (
                    <li
                      key={highlight}
                      className="rounded-[1.25rem] border border-white/10 bg-black/35 px-4 py-4 text-sm leading-7 text-white/68"
                    >
                      {highlight}
                    </li>
                  ))}
                </ul>
              </div>
            </RevealSection>

            <RevealSection delay={0.08}>
              <div className="rounded-[2.2rem] border border-white/10 bg-black/35 p-6 md:p-8">
                <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/75">
                  {content.projects.premiumBuildLabel}
                </p>
                <p className="mt-4 text-base leading-8 text-white/65">
                  {content.projects.premiumBuildText}
                </p>
                <div className="mt-8 space-y-4">
                  {content.projects.stages.map((stage, index) => (
                    <div key={stage} className="flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-cyan-400/25 bg-cyan-400/8 text-sm text-cyan-200">
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-sm uppercase tracking-[0.22em] text-cyan-300/75">
                          {stage}
                        </p>
                        <p className="mt-2 text-sm leading-7 text-white/62">
                          {content.projects.sideTexts[index]}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <Link
                  href={content.contact.pagePath}
                  data-track-event="contact_cta_click"
                  data-track-category="projects-overview"
                  data-track-label={locale === "nl" ? "Bespreek een project" : "Discuss a project"}
                  data-track-location="projects-panel"
                  className="mt-8 inline-flex rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white transition hover:border-cyan-400/50 hover:bg-white/10"
                >
                  {locale === "nl" ? "Bespreek een project" : "Discuss a project"}
                </Link>
              </div>
            </RevealSection>
          </div>
        </section>
        <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
          <SeoCta
            title={
              locale === "nl"
                ? "Meer context rond het werk?"
                : "Need more context around the work?"
            }
            text={
              locale === "nl"
                ? "Bekijk de diensten, lees de inzichten-sectie of neem direct contact op om een projectrichting te bespreken."
                : "Explore the services, read the insights section, or get in touch directly to discuss a project direction."
            }
            primaryLabel={locale === "nl" ? "Bekijk diensten" : "View services"}
            primaryHref={getLocalizedPath(locale, "services")}
            secondaryLabel={locale === "nl" ? "Naar inzichten" : "Go to insights"}
            secondaryHref={getLocalizedPath(locale, "blog")}
            trackingContext="projects"
          />
          <div className="mt-4">
            <Link
              href={getLocalizedPath(locale, "contact")}
              data-track-event="contact_cta_click"
              data-track-category="projects-overview"
              data-track-label={locale === "nl" ? "Neem contact op" : "Contact us"}
              data-track-location="projects-cta"
              className="inline-flex rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white transition hover:border-cyan-400/50 hover:bg-white/10"
            >
              {locale === "nl" ? "Neem contact op" : "Contact us"}
            </Link>
          </div>
        </section>
        <SiteFooter locale={locale} content={content.footer} />
      </SiteShell>
    </>
  );
}
