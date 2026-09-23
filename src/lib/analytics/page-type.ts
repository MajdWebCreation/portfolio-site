import type { PageType } from "@/lib/analytics/events";
import type { Locale } from "@/lib/content/site-content";

/**
 * What kind of page a path is, for the `page_type` every event carries.
 *
 * Derived from the path alone, so a server component and the click
 * delegation agree without either knowing the other. The Dutch and English
 * routes of one page map to the same type; the language is a separate
 * parameter (`locale`).
 *
 * Kept as string matching rather than a lookup through routes.ts on
 * purpose: this runs in the browser on every tracked click, and the route
 * table is not needed for it.
 */
const segments: Record<string, { index: PageType; detail: PageType }> = {
  diensten: { index: "services", detail: "service" },
  services: { index: "services", detail: "service" },
  tarieven: { index: "pricing", detail: "pricing" },
  pricing: { index: "pricing", detail: "pricing" },
  projectplanner: { index: "planner", detail: "planner" },
  "project-planner": { index: "planner", detail: "planner" },
  contact: { index: "contact", detail: "contact" },
  blog: { index: "blog", detail: "article" },
  projecten: { index: "projects", detail: "case" },
  projects: { index: "projects", detail: "case" },
  werkwijze: { index: "process", detail: "process" },
  "how-we-work": { index: "process", detail: "process" },
  privacy: { index: "legal", detail: "legal" },
  cookies: { index: "legal", detail: "legal" },
  "algemene-voorwaarden": { index: "legal", detail: "legal" },
  betaling: { index: "payment", detail: "payment" },
  incasso: { index: "payment", detail: "payment" },
};

function parts(pathname: string): string[] {
  return pathname.split("?")[0].split("#")[0].split("/").filter(Boolean);
}

export function localeFromPath(pathname: string): Locale {
  const first = parts(pathname)[0];
  return first === "en" ? "en" : "nl";
}

export function pageTypeFromPath(pathname: string): PageType {
  const [first, second, third] = parts(pathname);
  if (first !== "nl" && first !== "en") return "other";
  if (!second) return "home";
  const entry = segments[second];
  if (!entry) return "other";
  return third ? entry.detail : entry.index;
}
