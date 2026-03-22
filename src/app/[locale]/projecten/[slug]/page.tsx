import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getCaseStudyBySlug,
  getPublishedCaseStudyPaths,
} from "@/lib/content/cases";
import { buildMetadata } from "@/lib/seo";
import { isValidLocale } from "@/lib/content/site-content";

export const dynamicParams = false;

export async function generateStaticParams() {
  return getPublishedCaseStudyPaths("nl").map((slug) => ({
    locale: "nl",
    slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;

  if (!isValidLocale(locale) || locale !== "nl") {
    return {};
  }

  const caseStudy = getCaseStudyBySlug(locale, slug);

  if (!caseStudy) {
    return {
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  return buildMetadata({
    locale,
    pathname: `/nl/projecten/${slug}`,
    title: caseStudy.title,
    description: caseStudy.description,
  });
}

export default async function DutchProjectCasePage() {
  notFound();
}
