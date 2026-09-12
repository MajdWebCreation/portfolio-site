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

export function mollieWebhookUrl(config: MollieConfig): string {
  return `${config.siteUrl}/api/mollie/webhook`;
}

export function invoiceRedirectUrl(config: MollieConfig, invoiceNumber: string): string {
  return `${config.siteUrl}/betaling/afgerond?doc=${encodeURIComponent(invoiceNumber)}`;
}

export function activationRedirectUrl(config: MollieConfig): string {
  return `${config.siteUrl}/betaling/incasso-afgerond`;
}
