import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  activationRedirectUrl,
  getMollieConfig,
  integrationCheckRedirectUrl,
  invoiceRedirectUrl,
} from "@/lib/mollie/config";
import { readPaymentReturnToken } from "@/lib/payments/return-token";

/*
  Where Mollie sends a customer back to.

  Every public page of this site lives under a locale segment, so a return URL
  without one is a 404 -- and it is a 404 the customer meets immediately after
  paying, which is the worst moment to look broken. These are the URLs handed
  to Mollie, checked against the routes that actually exist:

    src/app/[locale]/betaling/afgerond
    src/app/[locale]/betaling/incasso-afgerond
*/
const invoiceId = "dd847d57-3cb1-4160-b848-2a43a53ac40f";

beforeEach(() => {
  process.env.MOLLIE_API_KEY = "test_dummy";
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  process.env.PAYMENT_RETURN_SECRET = "test-payment-return-secret-value";
});

afterEach(() => {
  delete process.env.MOLLIE_API_KEY;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.PAYMENT_RETURN_SECRET;
});

/** The `state` value of a return URL, as a browser would read it off. */
function stateOf(url: string): string | null {
  return new URL(url).searchParams.get("state");
}

describe("the page a paying customer is returned to", () => {
  it("points at the localised confirmation page", () => {
    const url = invoiceRedirectUrl(getMollieConfig(), invoiceId);
    expect(url.startsWith("https://example.test/nl/betaling/afgerond?state=")).toBe(true);
  });

  it("follows the customer's own language when there is one", () => {
    const url = invoiceRedirectUrl(getMollieConfig(), invoiceId, "en");
    expect(url.startsWith("https://example.test/en/betaling/afgerond?state=")).toBe(true);
  });

  /*
    The point of the token: the URL handed to the provider, and from there to
    the customer's address bar, names no invoice anyone could count from.
  */
  it("carries an opaque token instead of an identifier", () => {
    const url = invoiceRedirectUrl(getMollieConfig(), invoiceId);

    expect(url).not.toContain(invoiceId);
    expect(url).not.toContain("YM-F");
    expect(url).not.toContain("doc=");
    // And it is ours: it reads back as the invoice it was made for.
    expect(readPaymentReturnToken(stateOf(url) ?? undefined)).toEqual({ invoiceId });
  });

  /* Without the secret the page still works; it just cannot say a status. */
  it("falls back to the bare page when no return secret is configured", () => {
    delete process.env.PAYMENT_RETURN_SECRET;
    expect(invoiceRedirectUrl(getMollieConfig(), invoiceId)).toBe("https://example.test/nl/betaling/afgerond");
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
