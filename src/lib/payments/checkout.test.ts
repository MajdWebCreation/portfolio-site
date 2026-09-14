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

vi.mock("@/lib/mollie/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mollie/client")>()),
  getPaymentLink: (...args: unknown[]) => getPaymentLink(...args),
  createPaymentLink: (...args: unknown[]) => createPaymentLink(...args),
  createPayment: (...args: unknown[]) => createPayment(...args),
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

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MOLLIE_API_KEY = "test_dummy";
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  createPaymentLink.mockResolvedValue(link());
});

afterEach(() => {
  delete process.env.MOLLIE_API_KEY;
});

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
    the one moment the site may not look broken.
  */
  it("returns the customer to the localised confirmation page", async () => {
    await ensureInvoiceCheckout(invoiceFixture(), { existing: [], persistLink: vi.fn() });

    expect(createPaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({ redirectUrl: "https://example.test/nl/betaling/afgerond?doc=YM-F-2026-000001" }),
    );
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
    A link made before a monthly service was attached asks `oneoff` and would
    never produce a mandate, so it may not be reused for a `first` send.
  */
  it("replaces a one-off link when a mandate is now needed", async () => {
    createPaymentLink.mockResolvedValue(
      link({ id: "pl_2", sequenceType: "first", _links: { paymentLink: { href: "https://payment-link.mollie.com/payment/pl_2" } } }),
    );

    await ensureInvoiceCheckout(invoiceFixture(), {
      existing: [],
      storedLink: stored,
      sequence: "first",
      providerCustomerId: "cst_1",
      persistLink: vi.fn(),
    });

    expect(getPaymentLink).not.toHaveBeenCalled();
    expect(createPaymentLink).toHaveBeenCalledWith(expect.objectContaining({ sequenceType: "first" }));
  });

  it("makes a new link when the outstanding amount changed", async () => {
    createPaymentLink.mockResolvedValue(link({ id: "pl_2", _links: { paymentLink: { href: "https://x/pl_2" } } }));

    await ensureInvoiceCheckout(invoiceFixture(), {
      existing: [paymentFixture({ amountCents: 2100 })],
      storedLink: stored,
      persistLink: vi.fn(),
    });

    expect(getPaymentLink).not.toHaveBeenCalled();
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

  /*
    The one-off invoice that also has to establish a mandate. The sequence is
    the only thing that changes; the amount stays the invoice's own total.
  */
  it("asks for a first payment link when the invoice has to establish a mandate", async () => {
    await ensureInvoiceCheckout(invoiceFixture(), {
      existing: [],
      persistLink: vi.fn(),
      sequence: "first",
      providerCustomerId: "cst_1",
    });

    expect(createPaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({ sequenceType: "first", customerId: "cst_1", amountCents: 12100 }),
    );
    // Paying and authorising is one link, so it is the same return page.
    expect(createPaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({ redirectUrl: "https://example.test/nl/betaling/afgerond?doc=YM-F-2026-000001" }),
    );
  });

  it("charges only the one-off invoice, never a monthly price on top", async () => {
    await ensureInvoiceCheckout(invoiceFixture({ netCents: 150000 }), {
      existing: [],
      persistLink: vi.fn(),
      sequence: "first",
      providerCustomerId: "cst_1",
    });

    // 1.500,00 + 21% and not a cent more.
    expect(createPaymentLink).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 181500 }));
  });

  it("stays a one-off link when nothing has to be authorised", async () => {
    await ensureInvoiceCheckout(invoiceFixture(), { existing: [], persistLink: vi.fn() });

    const [args] = createPaymentLink.mock.calls[0] as [{ sequenceType: string; customerId?: string }];
    expect(args.sequenceType).toBe("oneoff");
    expect(args.customerId).toBeUndefined();
  });

  /* Without a customer at the provider there is nothing to attach a mandate to. */
  it("refuses a first payment link without a provider customer", async () => {
    const result = await ensureInvoiceCheckout(invoiceFixture(), {
      existing: [],
      persistLink: vi.fn(),
      sequence: "first",
    });

    expect(result).toEqual({ ok: false, reason: "Er is geen Mollie-klant om de machtiging aan te koppelen." });
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it("says so instead of throwing when Mollie is not configured", async () => {
    delete process.env.MOLLIE_API_KEY;
    const result = await ensureInvoiceCheckout(invoiceFixture(), { existing: [], persistLink: vi.fn() });
    expect(result).toEqual({ ok: false, reason: "Mollie is niet geconfigureerd." });
  });
});
