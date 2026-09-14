import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  activationRedirectUrl,
  getMollieConfig,
  integrationCheckRedirectUrl,
  invoiceRedirectUrl,
} from "@/lib/mollie/config";

/*
  Where Mollie sends a customer back to.

  Every public page of this site lives under a locale segment, so a return URL
  without one is a 404 -- and it is a 404 the customer meets immediately after
  paying, which is the worst moment to look broken. These are the URLs handed
  to Mollie, checked against the routes that actually exist:

    src/app/[locale]/betaling/afgerond
    src/app/[locale]/betaling/incasso-afgerond
*/
beforeEach(() => {
  process.env.MOLLIE_API_KEY = "test_dummy";
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
});

afterEach(() => {
  delete process.env.MOLLIE_API_KEY;
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("the page a paying customer is returned to", () => {
  it("points at the localised confirmation page and keeps the invoice number", () => {
    expect(invoiceRedirectUrl(getMollieConfig(), "YM-F-2026-000001")).toBe(
      "https://example.test/nl/betaling/afgerond?doc=YM-F-2026-000001",
    );
  });

  it("follows the customer's own language when there is one", () => {
    expect(invoiceRedirectUrl(getMollieConfig(), "YM-F-2026-000001", "en")).toBe(
      "https://example.test/en/betaling/afgerond?doc=YM-F-2026-000001",
    );
  });

  /* A number is never interpolated raw; it is a query value like any other. */
  it("escapes the invoice number", () => {
    expect(invoiceRedirectUrl(getMollieConfig(), "YM F/1&2")).toBe(
      "https://example.test/nl/betaling/afgerond?doc=YM%20F%2F1%262",
    );
  });

  it("points at the localised direct debit page after an activation", () => {
    expect(activationRedirectUrl(getMollieConfig())).toBe("https://example.test/nl/betaling/incasso-afgerond");
    expect(activationRedirectUrl(getMollieConfig(), "en")).toBe("https://example.test/en/betaling/incasso-afgerond");
  });

  it("keeps the integration check on a page that exists too", () => {
    expect(integrationCheckRedirectUrl(getMollieConfig())).toBe("https://example.test/nl");
  });

  /* A trailing slash in the environment must not double up in the path. */
  it("tolerates a site URL with a trailing slash", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.test/";
    expect(activationRedirectUrl(getMollieConfig())).toBe("https://example.test/nl/betaling/incasso-afgerond");
  });
});
