import { adminDb, failed } from "@/lib/admin/db";
import type { AdminPricingPackage } from "@/lib/admin/pricing/model";
import {
  addOnGroupLabels,
  catalogFromRows,
  pricingAddOnColumns,
  pricingPackageColumns,
} from "@/lib/pricing";

/**
 * Pricing as the admin edits it, read from the database with the admin's own
 * session so row level security applies.
 *
 * The rows become a `PricingCatalog` through the same `catalogFromRows` the
 * public site uses, so the admin and the public pages cannot disagree about
 * what a stored amount means; this module only picks the Dutch labels out of
 * it, which is what the editor shows.
 *
 * The group labels stay in `@/lib/pricing`: those are display strings for a
 * fixed set of groups, not data that is edited here.
 */
export async function getAdminPricing(): Promise<AdminPricingPackage[]> {
  const db = await adminDb();

  const [packages, addOns] = await Promise.all([
    db.from("pricing_packages").select(pricingPackageColumns).order("sort_order"),
    db.from("pricing_addons").select(pricingAddOnColumns).order("sort_order"),
  ]);

  failed("Prijzen laden", packages.error);
  failed("Uitbreidingen laden", addOns.error);

  const catalog = catalogFromRows(packages.data ?? [], addOns.data ?? []);

  return catalog.packages.map((pkg) => ({
    id: pkg.id,
    name: pkg.name.nl,
    tagline: pkg.tagline.nl,
    startingPrice: pkg.startingPrice,
    scopeDriven: pkg.scopeDriven,
    monthlyManagementFrom: pkg.monthlyManagementFrom,
    addOns: pkg.addOns.map((addOn) => ({
      id: addOn.id,
      label: addOn.label.nl,
      group: addOn.group,
      groupLabel: addOnGroupLabels[addOn.group].nl,
      amount: addOn.amount,
      mode: addOn.mode,
    })),
  }));
}
