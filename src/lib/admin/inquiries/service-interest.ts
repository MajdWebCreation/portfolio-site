import type { Inquiry } from "@/lib/admin/inquiries/types";
import { getServiceKeyForSlug, type ServiceKey } from "@/lib/content/services";

/**
 * A proposal for `service_interest`, from what the request itself says: the
 * project type a planner submission chose, or the service page the visit
 * landed on. A proposal only -- the admin confirms or corrects it, and a
 * request that says nothing gets no guess.
 */
const plannerProjectTypeServices: Readonly<Record<string, ServiceKey>> = {
  starter: "business-websites",
  business: "business-websites",
  webshop: "ecommerce-development",
  smart: "web-app-development",
  platform: "web-app-development",
};

const servicePath = /^\/(nl|en)\/(diensten|services)\/([^/?#]+)\/?$/;

export function suggestServiceInterest(inquiry: Pick<Inquiry, "origin" | "attribution"> & { planner?: { projectTypeKey?: string } }): ServiceKey | undefined {
  if (inquiry.origin === "project_planner") {
    const key = inquiry.planner?.projectTypeKey;
    if (key && key in plannerProjectTypeServices) return plannerProjectTypeServices[key];
  }

  const path = inquiry.attribution?.landingPath;
  const match = path ? servicePath.exec(path) : null;
  if (!match) return undefined;
  const locale = match[1] === "en" ? "en" : "nl";
  return getServiceKeyForSlug(locale, match[3]) ?? undefined;
}
