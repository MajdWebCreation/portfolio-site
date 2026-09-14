import { defaultLocale, type Locale } from "@/lib/content/site-content";

/**
 * Mollie configuration, read on the server and nowhere else.
 *
 * The API key is a secret: it is not a NEXT_PUBLIC value, it is never written
 * to the database, never logged and never put in a mail or a URL. Reading it
 * through this function keeps that in one place, and the guard below turns a
 * mistake that would ship it to the browser into a crash instead of a leak.
 *
 * Test and live are the same variable with a different key: a key starting
 * with `test_` is Mollie's test mode, so development needs no separate switch.
 */
export type MollieConfig = {
  apiKey: string;
  /** Absolute base URL of this site; Mollie needs to reach it and send people back. */
  siteUrl: string;
  testMode: boolean;
};

export class MollieNotConfigured extends Error {
  constructor() {
    super("Mollie is niet geconfigureerd. Zet MOLLIE_API_KEY en NEXT_PUBLIC_SITE_URL, zie .env.example.");
    this.name = "MollieNotConfigured";
  }
}

function assertServer() {
  if (typeof window !== "undefined") {
    throw new Error("Mollie configuration was read in the browser. It is server-only.");
  }
}

export function getMollieConfig(): MollieConfig {
  assertServer();

  const apiKey = process.env.MOLLIE_API_KEY;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ymcreations.com";

  if (!apiKey) throw new MollieNotConfigured();

  return { apiKey, siteUrl: siteUrl.replace(/\/$/, ""), testMode: apiKey.startsWith("test_") };
}

/** True when Mollie can be used at all; lets callers degrade instead of throw. */
export function isMollieConfigured(): boolean {
  return Boolean(process.env.MOLLIE_API_KEY);
}

/**
 * Which Mollie account this deployment talks to.
 *
 * Mollie's key itself says it: a key beginning with `test_` reaches the test
 * account, where no real money can move. That distinction is the safety catch
 * for the integration check, which may only ever run against `test`.
 */
export type MollieMode = "not_configured" | "test" | "live";

export function mollieMode(): MollieMode {
  const apiKey = process.env.MOLLIE_API_KEY;
  if (!apiKey) return "not_configured";
  return apiKey.startsWith("test_") ? "test" : "live";
}

/**
 * A page on this site, as an absolute URL Mollie can send someone back to.
 *
 * Every public page of this site lives under a locale segment -- there is no
 * `/betaling/afgerond`, only `/nl/betaling/afgerond` -- and the unprefixed
 * paths that do work are the handful of redirects in `next.config.ts`. A
 * return URL built without the segment therefore lands the customer on a 404
 * at the worst possible moment: just after paying.
 *
 * So the locale is part of building the URL rather than something a caller
 * may forget. It defaults to the site's own default language, which is what
 * the documents and their mails are written in.
 */
function sitePageUrl(config: MollieConfig, locale: Locale, path: string): string {
  return `${config.siteUrl}/${locale}${path}`;
}

/**
 * Where the integration check sends a visitor who would open its checkout.
 * Nobody ever does -- the check never opens the page -- but Mollie requires
 * the field, so it points at the site rather than anything payment-shaped.
 */
export function integrationCheckRedirectUrl(config: MollieConfig, locale: Locale = defaultLocale): string {
  return sitePageUrl(config, locale, "");
}

export function mollieWebhookUrl(config: MollieConfig): string {
  return `${config.siteUrl}/api/mollie/webhook`;
}

/**
 * Where a customer lands after paying an invoice -- an ordinary one-off, and
 * the `first` payment that also establishes a mandate, because both are the
 * same invoice payment link. `doc` names the invoice for the page.
 */
export function invoiceRedirectUrl(
  config: MollieConfig,
  invoiceNumber: string,
  locale: Locale = defaultLocale,
): string {
  return sitePageUrl(config, locale, `/betaling/afgerond?doc=${encodeURIComponent(invoiceNumber)}`);
}

/** Where a customer lands after authorising direct debit on its own link. */
export function activationRedirectUrl(config: MollieConfig, locale: Locale = defaultLocale): string {
  return sitePageUrl(config, locale, "/betaling/incasso-afgerond");
}
