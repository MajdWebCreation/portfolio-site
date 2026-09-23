import type { PricingAddOnRow, PricingPackageRow, PricingSettingsRow } from "@/lib/pricing/catalog";

/**
 * Test rows with the seeded amounts from 20260910174246_pricing_seed.sql, so
 * the pricing and planner tests check the real numbers. Test-only.
 */
export const seedPackageRows: PricingPackageRow[] = [
  ["starter", 69500, false, 1000, "Compacte website", "Compact website", 0],
  ["business", 149500, false, 2500, "Bedrijfswebsite", "Business website", 1],
  ["smart", 249500, false, 3500, "Website met reserveringen", "Website with bookings", 2],
  ["webshop", 199500, false, 2500, "Webshop", "Webshop", 3],
  ["platform", 499500, true, 4900, "Maatwerkplatform", "Custom platform", 4],
].map(([id, starting, scope, monthly, nl, en, sort]) => ({
  id: id as string,
  starting_price_cents: starting as number,
  scope_driven: scope as boolean,
  monthly_management_from_cents: monthly as number,
  name_nl: nl as string,
  name_en: en as string,
  tagline_nl: "",
  tagline_en: "",
  sort_order: sort as number,
}));

export const seedAddOnRows: PricingAddOnRow[] = [
  ["starter", "extra-page", "content", 7500, "plus", 0],
  ["starter", "multilingual", "content", 20000, "plus", 1],
  ["starter", "seo-plus", "findability", 25000, "plus", 2],
  ["starter", "motion", "conversion", 17500, "plus", 3],
  ["business", "seo-growth", "findability", 35000, "plus", 1],
  ["business", "email-flow", "conversion", 20000, "plus", 2],
  ["webshop", "subscriptions", "conversion", 90000, "plus-from", 3],
  ["platform", "full-app", "app", 850000, "from", 5],
].map(([pkg, id, group, cents, mode, sort]) => ({
  package_id: pkg as string,
  addon_id: id as string,
  addon_group: group as string,
  amount_cents: cents as number,
  mode: mode as string,
  label_nl: id as string,
  label_en: id as string,
  sort_order: sort as number,
}));

export const settingsRow = (enabled: boolean, percent: number): PricingSettingsRow => ({
  development_discount_enabled: enabled,
  development_discount_percent: percent,
});
