import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MollieError } from "@/lib/mollie/client";

/*
  The admin connection check. Mollie is stubbed, so no request leaves the
  process and no payment is created anywhere; what is under test is which
  calls this layer is willing to make at all.
*/
const createPayment = vi.fn();
const getPayment = vi.fn();
const requireAdminAccess = vi.fn();

vi.mock("@/lib/mollie/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mollie/client")>()),
  createPayment: (...args: unknown[]) => createPayment(...args),
  getPayment: (...args: unknown[]) => getPayment(...args),
}));
vi.mock("@/lib/admin/access", () => ({
  requireAdminAccess: () => requireAdminAccess(),
  requireAdmin: () => requireAdminAccess(),
}));

const { runMollieIntegrationCheck } = await import("@/lib/payments/integration-check");
const { mollieMode } = await import("@/lib/mollie/config");

const created = {
  id: "tr_check",
  status: "open",
  amount: { currency: "EUR", value: "0.01" },
  description: "YM Creations integratietest (testmodus)",
  method: null,
  _links: { checkout: { href: "https://pay.mollie.com/tr_check" } },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  createPayment.mockResolvedValue(created);
  getPayment.mockResolvedValue(created);
});

afterEach(() => {
  delete process.env.MOLLIE_API_KEY;
});

describe("which Mollie account is configured", () => {
  it("reads the mode from the key itself", () => {
    delete process.env.MOLLIE_API_KEY;
    expect(mollieMode()).toBe("not_configured");
    process.env.MOLLIE_API_KEY = "test_abc123";
    expect(mollieMode()).toBe("test");
    process.env.MOLLIE_API_KEY = "live_abc123";
    expect(mollieMode()).toBe("live");
  });
});

describe("the connection check", () => {
  it("is refused when Mollie is not configured", async () => {
    delete process.env.MOLLIE_API_KEY;
    const result = await runMollieIntegrationCheck();

    expect(result).toEqual({ ok: false, reason: "Mollie is niet geconfigureerd. Zet MOLLIE_API_KEY." });
    expect(createPayment).not.toHaveBeenCalled();
  });

  /* The safety catch: with a live key this would be a real payment. */
  it("never runs against a live key", async () => {
    process.env.MOLLIE_API_KEY = "live_abc123";
    const result = await runMollieIntegrationCheck();

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("alleen met een testsleutel");
    expect(createPayment).not.toHaveBeenCalled();
  });

  it("checks the admin before anything else", async () => {
    process.env.MOLLIE_API_KEY = "test_abc123";
    requireAdminAccess.mockImplementationOnce(() => {
      throw new Error("not an admin");
    });

    await expect(runMollieIntegrationCheck()).rejects.toThrow("not an admin");
    expect(createPayment).not.toHaveBeenCalled();
  });

  it("creates one cent of test money and reads it back", async () => {
    process.env.MOLLIE_API_KEY = "test_abc123";
    const result = await runMollieIntegrationCheck();

    expect(result).toEqual({
      ok: true,
      paymentId: "tr_check",
      status: "open",
      amount: "EUR 0.01",
      checkoutAvailable: true,
      readBack: true,
    });
    expect(createPayment).toHaveBeenCalledTimes(1);
    expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 1, sequenceType: "oneoff" }));
    expect(getPayment).toHaveBeenCalledWith("tr_check", expect.anything());
  });

  /* The marker the webhook drops on, and nothing that names a real record. */
  it("sends only synthetic metadata, carrying the integration marker", async () => {
    process.env.MOLLIE_API_KEY = "test_abc123";
    await runMollieIntegrationCheck();

    const metadata = (createPayment.mock.calls[0]?.[0] as { metadata: Record<string, string> }).metadata;
    expect(metadata).toEqual({ integration_test: "true", kind: "integration_test", source: "admin-integration-check" });
    expect(Object.keys(metadata)).not.toContain("invoiceId");
    expect(Object.keys(metadata)).not.toContain("customerId");
    expect(Object.keys(metadata)).not.toContain("recurringServiceId");
  });

  /* Two clicks in the same minute are one payment, not two. */
  it("reuses one idempotency key per minute", async () => {
    process.env.MOLLIE_API_KEY = "test_abc123";
    await runMollieIntegrationCheck();
    await runMollieIntegrationCheck();

    const [first, second] = createPayment.mock.calls.map((call) => (call[0] as { idempotencyKey: string }).idempotencyKey);
    expect(first).toBe(second);
    expect(first).toMatch(/^integration-check-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("reports Mollie's own refusal without leaking anything else", async () => {
    process.env.MOLLIE_API_KEY = "test_abc123";
    createPayment.mockRejectedValue(new MollieError(401, "Missing authentication, or failed to authenticate"));

    const result = await runMollieIntegrationCheck();

    expect(result).toEqual({
      ok: false,
      reason: "Mollie weigerde het verzoek (401): Missing authentication, or failed to authenticate",
    });
    expect(result.ok === false && result.reason).not.toContain("test_abc123");
  });

  it("still reports success when only the read back failed", async () => {
    process.env.MOLLIE_API_KEY = "test_abc123";
    getPayment.mockRejectedValue(new MollieError(500, "boom"));

    const result = await runMollieIntegrationCheck();

    expect(result).toMatchObject({ ok: true, readBack: false });
  });
});
