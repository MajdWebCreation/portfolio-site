import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MolliePayment } from "@/lib/mollie/client";
import { invoiceFixture, paymentFixture } from "@/lib/payments/fixtures";

/*
  Resending an invoice must not hand the customer a second live payment link
  for the same debt. Mollie is stubbed at the client module, so no request
  leaves the process.
*/
const getPayment = vi.fn();
const createPayment = vi.fn();

vi.mock("@/lib/mollie/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mollie/client")>()),
  getPayment: (...args: unknown[]) => getPayment(...args),
  createPayment: (...args: unknown[]) => createPayment(...args),
}));

const { ensureInvoiceCheckout } = await import("@/lib/payments/checkout");

function mollie(overrides: Partial<MolliePayment> = {}): MolliePayment {
  return {
    id: "tr_1",
    status: "open",
    amount: { currency: "EUR", value: "121.00" },
    description: "Factuur",
    method: null,
    _links: { checkout: { href: "https://pay.mollie.com/tr_1" } },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MOLLIE_API_KEY = "test_dummy";
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
});

afterEach(() => {
  delete process.env.MOLLIE_API_KEY;
});

describe("a payment link for an invoice", () => {
  it("creates one when there is nothing to reuse", async () => {
    createPayment.mockResolvedValue(mollie());
    const persist = vi.fn();

    const result = await ensureInvoiceCheckout(invoiceFixture(), { existing: [], persist });

    expect(result).toMatchObject({ ok: true, reused: false, checkoutUrl: "https://pay.mollie.com/tr_1" });
    expect(createPayment).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  /* The requirement: resending reuses the attempt that is still running. */
  it("reuses an attempt that is still open instead of making a second one", async () => {
    getPayment.mockResolvedValue(mollie());
    const existing = [paymentFixture({ status: "open", providerPaymentId: "tr_1" })];

    const result = await ensureInvoiceCheckout(invoiceFixture(), { existing, persist: vi.fn() });

    expect(result).toMatchObject({ ok: true, reused: true, checkoutUrl: "https://pay.mollie.com/tr_1" });
    expect(createPayment).not.toHaveBeenCalled();
  });

  it("starts a fresh attempt when the previous one expired", async () => {
    getPayment.mockResolvedValue(mollie({ status: "expired", _links: {} }));
    createPayment.mockResolvedValue(mollie({ id: "tr_2", _links: { checkout: { href: "https://pay.mollie.com/tr_2" } } }));

    const result = await ensureInvoiceCheckout(invoiceFixture(), {
      existing: [paymentFixture({ status: "open", providerPaymentId: "tr_1" })],
      persist: vi.fn(),
    });

    expect(result).toMatchObject({ ok: true, reused: false, checkoutUrl: "https://pay.mollie.com/tr_2" });
  });

  it("refuses to bill an invoice that is already paid", async () => {
    const result = await ensureInvoiceCheckout(invoiceFixture(), {
      existing: [paymentFixture({ amountCents: 12100 })],
      persist: vi.fn(),
    });

    expect(result).toEqual({ ok: false, reason: "Deze factuur is al betaald." });
    expect(createPayment).not.toHaveBeenCalled();
  });

  it("asks only for what is still owed", async () => {
    createPayment.mockResolvedValue(mollie());
    await ensureInvoiceCheckout(invoiceFixture(), {
      existing: [paymentFixture({ amountCents: 2100 })],
      persist: vi.fn(),
    });

    expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 10000 }));
  });

  it("says so instead of throwing when Mollie is not configured", async () => {
    delete process.env.MOLLIE_API_KEY;
    const result = await ensureInvoiceCheckout(invoiceFixture(), { existing: [], persist: vi.fn() });
    expect(result).toEqual({ ok: false, reason: "Mollie is niet geconfigureerd." });
  });
});
