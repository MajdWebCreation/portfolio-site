import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CtaLink from "@/components/cta-link";
import JsonLd from "@/components/json-ld";
import PageHeader from "@/components/page-header";
import ProjectPlanner from "@/components/project-planner";
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
  const path = getLocalizedPath(locale, "projectPlanner");

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
        <PageHeader
          label={planner.hero.eyebrow}
          title={planner.hero.title}
          intro={planner.hero.description}
        >
          <CtaLink
            href={getLocalizedPath(locale, "contact")}
            variant="text"
            data-track-event="contact_cta_click"
            data-track-category="project-planner"
            data-track-label="contact"
            data-track-location="planner-header"
          >
            {locale === "nl"
              ? "Liever een kort bericht? Ga naar contact"
              : "Prefer a short message? Go to contact"}
          </CtaLink>
        </PageHeader>

        <section className="container-x pt-12 lg:pt-16">
          <div className="rounded-md bg-ink p-5 text-paper sm:p-8 lg:p-10">
            <ProjectPlanner locale={locale} />
          </div>
        </section>
      </SiteShell>
    </>
  );
}
