import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectPlannerPageContent } from "@/app/[locale]/project-planner/page";
import { getRouteAlternates } from "@/lib/content/routes";
import { getPlannerPageContent } from "@/lib/content/project-planner";
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

  const planner = getPlannerPageContent("nl");

  return buildMetadata({
    locale: "nl",
    pathname: "/nl/projectplanner",
    title: planner.metaTitle,
    description: planner.metaDescription,
    alternates: getRouteAlternates("projectPlanner"),
  });
}

export async function generateStaticParams() {
  return [{ locale: "nl" }];
}

export default async function DutchProjectPlannerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (locale !== "nl") {
    notFound();
  }

  return <ProjectPlannerPageContent locale="nl" />;
}
