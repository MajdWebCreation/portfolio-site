import { campaignRoutes, getLocalizedPath } from "@/lib/content/routes";
import { getServicesForLocale } from "@/lib/content/services";
import { locales } from "@/lib/content/site-content";

/**
 * Every path that renders an amount from the pricing catalog, including the
 * editor itself. A saved price or discount refreshes all of them at once, so
 * an admin change never waits for the catalog's regular revalidation.
 */
export function pricingPaths(): string[] {
  const paths = ["/admin/prijzen"];

  for (const locale of locales) {
    paths.push(getLocalizedPath(locale, "pricing"), getLocalizedPath(locale, "projectPlanner"));

    /* Service pages that state a project type's starting price in the header. */
    for (const service of getServicesForLocale(locale)) {
      if (service.pricePackage) paths.push(service.path);
    }
  }

  /* The websitecheck landing page shows the campaign on development costs. */
  paths.push(campaignRoutes.websitecheck);

  return paths;
}
