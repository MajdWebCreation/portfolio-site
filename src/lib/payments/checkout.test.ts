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
const listPaymentLinkPayments = vi.fn();

vi.mock("@/lib/mollie/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mollie/client")>()),
  getPaymentLink: (...args: unknown[]) => getPaymentLink(...args),
  createPaymentLink: (...args: unknown[]) => createPaymentLink(...args),
  createPayment: (...args: unknown[]) => createPayment(...args),
  archivePaymentLink: (...args: unknown[]) => archivePaymentLink(...args),
  listPaymentLinkPayments: (...args: unknown[]) => listPaymentLinkPayments(...args),
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
  listPaymentLinkPayments.mockResolvedValue([]);
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

    const result = await ensureInvoiceCheckout(invoiceFixture(), { sequence: "oneoff", existing: [], persistLink });

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
    await ensureInvoiceCheckout(invoiceFixture(), { sequence: "oneoff", existing: [], persistLink: vi.fn() });

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
    await ensureInvoiceCheckout(invoiceFixture({ id: invoiceId }), { sequence: "oneoff", existing: [], persistLink: vi.fn() });

    const redirectUrl = redirectUrlOf();
    expect(redirectUrl.startsWith("https://example.test/nl/betaling/afgerond?state=")).toBe(true);
    expect(redirectUrl).not.toContain(invoiceId);
    expect(redirectUrl).not.toContain("YM-F");
  });

  /* The requirement: resending reuses the link the customer already has. */
  it("reuses a link that is still payable instead of making a second one", async () => {
    getPaymentLink.mockResolvedValue(link());

    const result = await ensureInvoiceCheckout(invoiceFixture(), {
      sequence: "oneoff",
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
      sequence: "oneoff",
      existing: [],
      storedLink: stored,
      persistLink: vi.fn(),
    });

    expect(result).toMatchObject({ ok: true, reused: false, paymentLinkId: "pl_2" });
  });

  /*
    A `first` link where the mandate is no longer needed -- it came about
    another way -- would ask for it a second time. It is closed, and the
    invoice gets an ordinary one-off link.
  */
  it("closes a first link that is no longer needed and replaces it with a one-off link", async () => {
    getPaymentLink.mockResolvedValue(link({ sequenceType: "first" }));
    createPaymentLink.mockResolvedValue(
      link({ id: "pl_2", _links: { paymentLink: { href: "https://payment-link.mollie.com/payment/pl_2" } } }),
    );

    const result = await ensureInvoiceCheckout(invoiceFixture(), {
      sequence: "oneoff",
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
      sequence: "oneoff",
      existing: [paymentFixture({ amountCents: 2100 })],
      storedLink: stored,
      persistLink: vi.fn(),
    });

    expect(createPaymentLink).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 10000 }));
  });

  it("refuses to bill an invoice that is already paid", async () => {
    const result = await ensureInvoiceCheckout(invoiceFixture(), {
      sequence: "oneoff",
      existing: [paymentFixture({ amountCents: 12100 })],
      persistLink: vi.fn(),
    });

    expect(result).toEqual({ ok: false, reason: "Deze factuur is al betaald." });
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it("asks only for what is still owed", async () => {
    await ensureInvoiceCheckout(invoiceFixture(), {
      sequence: "oneoff",
      existing: [paymentFixture({ amountCents: 2100 })],
      persistLink: vi.fn(),
    });

    expect(createPaymentLink).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 10000 }));
  });

  /* Whatever the customer has with us, an invoice link only settles the invoice. */
  it("is always a one-off link, never one that establishes a mandate", async () => {
    await ensureInvoiceCheckout(invoiceFixture(), { sequence: "oneoff", existing: [], persistLink: vi.fn() });

    const [args] = createPaymentLink.mock.calls[0] as [{ sequenceType: string; customerId?: string }];
    expect(args.sequenceType).toBe("oneoff");
    expect(args.customerId).toBeUndefined();
  });

  it("says so instead of throwing when Mollie is not configured", async () => {
    delete process.env.MOLLIE_API_KEY;
    const result = await ensureInvoiceCheckout(invoiceFixture(), { sequence: "oneoff", existing: [], persistLink: vi.fn() });
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
      sequence: "oneoff",
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
          sequence: "oneoff",
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
      sequence: "oneoff",
      existing: [paymentFixture({ amountCents: 2100 })],
      storedLink: stored,
      persistLink: vi.fn(),
    });

    expect(archivePaymentLink).not.toHaveBeenCalled();
    expect(createPaymentLink).toHaveBeenCalledTimes(1);
  });
});

/*
  The combined payment: one link for what is still owed on the invoice, asked
  as Mollie's first payment, so paying it also gives the direct debit mandate.
*/
describe("a first-payment link for an invoice", () => {
  const firstStored: StoredPaymentLink = { ...stored, sequenceType: "first" };

  beforeEach(() => {
    getPaymentLink.mockReset();
    archivePaymentLink.mockReset();
    archivePaymentLink.mockResolvedValue(link({ archived: true }));
  });

  it("asks for the outstanding invoice amount as a first payment on our Mollie customer", async () => {
    const persistLink = vi.fn();

    const result = await ensureInvoiceCheckout(invoiceFixture(), { sequence: "first", providerCustomerId: "cst_ours", existing: [], persistLink });

    expect(result).toMatchObject({ ok: true, reused: false });
    expect(createPaymentLink).toHaveBeenCalledTimes(1);
    expect(createPaymentLink.mock.calls[0]?.[0]).toMatchObject({
      amountCents: 12100,
      sequenceType: "first",
      customerId: "cst_ours",
      idempotencyKey: "invoice-link-inv-1-first-12100",
    });
    expect(persistLink).toHaveBeenCalledWith(expect.objectContaining({ sequenceType: "first", amountCents: 12100 }));
  });

  it("reuses a payable first link for the same amount", async () => {
    getPaymentLink.mockResolvedValue(link({ sequenceType: "first" }));

    const result = await ensureInvoiceCheckout(invoiceFixture(), { sequence: "first", providerCustomerId: "cst_ours", existing: [], storedLink: firstStored, persistLink: vi.fn() });

    expect(result).toMatchObject({ ok: true, reused: true, checkoutUrl: "https://payment-link.mollie.com/payment/pl_1" });
    expect(createPaymentLink).not.toHaveBeenCalled();
    expect(archivePaymentLink).not.toHaveBeenCalled();
  });

  it("closes a payable one-off link before making the first link, so only one can be paid", async () => {
    getPaymentLink.mockResolvedValue(link());

    await ensureInvoiceCheckout(invoiceFixture(), { sequence: "first", providerCustomerId: "cst_ours", existing: [], storedLink: stored, persistLink: vi.fn() });

    expect(archivePaymentLink).toHaveBeenCalledWith("pl_1", expect.anything());
    expect(archivePaymentLink.mock.invocationCallOrder[0]).toBeLessThan(createPaymentLink.mock.invocationCallOrder[0]!);
    expect(createPaymentLink.mock.calls[0]?.[0]).toMatchObject({ sequenceType: "first", idempotencyKey: "invoice-link-inv-1-first-12100-after-pl_1" });
  });

  it("replaces an expired first link without handing the old one back", async () => {
    getPaymentLink.mockResolvedValue(link({ sequenceType: "first", expiresAt: "2026-01-01T00:00:00.000Z" }));
    createPaymentLink.mockResolvedValue(link({ id: "pl_2", sequenceType: "first", _links: { paymentLink: { href: "https://payment-link.mollie.com/payment/pl_2" } } }));

    const result = await ensureInvoiceCheckout(invoiceFixture(), { sequence: "first", providerCustomerId: "cst_ours", existing: [], storedLink: firstStored, persistLink: vi.fn() });

    expect(result).toMatchObject({ ok: true, reused: false, checkoutUrl: "https://payment-link.mollie.com/payment/pl_2" });
    expect(archivePaymentLink).not.toHaveBeenCalled();
    expect(createPaymentLink.mock.calls[0]?.[0]).toMatchObject({ idempotencyKey: "invoice-link-inv-1-first-12100-after-pl_1" });
  });

  it("asks for exactly what a part payment and a credit note left", async () => {
    await ensureInvoiceCheckout(invoiceFixture({ creditedCents: 2100 }), {
      sequence: "first",
      providerCustomerId: "cst_ours",
      existing: [paymentFixture({ amountCents: 4000 })],
      persistLink: vi.fn(),
    });

    expect(createPaymentLink.mock.calls[0]?.[0]).toMatchObject({ amountCents: 6000, sequenceType: "first" });
  });

  it("refuses a first link without a Mollie customer to attach the mandate to", async () => {
    const result = await ensureInvoiceCheckout(invoiceFixture(), { sequence: "first", existing: [], persistLink: vi.fn() });

    expect(result.ok).toBe(false);
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it("makes nothing for a paid invoice, whatever the mandate", async () => {
    const result = await ensureInvoiceCheckout(invoiceFixture(), { sequence: "first", providerCustomerId: "cst_ours", existing: [paymentFixture({ amountCents: 12100 })], persistLink: vi.fn() });

    expect(result).toEqual({ ok: false, reason: "Deze factuur is al betaald." });
    expect(createPaymentLink).not.toHaveBeenCalled();
  });
});

/*
  A link is never replaced under a payment that is still running on it, or
  paid while our records do not show it yet: the webhook only traces
  payments of the link our row names, so that payment would be lost and the
  debt offered a second time.
*/
describe("replacing a link that already carries a payment", () => {
  const molliePay = (status: string, id = "tr_old") => ({ id, status, amount: { currency: "EUR", value: "121.00" }, description: "Factuur" });

  beforeEach(() => {
    getPaymentLink.mockReset();
    archivePaymentLink.mockReset();
    archivePaymentLink.mockResolvedValue(link({ archived: true }));
    getPaymentLink.mockResolvedValue(link());
  });

  it.each(["open", "pending", "authorized"])("refuses while a payment on the old link is %s", async (status) => {
    listPaymentLinkPayments.mockResolvedValue([molliePay(status)]);

    const result = await ensureInvoiceCheckout(invoiceFixture(), { sequence: "first", providerCustomerId: "cst_ours", existing: [], storedLink: stored, persistLink: vi.fn() });

    expect(result).toEqual({ ok: false, reason: "Er loopt nog een betaling via de vorige betaallink van deze factuur." });
    expect(archivePaymentLink).not.toHaveBeenCalled();
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it("refuses when the old link was paid and its webhook has not landed", async () => {
    getPaymentLink.mockResolvedValue(link({ paidAt: "2026-10-12T10:00:00.000Z" }));
    listPaymentLinkPayments.mockResolvedValue([molliePay("paid")]);

    const result = await ensureInvoiceCheckout(invoiceFixture(), { sequence: "oneoff", existing: [], storedLink: stored, persistLink: vi.fn() });

    expect(result.ok).toBe(false);
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it("replaces it once that paid payment is on record, for what is left", async () => {
    getPaymentLink.mockResolvedValue(link({ paidAt: "2026-10-12T10:00:00.000Z" }));
    listPaymentLinkPayments.mockResolvedValue([molliePay("paid")]);

    const result = await ensureInvoiceCheckout(invoiceFixture(), {
      sequence: "oneoff",
      existing: [paymentFixture({ amountCents: 2100, providerPaymentId: "tr_old" })],
      storedLink: stored,
      persistLink: vi.fn(),
    });

    expect(result).toMatchObject({ ok: true, reused: false });
    expect(createPaymentLink.mock.calls[0]?.[0]).toMatchObject({ amountCents: 10000 });
  });

  it("replaces it after a failed or expired attempt", async () => {
    listPaymentLinkPayments.mockResolvedValue([molliePay("failed"), molliePay("expired", "tr_older")]);

    const result = await ensureInvoiceCheckout(invoiceFixture(), { sequence: "first", providerCustomerId: "cst_ours", existing: [], storedLink: stored, persistLink: vi.fn() });

    expect(result).toMatchObject({ ok: true, reused: false });
    expect(archivePaymentLink).toHaveBeenCalledWith("pl_1", expect.anything());
  });
});

