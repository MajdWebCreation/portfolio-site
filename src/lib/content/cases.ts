import { type Locale } from "@/lib/content/site-content";

export type CaseStudyDefinition = {
  id: string;
  slug: Record<Locale, string>;
  title: Record<Locale, string>;
  description: Record<Locale, string>;
  isPublished: boolean;
};

export const caseStudies: CaseStudyDefinition[] = [];

export function getCaseStudyBySlug(locale: Locale, slug: string) {
  return (
    caseStudies.find(
      (caseStudy) => caseStudy.isPublished && caseStudy.slug[locale] === slug,
    ) ?? null
  );
}
