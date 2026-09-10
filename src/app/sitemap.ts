import type { MetadataRoute } from "next";
import { getPublishedArticles } from "@/lib/content/articles";
import {
  getLocalizedPath,
  legalRoutes,
  type StaticRouteKey,
} from "@/lib/content/routes";
import { serviceDefinitions, serviceKeys } from "@/lib/content/services";
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

  // Published articles only: the database hands out no other kind, so a
  // draft cannot reach the sitemap.
  const articlesPerLocale = await Promise.all(locales.map((locale) => getPublishedArticles(locale)));
  const articleEntries: MetadataRoute.Sitemap = articlesPerLocale.flat().map((article) => ({
    url: absolute(article.path),
    ...(article.publishedAt ? { lastModified: new Date(article.publishedAt) } : {}),
  }));

  // The terms page is Dutch only and is listed only once it is indexable
  // (it is served with noindex until then).
  const legalEntries: MetadataRoute.Sitemap = termsIndexable
    ? [{ url: absolute(legalRoutes.terms) }]
    : [];

  return [...staticEntries, ...serviceEntries, ...articleEntries, ...legalEntries];
}
