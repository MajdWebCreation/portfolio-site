import { getLocalizedPath } from "@/lib/content/routes";
import { siteContent, type Locale } from "@/lib/content/site-content";

/**
 * The trail from the home page to the page a visitor is on.
 *
 * One builder per kind of page, and one trail per page: the visible navigation
 * and the BreadcrumbList markup both read the crumbs from here, so the two can
 * never say something different. The labels are the ones the navigation
 * already uses -- "Diensten" and "Inzichten" in Dutch, "Services" and
 * "Insights" in English -- because the trail has to match the route a visitor
 * actually walks.
 *
 * A trail only ever contains pages that exist in that language. There is no
 * category level between the index and a page, because this site has none.
 */
export type Crumb = {
  name: string;
  path: string;
};

const homeName: Record<Locale, string> = {
  nl: "Home",
  en: "Home",
};

/** The `aria-label` on the navigation element, per language. */
export const breadcrumbLabel: Record<Locale, string> = {
  nl: "Kruimelpad",
  en: "Breadcrumb",
};

function homeCrumb(locale: Locale): Crumb {
  return { name: homeName[locale], path: getLocalizedPath(locale, "home") };
}

export function getServiceBreadcrumbs(
  locale: Locale,
  service: { navLabel: string; path: string; overviewPath: string },
): Crumb[] {
  return [
    homeCrumb(locale),
    { name: siteContent[locale].nav.services, path: service.overviewPath },
    { name: service.navLabel, path: service.path },
  ];
}

export function getArticleBreadcrumbs(
  locale: Locale,
  article: { title: string; path: string },
): Crumb[] {
  return [
    homeCrumb(locale),
    { name: siteContent[locale].nav.blog, path: getLocalizedPath(locale, "blog") },
    { name: article.title, path: article.path },
  ];
}

export function getCaseBreadcrumbs(
  locale: Locale,
  caseStudy: { name: string; path: string },
): Crumb[] {
  return [
    homeCrumb(locale),
    { name: siteContent[locale].nav.projects, path: getLocalizedPath(locale, "projects") },
    { name: caseStudy.name, path: caseStudy.path },
  ];
}
