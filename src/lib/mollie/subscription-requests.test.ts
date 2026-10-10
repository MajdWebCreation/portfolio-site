import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelPayment,
  cancelSubscription,
  getSubscription,
  isCurrentSubscription,
  listSubscriptionPayments,
  MollieError,
  updateSubscriptionAmount,
} from "@/lib/mollie/client";

/**
 * The exact requests the subscription lifecycle sends to Mollie, against a
 * stubbed `fetch`: the update carries only the amount, the cancellation is
 * a DELETE on the one subscription, and nothing names a mandate or another
 * subscription. See docs.mollie.com/reference/update-subscription and
 * /reference/cancel-subscription.
 */
const config = { apiKey: "test_key", siteUrl: "https://example.test", testMode: true };
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ id: "sub_1", status: "active", amount: { currency: "EUR", value: "18.15" }, nextPaymentDate: "2026-12-04" }), {
      status: 200,
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const lastRequest = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, method: init.method, body: init.body ? JSON.parse(init.body as string) : undefined, headers: init.headers as Record<string, string> };
};

describe("updating the amount", () => {
  it("PATCHes only the amount, as a decimal string, on the customer's subscription", async () => {
    const result = await updateSubscriptionAmount({ customerId: "cst_flexora", subscriptionId: "sub_1", amountCents: 1815, config });

    expect(result).toMatchObject({ id: "sub_1", status: "active" });
    expect(lastRequest()).toMatchObject({
      url: "https://api.mollie.com/v2/customers/cst_flexora/subscriptions/sub_1",
      method: "PATCH",
      body: { amount: { currency: "EUR", value: "18.15" } },
      headers: { Authorization: "Bearer test_key" },
    });
    expect(Object.keys(lastRequest().body)).toEqual(["amount"]);
  });

  it("surfaces Mollie's refusal of a canceled subscription as an error, not a silent no-op", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: 422, detail: "The subscription is canceled" }), { status: 422 }));
    await expect(updateSubscriptionAmount({ customerId: "cst_x", subscriptionId: "sub_x", amountCents: 100, config })).rejects.toBeInstanceOf(MollieError);
  });
});

describe("cancelling", () => {
  it("DELETEs the one subscription, with no body", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: "sub_1", status: "canceled", canceledAt: "2026-11-20T07:00:00+00:00" }), { status: 200 }));
    const result = await cancelSubscription("cst_flexora", "sub_1", config);

    expect(result).toMatchObject({ status: "canceled", canceledAt: "2026-11-20T07:00:00+00:00" });
    expect(lastRequest()).toMatchObject({ url: "https://api.mollie.com/v2/customers/cst_flexora/subscriptions/sub_1", method: "DELETE", body: undefined });
  });

  it("reads a subscription back with GET", async () => {
    const result = await getSubscription("cst_flexora", "sub_1", config);
    expect(result).toMatchObject({ id: "sub_1", nextPaymentDate: "2026-12-04" });
    expect(lastRequest()).toMatchObject({ url: "https://api.mollie.com/v2/customers/cst_flexora/subscriptions/sub_1", method: "GET" });
  });
});

describe("which states are current", () => {
  it("counts pending, active and suspended, and not canceled or completed", () => {
    expect(isCurrentSubscription({ status: "pending" })).toBe(true);
    expect(isCurrentSubscription({ status: "active" })).toBe(true);
    expect(isCurrentSubscription({ status: "suspended" })).toBe(true);
    expect(isCurrentSubscription({ status: "canceled" })).toBe(false);
    expect(isCurrentSubscription({ status: "completed" })).toBe(false);
  });
});

describe("what Mollie already created", () => {
  it("lists the subscription's payments, with the direct debit due date", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          _embedded: {
            payments: [
              { id: "tr_dec", status: "pending", amount: { currency: "EUR", value: "12.10" }, isCancelable: true, subscriptionId: "sub_1", details: { dueDate: "2026-12-04" } },
            ],
          },
        }),
        { status: 200 },
      ),
    );
    const payments = await listSubscriptionPayments("cst_flexora", "sub_1", config);
    expect(payments).toMatchObject([{ id: "tr_dec", isCancelable: true, details: { dueDate: "2026-12-04" } }]);
    expect(lastRequest()).toMatchObject({ url: "https://api.mollie.com/v2/customers/cst_flexora/subscriptions/sub_1/payments?limit=250", method: "GET" });
  });

  it("cancels one payment with a DELETE on the payment itself, and surfaces 422 when Mollie refuses", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: "tr_dec", status: "canceled", canceledAt: "2026-11-05T07:00:00+00:00" }), { status: 200 }));
    expect(await cancelPayment("tr_dec", config)).toMatchObject({ status: "canceled" });
    expect(lastRequest()).toMatchObject({ url: "https://api.mollie.com/v2/payments/tr_dec", method: "DELETE", body: undefined });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: 422, detail: "The payment can no longer be canceled" }), { status: 422 }));
    await expect(cancelPayment("tr_old", config)).rejects.toBeInstanceOf(MollieError);
  });
});
