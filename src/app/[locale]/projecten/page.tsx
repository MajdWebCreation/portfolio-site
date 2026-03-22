import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectsPageContent } from "@/app/[locale]/projects/page";
import { projectsOverviewContent } from "@/lib/content/projects";
import { getRouteAlternates } from "@/lib/content/routes";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (locale !== "nl") {
    return {};
  }

  return buildMetadata({
    locale: "nl",
    pathname: "/nl/projecten",
    title: projectsOverviewContent.nl.metaTitle,
    description: projectsOverviewContent.nl.metaDescription,
    alternates: getRouteAlternates("projects"),
  });
}

export async function generateStaticParams() {
  return [{ locale: "nl" }];
}

export default async function DutchProjectsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const resolved = await params;

  if (resolved.locale !== "nl") {
    notFound();
  }

  return <ProjectsPageContent locale="nl" />;
}
