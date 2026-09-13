import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, invoiceFixture } from "@/lib/payments/fixtures";

/*
  Which payment an invoice mail asks for. Supabase and Mollie are both in
  memory; nothing here reaches the network, and the mandate question is put to
  the stubbed provider exactly as the real code puts it to Mollie.
*/
const createPaymentLink = vi.fn();
const getPaymentLink = vi.fn();
const createPayment = vi.fn();
const createCustomer = vi.fn();
const listMandates = vi.fn();

vi.mock("@/lib/mollie/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mollie/client")>()),
  createPaymentLink: (...args: unknown[]) => createPaymentLink(...args),
  getPaymentLink: (...args: unknown[]) => getPaymentLink(...args),
  createPayment: (...args: unknown[]) => createPayment(...args),
  createCustomer: (...args: unknown[]) => createCustomer(...args),
  listMandates: (...args: unknown[]) => listMandates(...args),
}));

let db: ReturnType<typeof createFakeDb>;
vi.mock("@/lib/admin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/db")>()),
  adminDb: async () => db,
}));

const { invoicePayLink } = await import("@/lib/payments/pay-link");

const service = (overrides: Record<string, unknown> = {}) => ({
  id: "svc-1",
  customer_id: "cust-1",
  name: "Websitebeheer",
  description: "",
  amount_cents: 2500,
  currency: "EUR",
  vat_rate: 21,
  billing_interval: "monthly",
  starts_on: "2026-10-01",
  status: "draft",
  project_id: null,
  activation_invoice_id: "inv-1",
  mollie_subscription_id: null,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
  ...overrides,
});

function seed(
  rows: {
    services?: Record<string, unknown>[];
    providers?: Record<string, unknown>[];
    links?: Record<string, unknown>[];
  } = {},
) {
  return createFakeDb({
    recurring_services: rows.services ?? [],
    customer_payment_providers: rows.providers ?? [],
    invoice_payment_links: rows.links ?? [],
    payments: [],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MOLLIE_API_KEY = "test_dummy";
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  db = seed();
  createCustomer.mockResolvedValue({ id: "cst_1" });
  listMandates.mockResolvedValue([]);
  createPaymentLink.mockResolvedValue({
    id: "pl_1",
    description: "Factuur",
    amount: { currency: "EUR", value: "121.00" },
    _links: { paymentLink: { href: "https://payment-link.mollie.com/payment/pl_1" } },
  });
});

describe("a plain invoice", () => {
  it("gets an ordinary one-off payment link", async () => {
    const result = await invoicePayLink(invoiceFixture());

    expect(result).toMatchObject({ kind: "link", url: "https://payment-link.mollie.com/payment/pl_1" });
    expect(createPaymentLink).toHaveBeenCalledWith(expect.objectContaining({ sequenceType: "oneoff" }));
    // A payment link, never the short-lived checkout of a Payments-API payment.
    expect(createPayment).not.toHaveBeenCalled();
    // Nothing to authorise, so no customer is created at the provider.
    expect(createCustomer).not.toHaveBeenCalled();
    expect(listMandates).not.toHaveBeenCalled();
  });

  /* The mapping Mollie cannot hold for us: which invoice a link belongs to. */
  it("records the link against the invoice", async () => {
    await invoicePayLink(invoiceFixture());

    expect(db.rows("invoice_payment_links")).toMatchObject([
      {
        invoice_id: "inv-1",
        customer_id: "cust-1",
        provider: "mollie",
        provider_payment_link_id: "pl_1",
        checkout_url: "https://payment-link.mollie.com/payment/pl_1",
        sequence_type: "oneoff",
        amount_cents: 12100,
      },
    ]);
  });

  it("hands out the link it already recorded instead of a second one", async () => {
    db = seed({
      links: [
        {
          id: "lnk-1",
          invoice_id: "inv-1",
          customer_id: "cust-1",
          provider: "mollie",
          provider_payment_link_id: "pl_1",
          checkout_url: "https://payment-link.mollie.com/payment/pl_1",
          sequence_type: "oneoff",
          amount_cents: 12100,
        },
      ],
    });
    getPaymentLink.mockResolvedValue({
      id: "pl_1",
      description: "Factuur",
      _links: { paymentLink: { href: "https://payment-link.mollie.com/payment/pl_1" } },
    });

    const result = await invoicePayLink(invoiceFixture());

    expect(result).toMatchObject({ kind: "link", url: "https://payment-link.mollie.com/payment/pl_1" });
    expect(createPaymentLink).not.toHaveBeenCalled();
    expect(db.rows("invoice_payment_links")).toHaveLength(1);
  });
});

describe("an invoice that switches a monthly service on", () => {
  it("asks for a first payment and attaches the customer", async () => {
    db = seed({ services: [service()] });

    const result = await invoicePayLink(invoiceFixture());

    expect(result).toMatchObject({ kind: "link" });
    expect(result.kind === "link" && result.decision.sequence).toBe("first");
    expect(createPaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({ sequenceType: "first", customerId: "cst_1", amountCents: 12100 }),
    );
  });

  /* One Mollie customer per YM customer, whatever activates a service. */
  it("reuses the provider customer the administration already holds", async () => {
    db = seed({
      services: [service()],
      providers: [
        {
          id: "cpp-1",
          customer_id: "cust-1",
          provider: "mollie",
          provider_customer_id: "cst_known",
          provider_mandate_id: null,
        },
      ],
    });

    await invoicePayLink(invoiceFixture());

    expect(createCustomer).not.toHaveBeenCalled();
    expect(createPaymentLink).toHaveBeenCalledWith(expect.objectContaining({ customerId: "cst_known" }));
  });

  /*
    The customer already authorised us. Asking again through a first payment
    would be asking for permission we have; the ordinary link is enough and
    the webhook can switch the service on from the existing mandate.
  */
  it("stays a one-off payment when a usable mandate already exists", async () => {
    db = seed({
      services: [service()],
      providers: [
        {
          id: "cpp-1",
          customer_id: "cust-1",
          provider: "mollie",
          provider_customer_id: "cst_known",
          provider_mandate_id: "mdt_known",
        },
      ],
    });
    listMandates.mockResolvedValue([{ id: "mdt_known", status: "valid", method: "directdebit" }]);

    const result = await invoicePayLink(invoiceFixture());

    expect(result.kind === "link" && result.decision.reason).toBe("mandate-already-given");
    expect(createPaymentLink).toHaveBeenCalledWith(expect.objectContaining({ sequenceType: "oneoff" }));
  });

  /* A revoked mandate is not a mandate; the customer is asked again. */
  it("asks again when the only mandate at the provider is invalid", async () => {
    db = seed({
      services: [service()],
      providers: [
        {
          id: "cpp-1",
          customer_id: "cust-1",
          provider: "mollie",
          provider_customer_id: "cst_known",
          provider_mandate_id: "mdt_old",
        },
      ],
    });
    listMandates.mockResolvedValue([{ id: "mdt_old", status: "invalid", method: "directdebit" }]);

    const result = await invoicePayLink(invoiceFixture());

    expect(result.kind === "link" && result.decision.sequence).toBe("first");
  });

  it("stays a one-off payment when the service already collects", async () => {
    db = seed({ services: [service({ mollie_subscription_id: "sub_1" })] });

    const result = await invoicePayLink(invoiceFixture());

    expect(result.kind === "link" && result.decision.reason).toBe("already-subscribed");
    expect(createPaymentLink).toHaveBeenCalledWith(expect.objectContaining({ sequenceType: "oneoff" }));
  });

  /* The monthly price is collected by the subscription, never by this link. */
  it("never adds the monthly amount to the payment link", async () => {
    db = seed({ services: [service({ amount_cents: 9900 })] });

    await invoicePayLink(invoiceFixture());

    const [args] = createPaymentLink.mock.calls[0] as [{ amountCents: number }];
    expect(args.amountCents).toBe(12100);
  });
});
