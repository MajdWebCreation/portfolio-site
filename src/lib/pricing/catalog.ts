import type { Locale } from "@/lib/content/site-content";
import type { AddOnGroup, PackageId, PriceMode } from "@/lib/pricing/packages";

/**
 * The commercial amounts, in the shape the site works with.
 *
 * Every euro amount the public pages, the planner and the admin show comes
 * from a `PricingCatalog`, and a catalog is only ever built from database
 * rows by `catalogFromRows` below. That is the whole point: the amounts live
 * in Supabase, and this module is the single place where a stored row becomes
 * a number the interface can render.
 *
 * Amounts are whole euros here while the database stores integer cents; the
 * one division that bridges the two is in this file and nowhere else.
 *
 * No formatting happens here (see `format.ts`) and no code in this module
 * reaches the database (see `source.ts`), so a client component can import it.
 */
export type LocalizedText = Record<Locale, string>;

export type CatalogAddOn = {
  id: string;
  group: AddOnGroup;
  /** Amount in whole euros. */
  amount: number;
  mode: PriceMode;
  label: LocalizedText;
};

export type CatalogPackage = {
  id: PackageId;
  /** One-off starting price for the build, in whole euros. */
  startingPrice: number;
  /** Custom work: the starting price is a lower bound, shown with a plus. */
  scopeDriven: boolean;
  /** Minimum monthly price for technical management, in whole euros. */
  monthlyManagementFrom: number;
  name: LocalizedText;
  /** One short line next to the name in the selector: who the type is for. */
  tagline: LocalizedText;
  addOns: CatalogAddOn[];
};

export type PricingCatalog = {
  packages: CatalogPackage[];
};

/**
 * The columns a catalog is built from. Written structurally rather than as
 * `Database["public"]["Tables"][...]["Row"]` so a query that selects exactly
 * these columns fits, whichever client ran it.
 */
export type PricingPackageRow = {
  id: string;
  starting_price_cents: number;
  scope_driven: boolean;
  monthly_management_from_cents: number;
  name_nl: string;
  name_en: string;
  tagline_nl: string;
  tagline_en: string;
  sort_order: number;
};

export type PricingAddOnRow = {
  package_id: string;
  addon_id: string;
  addon_group: string;
  amount_cents: number;
  mode: string;
  label_nl: string;
  label_en: string;
  sort_order: number;
};

export const pricingPackageColumns =
  "id, starting_price_cents, scope_driven, monthly_management_from_cents, name_nl, name_en, tagline_nl, tagline_en, sort_order";

export const pricingAddOnColumns =
  "package_id, addon_id, addon_group, amount_cents, mode, label_nl, label_en, sort_order";

function euros(cents: number): number {
  return cents / 100;
}

const bySortOrder = (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order;

/** Database rows as a catalog, ordered the way the rows say they are ordered. */
export function catalogFromRows(
  packageRows: PricingPackageRow[],
  addOnRows: PricingAddOnRow[],
): PricingCatalog {
  const addOnsByPackage = new Map<string, CatalogAddOn[]>();

  for (const row of [...addOnRows].sort(bySortOrder)) {
    const list = addOnsByPackage.get(row.package_id) ?? [];
    list.push({
      id: row.addon_id,
      group: row.addon_group as AddOnGroup,
      amount: euros(row.amount_cents),
      mode: row.mode as PriceMode,
      label: { nl: row.label_nl, en: row.label_en },
    });
    addOnsByPackage.set(row.package_id, list);
  }

  return {
    packages: [...packageRows].sort(bySortOrder).map((row) => ({
      id: row.id as PackageId,
      startingPrice: euros(row.starting_price_cents),
      scopeDriven: row.scope_driven,
      monthlyManagementFrom: euros(row.monthly_management_from_cents),
      name: { nl: row.name_nl, en: row.name_en },
      tagline: { nl: row.tagline_nl, en: row.tagline_en },
      addOns: addOnsByPackage.get(row.id) ?? [],
    })),
  };
}

export function getPackage(catalog: PricingCatalog, id: PackageId): CatalogPackage {
  const found = catalog.packages.find((pkg) => pkg.id === id);

  if (!found) {
    throw new Error(`Unknown package "${id}" in the pricing catalog`);
  }

  return found;
}

export function getPackages(catalog: PricingCatalog): CatalogPackage[] {
  return catalog.packages;
}

export function getPackageName(catalog: PricingCatalog, locale: Locale, id: PackageId): string {
  return getPackage(catalog, id).name[locale];
}

export function getStartingPrice(catalog: PricingCatalog, id: PackageId): number {
  return getPackage(catalog, id).startingPrice;
}

export function getMonthlyManagementFrom(catalog: PricingCatalog, id: PackageId): number {
  return getPackage(catalog, id).monthlyManagementFrom;
}

/** Amount and label of one extension, looked up by stable id. */
export function getAddOn(
  catalog: PricingCatalog,
  locale: Locale,
  packageId: PackageId,
  addOnId: string,
) {
  const addOn = getPackage(catalog, packageId).addOns.find((item) => item.id === addOnId);

  if (!addOn) {
    throw new Error(`Unknown add-on "${addOnId}" for package "${packageId}"`);
  }

  return { ...addOn, label: addOn.label[locale] };
}
