import type { MetadataRoute } from "next";
import { getPublishedArticles } from "@/lib/content/articles";
import { getCaseStudyPath, getPublishedCaseStudyPaths } from "@/lib/content/cases";
import {
  getLocalizedPath,
  legalRoutes,
  type StaticRouteKey,
} from "@/lib/content/routes";
import { serviceDefinitions, serviceKeys } from "@/lib/content/services";
import { cookieStatement } from "@/lib/content/cookies";
import { privacyStatement } from "@/lib/content/privacy";
import { businessInfo, locales } from "@/lib/content/site-content";
import { termsIndexable } from "@/lib/content/terms";

const staticRoutes: StaticRouteKey[] = [
  "home",
  "services",
  "projects",
  "pricing",
  "projectPlanner",
  "process",
  "blog",
  "contact",
];

/* A scheduled article belongs in the sitemap from its publication date on. */
export const revalidate = 3600;

function absolute(path: string) {
  return `${businessInfo.websiteUrl}${path}`;
}

function withAlternates(path: string, en: string, nl: string) {
  return {
    url: absolute(path),
    alternates: {
      languages: {
        nl: absolute(nl),
        en: absolute(en),
        "x-default": absolute(nl),
      },
    },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = staticRoutes.flatMap((route) =>
    locales.map((locale) =>
      withAlternates(
        getLocalizedPath(locale, route),
        getLocalizedPath("en", route),
        getLocalizedPath("nl", route),
      ),
    ),
  );

  const serviceEntries: MetadataRoute.Sitemap = serviceKeys.flatMap((key) => {
    const definition = serviceDefinitions[key];
    const en = `/en/services/${definition.locale.en.slug}`;
    const nl = `/nl/diensten/${definition.locale.nl.slug}`;

    return [withAlternates(nl, en, nl), withAlternates(en, en, nl)];
  });

  /*
    Cases, per locale and only where one is written. A case that exists in
    Dutch alone is listed once, without alternates: there is no counterpart to
    point at and no placeholder to invent. No lastModified either -- nothing
    in the case records when it was written, and a date made up here would say
    "fresh" without meaning it.
  */
  const caseEntries: MetadataRoute.Sitemap = locales.flatMap((locale) =>
    getPublishedCaseStudyPaths(locale).map((slug) => ({
      url: absolute(getCaseStudyPath(locale, slug)),
    })),
  );

  // Published articles only: the database hands out no other kind, so a
  // draft cannot reach the sitemap.
  const articlesPerLocale = await Promise.all(locales.map((locale) => getPublishedArticles(locale)));
  const articleEntries: MetadataRoute.Sitemap = articlesPerLocale.flat().map((article) => ({
    url: absolute(article.path),
    ...(article.publishedAt ? { lastModified: new Date(article.publishedAt) } : {}),
  }));

  // Legal pages are listed only once they are indexable (they are served
  // with noindex until then). The terms are Dutch only; the privacy and
  // cookie statements exist per locale, with alternates like any page.
  const statementRoutes = [
    ...(privacyStatement.indexable ? (["privacy"] as const) : []),
    ...(cookieStatement.indexable ? (["cookies"] as const) : []),
  ];
  const legalEntries: MetadataRoute.Sitemap = [
    ...(termsIndexable ? [{ url: absolute(legalRoutes.terms) }] : []),
    ...statementRoutes.flatMap((route) =>
      locales.map((locale) =>
        withAlternates(
          getLocalizedPath(locale, route),
          getLocalizedPath("en", route),
          getLocalizedPath("nl", route),
        ),
      ),
    ),
  ];

  return [
    ...staticEntries,
    ...serviceEntries,
    ...caseEntries,
    ...articleEntries,
    ...legalEntries,
  ];
}
