import type { CtaTarget } from "@/lib/analytics/events";
import { pageTypeFromPath } from "@/lib/analytics/page-type";

/**
 * Where a link leads, as the `cta_target` class, from its href.
 *
 * Used by components that receive their destinations as props (next-step,
 * process-cta, service-cta, the article's related links) and so cannot name
 * the target in the markup by hand. Internal paths map through the same
 * table as `page_type`; anything else is "other".
 */
export function ctaTargetForHref(href: string): CtaTarget {
  if (!href.startsWith("/")) return "other";
  const type = pageTypeFromPath(href);
  switch (type) {
    case "home":
    case "services":
    case "service":
    case "pricing":
    case "planner":
    case "contact":
    case "blog":
    case "article":
    case "projects":
    case "case":
    case "process":
      return type;
    default:
      return "other";
  }
}
