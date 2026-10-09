import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MolliePaymentLink } from "@/lib/mollie/client";
import { invoiceFixture, paymentFixture } from "@/lib/payments/fixtures";
import type { StoredPaymentLink } from "@/lib/payments/checkout";

/*
  The pay-by-link for an invoice mail is a Mollie *payment link*, not the
  checkout URL of a Payments-API payment: a mail may be opened a week later,
  and a checkout URL is dead by then. Resending must also not hand the customer
  a second live link for the same debt. Mollie is stubbed at the client module,
  so no request leaves the process.
*/
const getPaymentLink = vi.fn();
const createPaymentLink = vi.fn();
const createPayment = vi.fn();
const archivePaymentLink = vi.fn();

vi.mock("@/lib/mollie/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mollie/client")>()),
  getPaymentLink: (...args: unknown[]) => getPaymentLink(...args),
  createPaymentLink: (...args: unknown[]) => createPaymentLink(...args),
  createPayment: (...args: unknown[]) => createPayment(...args),
  archivePaymentLink: (...args: unknown[]) => archivePaymentLink(...args),
}));

const { ensureInvoiceCheckout } = await import("@/lib/payments/checkout");

function link(overrides: Partial<MolliePaymentLink> = {}): MolliePaymentLink {
  return {
    id: "pl_1",
    description: "Factuur",
    amount: { currency: "EUR", value: "121.00" },
    sequenceType: "oneoff",
    _links: { paymentLink: { href: "https://payment-link.mollie.com/payment/pl_1" } },
    ...overrides,
  };
}

const stored: StoredPaymentLink = {
  providerPaymentLinkId: "pl_1",
  checkoutUrl: "https://payment-link.mollie.com/payment/pl_1",
  sequenceType: "oneoff",
  amountCents: 12100,
};

/** Invoice ids are UUIDs in the database; the return token needs a real one. */
const invoiceId = "dd847d57-3cb1-4160-b848-2a43a53ac40f";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MOLLIE_API_KEY = "test_dummy";
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  process.env.PAYMENT_RETURN_SECRET = "test-payment-return-secret-value";
  createPaymentLink.mockResolvedValue(link());
});

afterEach(() => {
  delete process.env.MOLLIE_API_KEY;
  delete process.env.PAYMENT_RETURN_SECRET;
});

/** The redirect URL of the single createPaymentLink call. */
function redirectUrlOf(): string {
  return (createPaymentLink.mock.calls[0]?.[0] as { redirectUrl: string }).redirectUrl;
}

describe("a payment link for an invoice", () => {
  it("creates one when there is nothing to reuse", async () => {
    const persistLink = vi.fn();

    const result = await ensureInvoiceCheckout(invoiceFixture(), { existing: [], persistLink });

    expect(result).toMatchObject({
      ok: true,
      reused: false,
      paymentLinkId: "pl_1",
      checkoutUrl: "https://payment-link.mollie.com/payment/pl_1",
    });
    expect(createPaymentLink).toHaveBeenCalledTimes(1);
    // A payment link, not a Payments-API payment with a short-lived checkout.
    expect(createPayment).not.toHaveBeenCalled();
    expect(persistLink).toHaveBeenCalledWith(stored);
  });

  it("names the invoice in the webhook URL, because a link carries no metadata", async () => {
    await ensureInvoiceCheckout(invoiceFixture(), { existing: [], persistLink: vi.fn() });

    expect(createPaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({ webhookUrl: "https://example.test/api/mollie/webhook?invoice=inv-1" }),
    );
  });

  /*
    The page the customer meets straight after paying. It lives under a locale
    segment like every other page here, so a return URL without one is a 404 at
    the one moment the site may not look broken -- and it names the invoice only
    through an opaque token, so it is not a list anyone can count through.
  */
  it("returns the customer to the localised confirmation page, with no identifier in it", async () => {
    await ensureInvoiceCheckout(invoiceFixture({ id: invoiceId }), { existing: [], persistLink: vi.fn() });

    const redirectUrl = redirectUrlOf();
    expect(redirectUrl.startsWith("https://example.test/nl/betaling/afgerond?state=")).toBe(true);
    expect(redirectUrl).not.toContain(invoiceId);
    expect(redirectUrl).not.toContain("YM-F");
  });

  /* The requirement: resending reuses the link the customer already has. */
  it("reuses a link that is still payable instead of making a second one", async () => {
    getPaymentLink.mockResolvedValue(link());

    const result = await ensureInvoiceCheckout(invoiceFixture(), {
      existing: [],
      storedLink: stored,
      persistLink: vi.fn(),
    });

    expect(result).toMatchObject({ ok: true, reused: true, checkoutUrl: "https://payment-link.mollie.com/payment/pl_1" });
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it("makes a new link when the stored one has been paid", async () => {
    getPaymentLink.mockResolvedValue(link({ paidAt: "2026-09-14T10:00:00.000Z" }));
    createPaymentLink.mockResolvedValue(
      link({ id: "pl_2", _links: { paymentLink: { href: "https://payment-link.mollie.com/payment/pl_2" } } }),
    );

    const result = await ensureInvoiceCheckout(invoiceFixture(), {
      existing: [],
      storedLink: stored,
      persistLink: vi.fn(),
    });

    expect(result).toMatchObject({ ok: true, reused: false, paymentLinkId: "pl_2" });
  });

  /*
    A `first` link from before invoices stopped asking for a mandate would
    authorise direct debit as a side effect of paying the invoice. It is
    closed, and the invoice gets an ordinary one-off link.
  */
  it("closes a legacy first link and replaces it with a one-off link", async () => {
    getPaymentLink.mockResolvedValue(link({ sequenceType: "first" }));
    createPaymentLink.mockResolvedValue(
      link({ id: "pl_2", _links: { paymentLink: { href: "https://payment-link.mollie.com/payment/pl_2" } } }),
    );

    const result = await ensureInvoiceCheckout(invoiceFixture(), {
      existing: [],
      storedLink: { ...stored, sequenceType: "first" },
      persistLink: vi.fn(),
    });

    expect(result).toMatchObject({ ok: true, paymentLinkId: "pl_2" });
    expect(archivePaymentLink).toHaveBeenCalledWith("pl_1", expect.anything());
    const [args] = createPaymentLink.mock.calls[0] as [{ sequenceType: string; customerId?: string }];
    expect(args.sequenceType).toBe("oneoff");
    expect(args.customerId).toBeUndefined();
  });

  it("makes a new link when the outstanding amount changed", async () => {
    getPaymentLink.mockResolvedValue(link());
    createPaymentLink.mockResolvedValue(link({ id: "pl_2", _links: { paymentLink: { href: "https://x/pl_2" } } }));

    await ensureInvoiceCheckout(invoiceFixture(), {
      existing: [paymentFixture({ amountCents: 2100 })],
      storedLink: stored,
      persistLink: vi.fn(),
    });

    expect(createPaymentLink).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 10000 }));
  });

  it("refuses to bill an invoice that is already paid", async () => {
    const result = await ensureInvoiceCheckout(invoiceFixture(), {
      existing: [paymentFixture({ amountCents: 12100 })],
      persistLink: vi.fn(),
    });

    expect(result).toEqual({ ok: false, reason: "Deze factuur is al betaald." });
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it("asks only for what is still owed", async () => {
    await ensureInvoiceCheckout(invoiceFixture(), {
      existing: [paymentFixture({ amountCents: 2100 })],
      persistLink: vi.fn(),
    });

    expect(createPaymentLink).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 10000 }));
  });

  /* Whatever the customer has with us, an invoice link only settles the invoice. */
  it("is always a one-off link, never one that establishes a mandate", async () => {
    await ensureInvoiceCheckout(invoiceFixture(), { existing: [], persistLink: vi.fn() });

    const [args] = createPaymentLink.mock.calls[0] as [{ sequenceType: string; customerId?: string }];
    expect(args.sequenceType).toBe("oneoff");
    expect(args.customerId).toBeUndefined();
  });

  it("says so instead of throwing when Mollie is not configured", async () => {
    delete process.env.MOLLIE_API_KEY;
    const result = await ensureInvoiceCheckout(invoiceFixture(), { existing: [], persistLink: vi.fn() });
    expect(result).toEqual({ ok: false, reason: "Mollie is niet geconfigureerd." });
  });
});

/*
  A link that is replaced while it can still be paid is closed first. Without
  that, the customer holding the older mail could pay the same invoice twice
  -- and the payment would arrive on a link our own row no longer names, so
  the webhook could not even trace it to the invoice.
*/
describe("replacing a link that can still be paid", () => {
  it("archives the old link before the replacement is created", async () => {
    getPaymentLink.mockResolvedValue(link());
    const order: string[] = [];
    archivePaymentLink.mockImplementation(async () => {
      order.push("archive");
      return link({ archived: true });
    });
    createPaymentLink.mockImplementation(async () => {
      order.push("create");
      return link({ id: "pl_2", _links: { paymentLink: { href: "https://x/pl_2" } } });
    });

    const result = await ensureInvoiceCheckout(invoiceFixture(), {
      existing: [paymentFixture({ amountCents: 2100 })],
      storedLink: stored,
      persistLink: vi.fn(),
    });

    expect(result).toMatchObject({ ok: true, paymentLinkId: "pl_2" });
    expect(archivePaymentLink).toHaveBeenCalledWith("pl_1", expect.anything());
    expect(order).toEqual(["archive", "create"]);
  });

  it("makes no second link when the old one cannot be closed", async () => {
    getPaymentLink.mockResolvedValue(link());
    archivePaymentLink.mockRejectedValue(new Error("Mollie 503: unavailable"));

    await expect(
      ensureInvoiceCheckout(invoiceFixture(), {
          existing: [paymentFixture({ amountCents: 2100 })],
        storedLink: stored,
        persistLink: vi.fn(),
      }),
    ).rejects.toThrow("Mollie 503");
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it("leaves a link that is already spent alone", async () => {
    getPaymentLink.mockResolvedValue(link({ paidAt: "2026-09-14T10:00:00.000Z" }));

    await ensureInvoiceCheckout(invoiceFixture(), {
      existing: [paymentFixture({ amountCents: 2100 })],
      storedLink: stored,
      persistLink: vi.fn(),
    });

    expect(archivePaymentLink).not.toHaveBeenCalled();
    expect(createPaymentLink).toHaveBeenCalledTimes(1);
  });
});
