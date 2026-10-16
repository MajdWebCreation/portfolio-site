import type { Locale } from "@/lib/content/site-content";
import {
  developmentPrice,
  formatEuro,
  formatMonthlyFrom,
  getPackage,
  isPackageId,
  type PackageId,
  type PricingCatalog,
} from "@/lib/pricing";

/**
 * A request for one project type, straight from a pricing card.
 *
 * The pricing page links to the contact form with `?package=<id>`. The id
 * is the only thing that travels: it is checked against the fixed set of
 * project types, and the name and amounts the visitor then sees, and the
 * line the request is stored with, are read from the pricing catalog. A
 * value that is not a project type is simply not a choice, and the form is
 * the ordinary contact form.
 *
 * No Supabase here: the contact page reads the catalog on the server and
 * hands the five choices to the form, which picks one by the id in the URL.
 */
export const PACKAGE_PARAM = "package";

/** The project type named in a query string, or null. */
export function packageIdFromSearch(search: string): PackageId | null {
  const value = new URLSearchParams(search).get(PACKAGE_PARAM);
  return isPackageId(value) ? value : null;
}

export type PackageChoice = {
  id: PackageId;
  name: string;
  /** "vanaf € 695" -- the starting amount as the pricing page shows it. */
  price: string;
  /** "vanaf € 15 p/m" */
  monthly: string;
};

/** The choice as the form shows it, from the catalog, through the same price rule as the pricing page. */
export function describePackageChoice(catalog: PricingCatalog, locale: Locale, id: PackageId): PackageChoice {
  const pkg = getPackage(catalog, id);
  const starting = developmentPrice(pkg.startingPrice, catalog.developmentDiscount);
  const from = locale === "nl" ? "vanaf" : "from";
  return {
    id,
    name: pkg.name[locale],
    price: `${from} ${formatEuro(starting.amount, locale)}`,
    monthly: formatMonthlyFrom(pkg.monthlyManagementFrom, locale),
  };
}

export function describePackageChoices(catalog: PricingCatalog, locale: Locale): Record<PackageId, PackageChoice> {
  return Object.fromEntries(
    catalog.packages.map((pkg) => [pkg.id, describePackageChoice(catalog, locale, pkg.id)]),
  ) as Record<PackageId, PackageChoice>;
}

/**
 * The first line of a stored request that came from a pricing card: which
 * type was chosen and what it starts at, in the visitor's language, so the
 * admin and the notification mail read it without a lookup. Built on the
 * server from the catalog, never from anything the browser sent.
 */
export function packageRequestLine(choice: PackageChoice, locale: Locale): string {
  return locale === "nl"
    ? `Gekozen projecttype: ${choice.name} (${choice.price} excl. btw, technisch beheer ${choice.monthly})`
    : `Chosen project type: ${choice.name} (${choice.price} excl. VAT, technical management ${choice.monthly})`;
}
