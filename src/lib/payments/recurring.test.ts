import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/lib/payments/fixtures";
import { createActivationToken } from "@/lib/payments/tokens";

/*
  Activation, with Supabase and Mollie both replaced in memory. The fake
  database enforces the same unique keys the real schema does, so a duplicate
  that Postgres would refuse is refused here too.
*/
const createCustomer = vi.fn();
const createPayment = vi.fn();
const getPayment = vi.fn();

vi.mock("@/lib/mollie/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mollie/client")>()),
  createCustomer: (...args: unknown[]) => createCustomer(...args),
  createPayment: (...args: unknown[]) => createPayment(...args),
  getPayment: (...args: unknown[]) => getPayment(...args),
}));

let db: ReturnType<typeof createFakeDb>;
vi.mock("@/lib/payments/admin-client", () => ({
  paymentsAdminClient: () => db,
  hasPaymentsAdminAccess: () => true,
}));

const { readActivation, startActivation } = await import("@/lib/payments/recurring");

const first = createActivationToken();
const second = createActivationToken();

function seed(overrides: { services?: Record<string, unknown>[]; activations?: Record<string, unknown>[] } = {}) {
  return createFakeDb({
    customers: [{ id: "cust-1", company_name: "Alfa BV", contact_name: "A. Alfa", email: "a@example.com" }],
    recurring_services: overrides.services ?? [
      {
        id: "svc-1",
        customer_id: "cust-1",
        name: "Websitebeheer",
        description: "",
        amount_cents: 2500,
        currency: "EUR",
        vat_rate: 21,
        billing_interval: "monthly",
        starts_on: null,
        status: "draft",
        mollie_subscription_id: null,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
      },
    ],
    recurring_activations: overrides.activations ?? [
      {
        id: "act-1",
        recurring_service_id: "svc-1",
        token_hash: first.tokenHash,
        expires_at: "2099-01-01T00:00:00.000Z",
        used_at: null,
        mollie_payment_id: null,
      },
    ],
    customer_payment_providers: [],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MOLLIE_API_KEY = "test_dummy";
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  db = seed();
  createCustomer.mockResolvedValue({ id: "cst_1" });
  createPayment.mockResolvedValue({
    id: "tr_first",
    status: "open",
    amount: { currency: "EUR", value: "25.00" },
    description: "x",
    method: null,
    _links: { checkout: { href: "https://pay.mollie.com/tr_first" } },
  });
});

describe("opening the activation link (GET)", () => {
  /* The whole point: a prefetch or a scanner must cost nothing. */
  it("creates nothing at the provider and consumes no token", async () => {
    const view = await readActivation(first.token);

    // What the customer pays: 25,00 excl. btw is 30,25 incl.
    expect(view).toMatchObject({ ok: true, serviceName: "Websitebeheer", amountCents: 3025, contactName: "A. Alfa" });
    expect(createCustomer).not.toHaveBeenCalled();
    expect(createPayment).not.toHaveBeenCalled();
    expect(db.rows("customer_payment_providers")).toHaveLength(0);
    expect(db.rows("recurring_activations")[0]?.used_at).toBeNull();
    expect(db.rows("recurring_activations")[0]?.mollie_payment_id).toBeNull();
    expect(db.rows("recurring_services")[0]?.status).toBe("draft");
  });

  it("says so for a token it does not know, without touching anything", async () => {
    const view = await readActivation(createActivationToken().token);
    expect(view).toEqual({ ok: false, reason: "unknown" });
    expect(createPayment).not.toHaveBeenCalled();
  });

  it("refuses a malformed token before it reaches the database", async () => {
    expect(await readActivation("../../etc/passwd")).toEqual({ ok: false, reason: "unknown" });
  });

  it("reports an expired link", async () => {
    db = seed({
      activations: [
        {
          id: "act-1",
          recurring_service_id: "svc-1",
          token_hash: first.tokenHash,
          expires_at: "2020-01-01T00:00:00.000Z",
          used_at: null,
          mollie_payment_id: null,
        },
      ],
    });
    expect(await readActivation(first.token)).toEqual({ ok: false, reason: "expired" });
  });
});

describe("starting direct debit (POST)", () => {
  it("creates the provider customer and the first payment once", async () => {
    const result = await startActivation(first.token);

    expect(result).toEqual({ ok: true, checkoutUrl: "https://pay.mollie.com/tr_first" });
    expect(createPayment).toHaveBeenCalledTimes(1);
    expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({ sequenceType: "first", amountCents: 3025 }));
    expect(db.rows("recurring_activations")[0]?.mollie_payment_id).toBe("tr_first");
    expect(db.rows("recurring_services")[0]?.status).toBe("awaiting_mandate");
  });

  /* Double clicking must not produce a second first-payment. */
  it("resumes the same payment when posted again", async () => {
    await startActivation(first.token);
    getPayment.mockResolvedValue({
      id: "tr_first",
      status: "open",
      amount: { currency: "EUR", value: "25.00" },
      description: "x",
      method: null,
      _links: { checkout: { href: "https://pay.mollie.com/tr_first" } },
    });

    const again = await startActivation(first.token);

    expect(again).toEqual({ ok: true, checkoutUrl: "https://pay.mollie.com/tr_first" });
    expect(createPayment).toHaveBeenCalledTimes(1);
  });

  it("creates one first payment when two posts arrive together", async () => {
    getPayment.mockResolvedValue({
      id: "tr_first",
      status: "open",
      amount: { currency: "EUR", value: "25.00" },
      description: "x",
      method: null,
      _links: { checkout: { href: "https://pay.mollie.com/tr_first" } },
    });

    const results = await Promise.all([startActivation(first.token), startActivation(first.token)]);

    expect(results.every((result) => result.ok)).toBe(true);
    expect(db.rows("recurring_activations")[0]?.mollie_payment_id).toBe("tr_first");
    expect(db.rows("customer_payment_providers")).toHaveLength(1);
  });

  /*
    The ownership rule: one YM customer is one Mollie customer, however many
    services they buy.
  */
  it("reuses the same provider customer for a second service", async () => {
    const service = db.rows("recurring_services")[0]!;
    db.rows("recurring_services").push({ ...service, id: "svc-2", name: "Hosting", amount_cents: 1000 });
    db.rows("recurring_activations").push({
      id: "act-2",
      recurring_service_id: "svc-2",
      token_hash: second.tokenHash,
      expires_at: "2099-01-01T00:00:00.000Z",
      used_at: null,
      mollie_payment_id: null,
    });
    createPayment.mockResolvedValueOnce({
      id: "tr_a",
      status: "open",
      amount: { currency: "EUR", value: "25.00" },
      description: "x",
      method: null,
      _links: { checkout: { href: "https://pay.mollie.com/tr_a" } },
    });
    createPayment.mockResolvedValueOnce({
      id: "tr_b",
      status: "open",
      amount: { currency: "EUR", value: "10.00" },
      description: "x",
      method: null,
      _links: { checkout: { href: "https://pay.mollie.com/tr_b" } },
    });

    await startActivation(first.token);
    await startActivation(second.token);

    expect(createCustomer).toHaveBeenCalledTimes(1);
    expect(db.rows("customer_payment_providers")).toHaveLength(1);
    expect(db.rows("customer_payment_providers")[0]).toMatchObject({ customer_id: "cust-1", provider: "mollie", provider_customer_id: "cst_1" });
    // Both payments were made for the same provider customer.
    for (const call of createPayment.mock.calls) {
      expect(call[0]).toMatchObject({ customerId: "cst_1" });
    }
  });

  it("refuses once a subscription exists", async () => {
    db.rows("recurring_services")[0]!.mollie_subscription_id = "sub_1";
    expect(await startActivation(first.token)).toEqual({ ok: false, reason: "used" });
    expect(createPayment).not.toHaveBeenCalled();
  });
});
