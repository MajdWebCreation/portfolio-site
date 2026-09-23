import type { AddOnGroup, PackageId, PriceMode } from "@/lib/pricing";

/**
 * The shape the pricing editor works with. Reading and writing it lives in
 * `pricing/repository.ts` and `pricing/actions.ts`, which are backed by the
 * database; this module holds the types and the field keys that both sides
 * agree on. Amounts here are whole euros.
 */
export type AdminAddOn = {
  id: string;
  label: string;
  group: AddOnGroup;
  groupLabel: string;
  amount: number;
  mode: PriceMode;
};

export type AdminPricingPackage = {
  id: PackageId;
  name: string;
  tagline: string;
  startingPrice: number;
  scopeDriven: boolean;
  monthlyManagementFrom: number;
  addOns: AdminAddOn[];
};

/**
 * The temporary discount on development costs as the editor shows it.
 * `percent` is `null` when there is no settings row yet; `loadError` is set
 * when it could not be read, so the rest of the editor still works.
 */
export type AdminPricingSettings = {
  developmentDiscountEnabled: boolean;
  developmentDiscountPercent: number | null;
  loadError: string | null;
};

/** Stable key for one editable amount, e.g. "business.startingPrice" or "business.addOn.seo-growth". */
export type PricingFieldKey = `${PackageId}.startingPrice` | `${PackageId}.monthlyManagementFrom` | `${PackageId}.addOn.${string}`;

export function pricingFieldKey(packageId: PackageId, field: "startingPrice" | "monthlyManagementFrom"): PricingFieldKey;
export function pricingFieldKey(packageId: PackageId, field: "addOn", addOnId: string): PricingFieldKey;
export function pricingFieldKey(packageId: PackageId, field: string, addOnId?: string): PricingFieldKey {
  return (addOnId ? `${packageId}.addOn.${addOnId}` : `${packageId}.${field}`) as PricingFieldKey;
}

export const priceModeLabels: Record<PriceMode, string> = {
  plus: "Vaste uitbreiding",
  "plus-from": "Vanaf, omvang verschilt",
  from: "Eigen traject, vanaf",
};

/** A whole percentage as typed; the range itself is checked by the server action. */
export function parsePercentInput(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** Whole euros only, matching the source; empty or invalid input is rejected. */
export function parseEuroInput(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,6}$/.test(trimmed)) return null;
  return Number(trimmed);
}
