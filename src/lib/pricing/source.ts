import { cache } from "react";
import {
  catalogFromRows,
  pricingAddOnColumns,
  pricingPackageColumns,
  pricingSettingsColumns,
  type PricingCatalog,
} from "@/lib/pricing/catalog";
import { createSupabasePublicClient } from "@/lib/supabase/public";

/**
 * The pricing catalog as the public site reads it: from Supabase, as `anon`,
 * so only active pricing comes back. This is the single runtime source of
 * every commercial amount on the site.
 *
 * Wrapped in React's `cache`, so a page that renders the pricing table and
 * the planner in one request queries once and both show the same amounts.
 *
 * The campaign on development costs comes from the `pricing_settings` row.
 * Reading it can only ever remove a discount, never add one: a missing row or
 * a failed read shows the base prices, which is the state the site had before
 * the campaign existed, so the pricing page never breaks over it.
 *
 * Server-side only. A client component receives a catalog as a prop rather
 * than calling this, so no Supabase query is ever made from the browser for
 * something every visitor sees identically.
 */
export const getPricingCatalog = cache(async (): Promise<PricingCatalog> => {
  const db = createSupabasePublicClient();

  const [packages, addOns, settings] = await Promise.all([
    db.from("pricing_packages").select(pricingPackageColumns).order("sort_order"),
    db.from("pricing_addons").select(pricingAddOnColumns).order("sort_order"),
    db.from("pricing_settings").select(pricingSettingsColumns).eq("id", 1).maybeSingle(),
  ]);

  if (packages.error) throw new Error(`Prijzen laden: ${packages.error.message}`);
  if (addOns.error) throw new Error(`Uitbreidingen laden: ${addOns.error.message}`);
  if (settings.error) {
    console.error(`Prijsinstellingen laden: ${settings.error.message}; korting staat uit.`);
  }

  return catalogFromRows(packages.data ?? [], addOns.data ?? [], settings.error ? null : settings.data);
});
