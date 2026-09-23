import { localeFromPath, pageTypeFromPath } from "@/lib/analytics/page-type";
import type { PageType } from "@/lib/analytics/events";
import { getServiceBySlug, serviceDefinitions, type ServiceKey } from "@/lib/content/services";
import { plannerStepNames, type PlannerStepName } from "@/lib/analytics/events";

/**
 * From stored identifiers to what an admin reads. The queries and the
 * facts keep the identifiers; only the last step before the screen uses
 * these labels, so a renamed service does not change a series.
 */
export function pageTypeForLandingPage(landingPage: string): PageType {
  return pageTypeFromPath(landingPage);
}

export const pageTypeLabels: Record<PageType, string> = {
  home: "Home",
  services: "Diensten",
  service: "Dienst",
  pricing: "Tarieven",
  planner: "Projectplanner",
  contact: "Contact",
  blog: "Blog",
  article: "Artikel",
  projects: "Projecten",
  case: "Case",
  process: "Werkwijze",
  legal: "Juridisch",
  payment: "Betaling",
  other: "Overig",
};

function isServiceKey(value: string): value is ServiceKey {
  return Object.prototype.hasOwnProperty.call(serviceDefinitions, value);
}

/** The Dutch navigation label of a service, or the id itself for one the register does not know. */
export function serviceLabel(serviceId: string): string {
  return isServiceKey(serviceId) ? serviceDefinitions[serviceId].locale.nl.navLabel : serviceId;
}

export const plannerStepLabels: Record<PlannerStepName, string> = {
  project_type: "Projecttype",
  scope: "Scope",
  planning: "Planning",
  contact: "Contact",
};

export function isPlannerStepName(value: string): value is PlannerStepName {
  return (plannerStepNames as readonly string[]).includes(value);
}

export const plannerStepOrder = plannerStepNames;

/**
 * A page URL from a search provider, read with the site's own registers:
 * the page type from the path (the same rule the events use), the service
 * a service page belongs to (through the service register's slugs), and
 * the article slug of a blog article. Anything else is its path.
 */
export type SearchPageInfo = { path: string; pageType: PageType; serviceId: string | null; articleSlug: string | null };

export function describeSearchPage(url: string): SearchPageInfo {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    /* Not a full URL: read it as a path. */
  }
  const pageType = pageTypeFromPath(path);
  const segments = path.split("/").filter(Boolean);
  const slug = segments[2] ?? null;
  const serviceId = pageType === "service" && slug ? (getServiceBySlug(localeFromPath(path), slug)?.key ?? null) : null;
  const articleSlug = pageType === "article" && slug ? slug : null;
  return { path, pageType, serviceId, articleSlug };
}
