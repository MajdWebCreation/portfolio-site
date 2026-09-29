import type { Locale } from "@/lib/content/site-content";
import type { PriceMode } from "@/lib/pricing/packages";

/** Euro amount without decimals, in the locale's notation (€ 1.750 / €1,750). */
export function formatEuro(amount: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "nl" ? "nl-NL" : "en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

const fromWord: Record<Locale, string> = { nl: "vanaf", en: "from" };

/** "+ € 250", "vanaf + € 950" or "vanaf € 8.500". */
export function formatAddOnPrice(amount: number, mode: PriceMode, locale: Locale) {
  const euro = formatEuro(amount, locale);

  switch (mode) {
    case "plus":
      return `+ ${euro}`;
    case "plus-from":
      return `${fromWord[locale]} + ${euro}`;
    case "from":
      return `${fromWord[locale]} ${euro}`;
  }
}

/** "€ 1.495" for a fixed price, or "vanaf € 4.995" for scope-driven work. */
export function formatStartingPrice(amount: number, locale: Locale, openEnded = false) {
  const euro = formatEuro(amount, locale);
  return openEnded ? `${fromWord[locale]} ${euro}` : euro;
}

/** "€ 29 p/m" / "€29 per month". */
export function formatMonthly(amount: number, locale: Locale) {
  return locale === "nl" ? `${formatEuro(amount, locale)} p/m` : `${formatEuro(amount, locale)} per month`;
}

/** "vanaf € 29 p/m" / "from €29 per month". */
export function formatMonthlyFrom(amount: number, locale: Locale) {
  return `${fromWord[locale]} ${formatMonthly(amount, locale)}`;
}
