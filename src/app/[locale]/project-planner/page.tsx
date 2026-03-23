import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/json-ld";
import ProjectPlanner from "@/components/project-planner";
import RevealSection from "@/components/reveal-section";
import SiteFooter from "@/components/site-footer";
import SiteShell from "@/components/site-shell";
import { getLocalizedPath, getRouteAlternates } from "@/lib/content/routes";
import { getPlannerPageContent } from "@/lib/content/project-planner";
import { buildMetadata, getCanonicalUrl } from "@/lib/seo";
import { isValidLocale, siteContent, type Locale } from "@/lib/content/site-content";
import { webPageSchema } from "@/lib/schema";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (locale !== "en") {
    return {};
  }

  const planner = getPlannerPageContent("en");

  return buildMetadata({
    locale: "en",
    pathname: "/en/project-planner",
    title: planner.metaTitle,
    description: planner.metaDescription,
    alternates: getRouteAlternates("projectPlanner"),
  });
}

export async function generateStaticParams() {
  return [{ locale: "en" }];
}

export default async function ProjectPlannerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (locale !== "en" || !isValidLocale(locale)) {
    notFound();
  }

  return <ProjectPlannerPageContent locale={locale} />;
}

export function ProjectPlannerPageContent({ locale }: { locale: Locale }) {
  const content = siteContent[locale];
  const planner = getPlannerPageContent(locale);
  const path = locale === "nl" ? "/nl/projectplanner" : "/en/project-planner";

  return (
    <>
      <JsonLd
        data={webPageSchema({
          name: planner.metaTitle,
          description: planner.metaDescription,
          url: getCanonicalUrl(path),
        })}
      />
      <SiteShell locale={locale} content={content} currentPath={path}>
        <section className="relative mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-10 lg:py-20">
          <div className="ym-bg-curve ym-bg-breathe pointer-events-none absolute inset-x-[-8%] inset-y-0 opacity-[0.46]" />

          <div className="relative grid gap-10 border-b border-white/10 pb-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-end">
            <RevealSection>
              <div className="mx-auto max-w-[22rem] text-center sm:max-w-[34rem] lg:mx-0 lg:max-w-3xl lg:text-left">
                <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/72">
                  {planner.hero.eyebrow}
                </p>
                <h1 className="mt-5 text-balance text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
                  {planner.hero.title}
                </h1>
                <p className="mt-6 max-w-2xl text-base leading-8 text-white/62 sm:text-lg">
                  {planner.hero.description}
                </p>
              </div>
            </RevealSection>

            <RevealSection delay={0.06}>
              <div className="mx-auto max-w-[42rem] border-t border-white/10 pt-6 lg:mx-0">
                <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/74">
                  {locale === "nl" ? "Twee paden" : "Two paths"}
                </p>
                <p className="mt-4 text-sm leading-7 text-white/58">
                  {locale === "nl"
                    ? "Gebruik deze planner als je eerst helder wilt krijgen welk niveau, welke functies en welke richting het best passen. Voor een korter bericht blijft de normale contactpagina gewoon beschikbaar."
                    : "Use this planner if you want clarity first on level, functionality, and direction. If you prefer a shorter message, the normal contact page remains available."}
                </p>
                <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
                  <Link
                    href={getLocalizedPath(locale, "contact")}
                    className="text-sm text-white/54 transition hover:text-white"
                  >
                    {locale === "nl" ? "Naar contact" : "Go to contact"}{" "}
                    <span className="text-cyan-200/65">→</span>
                  </Link>
                  <Link
                    href={getLocalizedPath(locale, "pricing")}
                    className="text-sm text-white/54 transition hover:text-white"
                  >
                    {locale === "nl" ? "Bekijk tarieven" : "View pricing"}{" "}
                    <span className="text-cyan-200/65">→</span>
                  </Link>
                </div>
              </div>
            </RevealSection>
          </div>

          <div className="relative z-10 mt-12">
            <ProjectPlanner locale={locale} />
          </div>
        </section>

        <SiteFooter locale={locale} content={content.footer} />
      </SiteShell>
    </>
  );
}
