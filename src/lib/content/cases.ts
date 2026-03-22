import { type Locale } from "@/lib/content/site-content";

export type CaseStudyMetric = {
  label: string;
  value: string;
  context?: string;
};

export type CaseStudyMedia = {
  src: string;
  alt: string;
  width?: number;
  height?: number;
};

export type CaseStudyLocaleContent = {
  slug: string;
  title: string;
  summary: string;
  description: string;
  challenge: string;
  approach: string;
  solution: string;
  outcome: string;
  techStack: string[];
  screenshots: CaseStudyMedia[];
  relatedServices: string[];
  metrics?: CaseStudyMetric[];
  isPublished: boolean;
};

export type CaseStudyDefinition = {
  id: string;
  locale: Partial<Record<Locale, CaseStudyLocaleContent>>;
};

export const caseStudies: CaseStudyDefinition[] = [];

export function getCaseStudyBySlug(locale: Locale, slug: string) {
  return (
    caseStudies
      .map((caseStudy) => {
        const localized = caseStudy.locale[locale];

        if (!localized || !localized.isPublished) {
          return null;
        }

        return {
          id: caseStudy.id,
          ...localized,
        };
      })
      .find((caseStudy) => caseStudy?.slug === slug) ?? null
  );
}

export function getPublishedCaseStudyPaths(locale: Locale) {
  return caseStudies.flatMap((caseStudy) => {
    const localized = caseStudy.locale[locale];

    if (!localized || !localized.isPublished) {
      return [];
    }

    return [localized.slug];
  });
}
