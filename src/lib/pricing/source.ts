import { cache } from "react";
import {
  catalogFromRows,
  pricingAddOnColumns,
  pricingPackageColumns,
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
 * Server-side only. A client component receives a catalog as a prop rather
 * than calling this, so no Supabase query is ever made from the browser for
 * something every visitor sees identically.
 */
export const getPricingCatalog = cache(async (): Promise<PricingCatalog> => {
  const db = createSupabasePublicClient();

  const [packages, addOns] = await Promise.all([
    db.from("pricing_packages").select(pricingPackageColumns).order("sort_order"),
    db.from("pricing_addons").select(pricingAddOnColumns).order("sort_order"),
  ]);

  if (packages.error) throw new Error(`Prijzen laden: ${packages.error.message}`);
  if (addOns.error) throw new Error(`Uitbreidingen laden: ${addOns.error.message}`);

  return catalogFromRows(packages.data ?? [], addOns.data ?? []);
});
