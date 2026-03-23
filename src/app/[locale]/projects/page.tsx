import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/json-ld";
import RevealSection from "@/components/reveal-section";
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
          <div className="ym-bg-sweep ym-bg-orbit absolute inset-x-[-10%] top-[10%] h-[24rem] opacity-[0.46]" />

          <div className="relative grid gap-10 lg:grid-cols-[0.96fr_1.04fr] lg:items-end">
            <RevealSection>
              <div className="mx-auto max-w-[22rem] text-center sm:max-w-[30rem] lg:mx-0 lg:max-w-2xl lg:text-left">
                <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/72">
                  {overview.eyebrow}
                </p>
                <h1 className="mt-5 text-balance text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
                  {overview.title}
                </h1>
                <p className="mx-auto mt-6 max-w-[22rem] text-base leading-8 text-white/62 sm:max-w-[30rem] lg:mx-0 lg:max-w-xl">
                  {overview.intro}
                </p>
              </div>
            </RevealSection>

            <RevealSection delay={0.08}>
              <div className="mx-auto w-full max-w-[42rem] lg:mx-0">
                <div className="relative min-h-[420px] overflow-hidden rounded-[2.5rem] border border-white/10">
                  <Image
                    src="/images/visuals/projects-ui-showcase.png"
                    alt="Interface showcase representing project execution and refinement"
                    fill
                    sizes="(min-width: 1024px) 50vw, 100vw"
                    className="object-cover object-center"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,7,12,0.18),rgba(4,7,12,0.82)_65%,rgba(4,7,12,0.96))]" />
                </div>
              </div>
            </RevealSection>
          </div>

          <div className="relative mt-14 grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <RevealSection>
              <div className="mx-auto max-w-[42rem] lg:mx-0 lg:max-w-xl">
                <p className="text-center text-[10px] uppercase tracking-[0.28em] text-cyan-300/76 lg:text-left">
                  {overview.highlightsTitle}
                </p>

                <div className="mt-6 space-y-5">
                  {overview.highlights.map((highlight) => (
                    <div key={highlight} className="border-b border-white/8 pb-5 last:border-b-0 last:pb-0">
                      <p className="text-center text-base leading-8 text-white/64 lg:text-left">
                        {highlight}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-3 lg:justify-start">
                  <Link
                    href={content.contact.pagePath}
                    data-track-event="contact_cta_click"
                    data-track-category="projects-overview"
                    data-track-label={locale === "nl" ? "Bespreek een project" : "Discuss a project"}
                    data-track-location="projects-links"
                    className="text-sm text-white/54 transition hover:text-white"
                  >
                    {locale === "nl" ? "Bespreek een project" : "Discuss a project"}{" "}
                    <span className="text-cyan-200/65">→</span>
                  </Link>
                  <Link
                    href={getLocalizedPath(locale, "services")}
                    data-track-event="primary_cta_click"
                    data-track-category="projects-overview"
                    data-track-label={locale === "nl" ? "Diensten" : "Services"}
                    data-track-location="projects-links"
                    className="text-sm text-white/54 transition hover:text-white"
                  >
                    {locale === "nl" ? "Bekijk diensten" : "View services"}{" "}
                    <span className="text-cyan-200/65">→</span>
                  </Link>
                </div>
              </div>
            </RevealSection>

            <RevealSection delay={0.08}>
              <div className="mx-auto max-w-[42rem] rounded-[2.3rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-6 md:p-8 lg:mx-0">
                <p className="text-center text-[10px] uppercase tracking-[0.28em] text-cyan-300/76 lg:text-left">
                  {content.projects.premiumBuildLabel}
                </p>
                <p className="mx-auto mt-5 max-w-2xl text-center text-base leading-8 text-white/62 lg:mx-0 lg:text-left">
                  {content.projects.premiumBuildText}
                </p>

                <div className="mt-8 grid gap-5 md:grid-cols-2">
                  {content.projects.stages.map((stage, index) => (
                    <div
                      key={stage}
                      className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5"
                    >
                      <p className="text-[10px] uppercase tracking-[0.26em] text-cyan-300/74">
                        {String(index + 1).padStart(2, "0")} / {stage}
                      </p>
                      <p className="mt-4 text-sm leading-7 text-white/58">
                        {content.projects.sideTexts[index]}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </RevealSection>
          </div>

          <div className="mt-14 border-t border-white/10 pt-8">
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 lg:justify-start">
              <Link
                href={getLocalizedPath(locale, "blog")}
                data-track-event="primary_cta_click"
                data-track-category="projects-overview"
                data-track-label={locale === "nl" ? "Inzichten" : "Insights"}
                data-track-location="projects-bottom-links"
                className="text-sm text-white/48 transition hover:text-white"
              >
                {locale === "nl"
                  ? "Lees meer over aanpak en uitvoering"
                  : "Read more about approach and execution"}{" "}
                <span className="text-cyan-200/65">→</span>
              </Link>

              <Link
                href={getLocalizedPath(locale, "contact")}
                data-track-event="contact_cta_click"
                data-track-category="projects-overview"
                data-track-label={locale === "nl" ? "Contact" : "Contact"}
                data-track-location="projects-bottom-links"
                className="text-sm text-white/48 transition hover:text-white"
              >
                {locale === "nl"
                  ? "Neem contact op voor projectcontext"
                  : "Get in touch for project context"}{" "}
                <span className="text-cyan-200/65">→</span>
              </Link>
            </div>
          </div>
        </section>

        <SiteFooter locale={locale} content={content.footer} />
      </SiteShell>
    </>
  );
}
