import { packageIds, type PackageId } from "@/lib/pricing/packages";

/**
 * The three product categories a visitor chooses between on the pricing
 * page: what they want made, before which project type it is.
 *
 * A presentation layer only. The project types, their ids and every amount
 * stay exactly what they are in the catalog; a category is a stable label
 * over a fixed subset of those ids, so the page can show a visitor two
 * website types instead of five project types at once. Nothing else reads
 * it: the planner, the admin, the services and the analytics keep speaking
 * in `PackageId`.
 *
 *  - website: a site that presents the business and brings in enquiries;
 *  - webshop: selling products, with cart, checkout, payments and orders;
 *  - custom: the site or software runs a business process of its own
 *    (booking logic, portals, dashboards, workflows, integrations).
 */
export type ProductCategory = "website" | "webshop" | "custom";

export const productCategories: readonly ProductCategory[] = ["website", "webshop", "custom"];

export function isProductCategory(value: unknown): value is ProductCategory {
  return typeof value === "string" && (productCategories as readonly string[]).includes(value);
}

const categoryByPackage: Record<PackageId, ProductCategory> = {
  starter: "website",
  business: "website",
  smart: "custom",
  webshop: "webshop",
  platform: "custom",
};

export function getProductCategory(id: PackageId): ProductCategory {
  return categoryByPackage[id];
}

/** The project types of one category, in catalog order. */
export function packagesInCategory(category: ProductCategory): PackageId[] {
  return packageIds.filter((id) => categoryByPackage[id] === category);
}
