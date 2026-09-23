import { pageTypeFromPath } from "@/lib/analytics/page-type";
import type { PageType } from "@/lib/analytics/events";
import { serviceDefinitions, type ServiceKey } from "@/lib/content/services";
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
