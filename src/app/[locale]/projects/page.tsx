import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/json-ld";
import RevealSection from "@/components/reveal-section";
import SeoCta from "@/components/seo-cta";
import SectionHeading from "@/components/section-heading";
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

          <div className="mt-12 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <RevealSection>
              <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 backdrop-blur md:p-8">
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
              <div className="rounded-[2rem] border border-white/10 bg-black/35 p-6 md:p-8">
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
          />
          <div className="mt-4">
            <Link
              href={getLocalizedPath(locale, "contact")}
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
