import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/json-ld";
import NextStep from "@/components/next-step";
import PageHeader from "@/components/page-header";
import ProjectRow from "@/components/project-row";
import SiteShell from "@/components/site-shell";
import { getProjects, projectsOverviewContent } from "@/lib/content/projects";
import { getLocalizedPath, getRouteAlternates } from "@/lib/content/routes";
import { buildMetadata, getCanonicalUrl } from "@/lib/seo";
import { collectionPageSchema } from "@/lib/schema";
import { isValidLocale, siteContent, type Locale } from "@/lib/content/site-content";

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
  const projects = getProjects();
  const path = getLocalizedPath(locale, "projects");

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
        <PageHeader title={overview.title} intro={overview.intro} />

        <section className="container-x pt-6 lg:pt-8">
          <div className="border-b border-line">
            {projects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                locale={locale}
                visitLabel={overview.visitLabel}
                builtLabel={overview.builtLabel}
                detailed
              />
            ))}
          </div>
        </section>

        <div className="mt-20 lg:mt-28">
          <NextStep
            title={
              locale === "nl"
                ? "Een vergelijkbaar project?"
                : "A similar project?"
            }
            text={
              locale === "nl"
                ? "Noem het project dat het dichtst bij je vraag komt en wat er anders moet. Dan weten we snel wat er gebouwd moet worden."
                : "Mention the project closest to your question and what should differ. Then we quickly know what needs to be built."
            }
            primaryLabel={locale === "nl" ? "Neem contact op" : "Get in touch"}
            primaryHref={getLocalizedPath(locale, "contact")}
            secondaryLabel={locale === "nl" ? "Bekijk diensten" : "View services"}
            secondaryHref={getLocalizedPath(locale, "services")}
            trackingContext="projects"
          />
        </div>
      </SiteShell>
    </>
  );
}
