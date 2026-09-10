"use server";

import { revalidatePath } from "next/cache";
import { actionFailed, type ActionResult } from "@/lib/admin/action-result";
import { adminDb } from "@/lib/admin/db";
import { getLocalizedPath } from "@/lib/content/routes";
import { locales } from "@/lib/content/site-content";

/**
 * Saving a price. The editor works in whole euros, the database stores
 * integer cents; the single multiplication lives here so no component has to
 * know about the unit.
 *
 * Only the amounts are editable: ids, groups and modes come from the seed and
 * describe what a package is, not what it costs.
 */
function toCents(euros: number): number | null {
  return Number.isSafeInteger(euros) && euros >= 0 ? euros * 100 : null;
}

/**
 * The public pages that render an amount. They read the same rows, so a saved
 * price has to invalidate their cached output as well as the editor's, or the
 * site would keep showing the old number until the next deploy.
 */
function revalidatePricing() {
  revalidatePath("/admin/prijzen");

  for (const locale of locales) {
    revalidatePath(getLocalizedPath(locale, "pricing"));
    revalidatePath(getLocalizedPath(locale, "projectPlanner"));
  }
}

export async function updatePackagePrice(
  packageId: string,
  field: "startingPrice" | "monthlyManagementFrom",
  euros: number,
): Promise<ActionResult> {
  const cents = toCents(euros);
  if (cents === null) return { ok: false, error: "Bedrag moet een heel getal van 0 of hoger zijn." };

  const db = await adminDb();
  const patch =
    field === "startingPrice" ? { starting_price_cents: cents } : { monthly_management_from_cents: cents };
  const { error } = await db.from("pricing_packages").update(patch).eq("id", packageId);

  if (error) return actionFailed(error, "Opslaan mislukt.");

  revalidatePricing();
  return { ok: true };
}

export async function updateAddOnPrice(packageId: string, addOnId: string, euros: number): Promise<ActionResult> {
  const cents = toCents(euros);
  if (cents === null) return { ok: false, error: "Bedrag moet een heel getal van 0 of hoger zijn." };

  const db = await adminDb();
  const { error } = await db
    .from("pricing_addons")
    .update({ amount_cents: cents })
    .eq("package_id", packageId)
    .eq("addon_id", addOnId);

  if (error) return actionFailed(error, "Opslaan mislukt.");

  revalidatePricing();
  return { ok: true };
}
