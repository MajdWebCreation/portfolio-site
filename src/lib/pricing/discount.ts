/**
 * The temporary discount on development costs, and the one rule that applies
 * it.
 *
 * A campaign is either off (`null`) or a whole percentage. It comes from the
 * `pricing_settings` row, is carried on the `PricingCatalog`, and reaches a
 * price only through `developmentPrice` below. That is the whole mechanism:
 * no component, page or action does its own percentage arithmetic.
 *
 * Only one-time development amounts are eligible: a package's starting price,
 * an add-on's amount, and the planner's one-time estimate built from them.
 * Recurring amounts (technical management, hosting, maintenance) have no
 * helper here on purpose, so there is no call that could discount them.
 *
 * The base amount is never changed; the discounted amount is derived next to
 * it, rounded to the nearest whole euro, because the site shows whole euros.
 */

export const minDevelopmentDiscountPercent = 1;
export const maxDevelopmentDiscountPercent = 90;

/** An active campaign, or `null` when there is none. */
export type DevelopmentDiscount = { percent: number } | null;

/** One one-time development amount: what it costs normally and what is shown now. */
export type DevelopmentPrice = {
  /** The canonical amount, unchanged. */
  baseAmount: number;
  /** The amount to show: the base amount, or the discounted one. */
  amount: number;
  /** The discount applied, or `null` when the base amount is shown. */
  percent: number | null;
};

/** A whole percentage the campaign accepts: 1 through 90. */
export function isValidDevelopmentDiscountPercent(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minDevelopmentDiscountPercent &&
    value <= maxDevelopmentDiscountPercent
  );
}

/**
 * The campaign as the stored settings describe it. A missing row, a switched
 * off campaign or a percentage outside the accepted range all mean: no
 * discount. Nothing here invents a percentage.
 */
export function developmentDiscountFromSettings(
  settings: { enabled: boolean; percent: number } | null | undefined,
): DevelopmentDiscount {
  if (!settings || !settings.enabled) return null;
  if (!isValidDevelopmentDiscountPercent(settings.percent)) return null;
  return { percent: settings.percent };
}

/**
 * A one-time development amount under the campaign. Off returns the base
 * amount as it is; on, the amount is reduced by the percentage and rounded to
 * the nearest whole euro (half up: 695 at 30% is 486.5, shown as 487).
 */
export function developmentPrice(baseAmount: number, discount: DevelopmentDiscount): DevelopmentPrice {
  if (!discount) {
    return { baseAmount, amount: baseAmount, percent: null };
  }

  /* Integer arithmetic first, so 1495 * 70 / 100 is exactly 1046.5, not 1046.4999. */
  const amount = Math.round((baseAmount * (100 - discount.percent)) / 100);

  return { baseAmount, amount, percent: discount.percent };
}
