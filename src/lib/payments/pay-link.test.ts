import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, customerRowFixture, invoiceFixture, paymentFixture } from "@/lib/payments/fixtures";

/*
  Which payment an invoice mail -- and every reminder after it -- asks for.
  Supabase and Mollie are both in memory; nothing here reaches the network.

  The rule these tests hold: an invoice payment link is always a one-off
  payment. Paying an invoice settles that invoice and nothing else. Direct
  debit is activated on its own, through a separate EUR 0.01 link, so no
  invoice -- whatever services or mandates its customer has -- ever produces a
  `first` payment, a Mollie customer or a mandate question.
*/
const createPaymentLink = vi.fn();
const getPaymentLink = vi.fn();
const createPayment = vi.fn();
const createCustomer = vi.fn();
const listMandates = vi.fn();
const archivePaymentLink = vi.fn();

vi.mock("@/lib/mollie/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mollie/client")>()),
  createPaymentLink: (...args: unknown[]) => createPaymentLink(...args),
  getPaymentLink: (...args: unknown[]) => getPaymentLink(...args),
  createPayment: (...args: unknown[]) => createPayment(...args),
  createCustomer: (...args: unknown[]) => createCustomer(...args),
  listMandates: (...args: unknown[]) => listMandates(...args),
  archivePaymentLink: (...args: unknown[]) => archivePaymentLink(...args),
}));

let db: ReturnType<typeof createFakeDb>;
vi.mock("@/lib/admin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/db")>()),
  adminDb: async () => db,
}));

const { invoicePayLink, reminderPayLink } = await import("@/lib/payments/pay-link");

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

const knownCustomer = {
  id: "cpp-1",
  customer_id: "cust-1",
  provider: "mollie",
  provider_customer_id: "cst_known",
  provider_mandate_id: null,
};

const storedLink = (overrides: Record<string, unknown> = {}) => ({
  id: "lnk-1",
  invoice_id: "inv-1",
  customer_id: "cust-1",
  provider: "mollie",
  provider_payment_link_id: "pl_old",
  checkout_url: "https://payment-link.mollie.com/payment/pl_old",
  sequence_type: "oneoff",
  amount_cents: 12100,
  ...overrides,
});

const mollieLink = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  description: "Factuur",
  _links: { paymentLink: { href: `https://payment-link.mollie.com/payment/${id}` } },
  ...overrides,
});
const expired = { expiresAt: "2026-01-01T00:00:00.000Z" };

function seed(
  rows: {
    services?: Record<string, unknown>[];
    providers?: Record<string, unknown>[];
    links?: Record<string, unknown>[];
  } = {},
) {
  return createFakeDb({
    customers: [customerRowFixture()],
    recurring_services: rows.services ?? [],
    customer_payment_providers: rows.providers ?? [],
    invoice_payment_links: rows.links ?? [],
    payments: [],
  });
}

/** The current links at Mollie, by id: what getPaymentLink answers. */
let atMollie: Record<string, Record<string, unknown>>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MOLLIE_API_KEY = "test_dummy";
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  db = seed();
  atMollie = {};
  listMandates.mockResolvedValue([]);
  getPaymentLink.mockImplementation(async (id: string) => atMollie[id] ?? mollieLink(id));
  archivePaymentLink.mockImplementation(async (id: string) => ({ ...mollieLink(id), archived: true }));
  createPaymentLink.mockImplementation(async () => mollieLink("pl_new"));
});

/** What actually left for Mollie, minus the signed redirect and the config. */
function payload(call = 0) {
  const args = createPaymentLink.mock.calls[call]?.[0] as Record<string, unknown> | undefined;
  if (!args) return undefined;
  return Object.fromEntries(Object.entries(args).filter(([key]) => key !== "redirectUrl" && key !== "config"));
}

const oneOffRequest = {
  amountCents: 12100,
  description: "YM Creations factuur YM-F-2026-000001",
  webhookUrl: "https://example.test/api/mollie/webhook?invoice=inv-1",
  sequenceType: "oneoff",
  idempotencyKey: "invoice-link-inv-1-oneoff-12100",
};

/* A link made in place of a stored one carries that one in its key, so an earlier amount never gets the archived link back. */
const replacingRequest = { ...oneOffRequest, idempotencyKey: "invoice-link-inv-1-oneoff-12100-after-pl_old" };

/** Nothing about direct debit was asked of Mollie or made there. */
function expectNoMandateWork() {
  expect(listMandates).not.toHaveBeenCalled();
  expect(createCustomer).not.toHaveBeenCalled();
  expect(createPayment).not.toHaveBeenCalled();
}

describe("the payment link of an invoice mail", () => {
  it("is an ordinary one-off payment link", async () => {
    const result = await invoicePayLink(invoiceFixture());

    expect(result).toEqual({ kind: "link", url: "https://payment-link.mollie.com/payment/pl_new" });
    expect(payload()).toEqual(oneOffRequest);
    expectNoMandateWork();
  });

  /* The mapping Mollie cannot hold for us: which invoice a link belongs to. */
  it("is recorded against the invoice", async () => {
    await invoicePayLink(invoiceFixture());

    expect(db.rows("invoice_payment_links")).toMatchObject([
      {
        invoice_id: "inv-1",
        customer_id: "cust-1",
        provider: "mollie",
        provider_payment_link_id: "pl_new",
        sequence_type: "oneoff",
        amount_cents: 12100,
      },
    ]);
  });

  it("hands out the link it already recorded instead of a second one", async () => {
    db = seed({ links: [storedLink()] });

    const result = await invoicePayLink(invoiceFixture());

    expect(result).toEqual({ kind: "link", url: "https://payment-link.mollie.com/payment/pl_old" });
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  /*
    The case that used to ask for a mandate: a monthly service hangs off this
    invoice and the customer has not authorised anything. The invoice is still
    only an invoice.
  */
  it("stays one-off when a monthly service hangs off the invoice and there is no mandate", async () => {
    db = seed({ services: [service()], providers: [knownCustomer] });

    await invoicePayLink(invoiceFixture());

    expect(payload()).toEqual(oneOffRequest);
    expectNoMandateWork();
  });

  it("refuses a new payment option when a paid invoice is sent again", async () => {
    db = seed({ links: [storedLink()] });
    db.rows("payments").push({
      id: "pay-1",
      invoice_id: "inv-1",
      customer_id: "cust-1",
      amount_cents: 12100,
      currency: "EUR",
      status: "paid",
      source: "mollie",
      provider_payment_id: "tr_1",
      method: "ideal",
      paid_at: "2026-10-07T09:26:51.000Z",
      description: "Factuur",
      created_at: "2026-10-07T09:28:09.000Z",
      updated_at: "2026-10-07T09:28:09.000Z",
    });

    const result = await invoicePayLink(invoiceFixture({ status: "paid" }));

    expect(result).toEqual({ kind: "failed", reason: "Deze factuur is al betaald." });
    expect(createPaymentLink).not.toHaveBeenCalled();
    expect(archivePaymentLink).not.toHaveBeenCalled();
  });
});

/*
  The reminders. They ask the same thing the invoice mail asked -- a one-off
  payment of what is still owed -- through the same function, so the two can
  never disagree about what paying does.
*/
/*
  One rule for every door that hands out an ordinary invoice payment: the
  admin's send, the portal and the reminder all ask payLinkFor, so none of
  them starts a second payment beside one that is still running.
*/
describe("an invoice with a payment still in flight", () => {
  const pending = (status: "open" | "pending") => ({
    id: "pay-pending",
    invoice_id: "inv-1",
    customer_id: "cust-1",
    amount_cents: 12100,
    currency: "EUR",
    status,
    source: "mollie",
    provider_payment_id: "tr_pending",
    method: "directdebit",
    description: "Factuur",
    paid_at: null,
    created_at: "2026-09-20T10:00:00.000Z",
    updated_at: "2026-09-20T10:00:00.000Z",
  });

  it.each(["open", "pending"] as const)("gets no link from the admin's send either (%s), and Mollie is not asked", async (status) => {
    db = createFakeDb({ customers: [customerRowFixture()], recurring_services: [], invoice_payment_links: [storedLink()], payments: [pending(status)] });

    expect(await invoicePayLink(invoiceFixture())).toEqual({ kind: "none", reason: "payment-in-flight" });
    expect(getPaymentLink).not.toHaveBeenCalled();
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it("gets its link back once the attempt failed", async () => {
    db = createFakeDb({ customers: [customerRowFixture()], recurring_services: [], invoice_payment_links: [], payments: [{ ...pending("pending"), status: "failed" }] });

    expect(await invoicePayLink(invoiceFixture())).toEqual({ kind: "link", url: "https://payment-link.mollie.com/payment/pl_new" });
  });
});

describe("the payment button on a reminder", () => {
  const remind = (invoice = invoiceFixture(), payments: Parameters<typeof reminderPayLink>[2] = []) =>
    reminderPayLink(db as never, invoice, payments);

  it("reuses the invoice's open link", async () => {
    db = seed({ links: [storedLink()] });

    const url = await remind();

    expect(url).toBe("https://payment-link.mollie.com/payment/pl_old");
    expect(createPaymentLink).not.toHaveBeenCalled();
    expect(archivePaymentLink).not.toHaveBeenCalled();
  });

  it("makes at most one new link across two reminders", async () => {
    db = seed({ links: [storedLink()] });
    atMollie.pl_old = mollieLink("pl_old", expired);

    const first = await remind();
    const second = await remind();

    expect(first).toBe("https://payment-link.mollie.com/payment/pl_new");
    expect(second).toBe(first);
    expect(createPaymentLink).toHaveBeenCalledTimes(1);
    expect(payload()).toEqual(replacingRequest);
    expect(db.rows("invoice_payment_links")).toHaveLength(1);
  });

  /*
    A `first` link from before invoices stopped asking for a mandate. A
    reminder closes it -- so it cannot authorise direct debit as a side effect
    -- and carries an ordinary one-off link instead.
  */
  it("closes a legacy first link and carries a one-off link", async () => {
    db = seed({ services: [service()], providers: [knownCustomer], links: [storedLink({ sequence_type: "first" })] });

    const url = await remind();

    expect(archivePaymentLink).toHaveBeenCalledWith("pl_old", expect.anything());
    expect(url).toBe("https://payment-link.mollie.com/payment/pl_new");
    expect(payload()).toEqual(replacingRequest);
    expectNoMandateWork();
  });

  it("stays one-off whatever the customer's mandate", async () => {
    db = seed({ services: [service()], providers: [{ ...knownCustomer, provider_mandate_id: "mdt_ok" }] });
    listMandates.mockResolvedValue([{ id: "mdt_ok", status: "valid", method: "directdebit" }]);

    await remind();

    expect(payload()).toEqual(oneOffRequest);
    expect(listMandates).not.toHaveBeenCalled();
  });

  /*
    The button is the portal's own decision: never a second way to pay beside
    a collection that may be under way, or beside an attempt still running.
  */
  const linkedService = (status: string) => service({ status, activation_invoice_id: null });
  const onService = (overrides: Parameters<typeof invoiceFixture>[0] = {}) => invoiceFixture({ recurringServiceId: "svc-1", ...overrides });

  it("offers the ordinary link on an open invoice without direct debit", async () => {
    expect(await remind()).toBe("https://payment-link.mollie.com/payment/pl_new");
    expect(payload()).toEqual(oneOffRequest);
  });

  it("offers nothing, and asks Mollie nothing, on an invoice a running direct debit collects", async () => {
    db = seed({ services: [linkedService("active")], links: [storedLink()] });

    expect(await remind(onService())).toBeUndefined();
    expect(getPaymentLink).not.toHaveBeenCalled();
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it.each(["pending", "open"] as const)("offers nothing while a payment is %s, also without direct debit", async (status) => {
    db = seed({ links: [storedLink()] });

    expect(await remind(invoiceFixture(), [paymentFixture({ status })])).toBeUndefined();
    expect(await remind(onService(), [paymentFixture({ status, amountCents: 3025 })])).toBeUndefined();
    expect(getPaymentLink).not.toHaveBeenCalled();
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it.each(["paused", "canceled"])("offers the link again once the service no longer collects (%s), after a failed collection", async (status) => {
    db = seed({ services: [linkedService(status)] });

    const url = await remind(onService(), [paymentFixture({ status: "failed" })]);

    expect(url).toBe("https://payment-link.mollie.com/payment/pl_new");
    expect(payload()).toEqual(oneOffRequest);
  });

  it("offers the link again after a failed collection that nothing repaired: Mollie does not retry it", async () => {
    db = seed({ services: [linkedService("active")] });

    const url = await remind(onService(), [paymentFixture({ status: "failed", paidAt: undefined })]);

    expect(url).toBe("https://payment-link.mollie.com/payment/pl_new");
    expect(payload()).toEqual(oneOffRequest);
  });

  it("offers nothing again once a new attempt is running after the failure", async () => {
    db = seed({ services: [linkedService("active")] });

    const url = await remind(onService(), [
      paymentFixture({ id: "p1", status: "failed", paidAt: undefined, updatedAt: "2026-10-02T00:00:00.000Z" }),
      paymentFixture({ id: "p2", status: "pending", paidAt: undefined, updatedAt: "2026-10-03T00:00:00.000Z" }),
    ]);

    expect(url).toBeUndefined();
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it("offers nothing when the service cannot be read: not knowing is not 'no direct debit'", async () => {
    db = seed({ services: [linkedService("paused")] });
    const failing = {
      ...db,
      from: (table: string) =>
        table === "recurring_services"
          ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "connection reset" } }) }) }) }
          : db.from(table),
    };
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await reminderPayLink(failing as never, onService(), [])).toBeUndefined();
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it("asks for what is left after a part payment, and makes one link across retries", async () => {
    const first = await remind(invoiceFixture(), [paymentFixture({ amountCents: 2100 })]);
    const retry = await remind(invoiceFixture(), [paymentFixture({ amountCents: 2100 })]);

    expect(first).toBe("https://payment-link.mollie.com/payment/pl_new");
    expect(retry).toBe(first);
    expect(createPaymentLink).toHaveBeenCalledTimes(1);
    expect(payload()).toMatchObject({ amountCents: 10000, sequenceType: "oneoff" });
    expect(db.rows("invoice_payment_links")).toHaveLength(1);
  });

  it("asks for the amount a credit note left, and nothing once credit and payments cover it", async () => {
    await remind(invoiceFixture({ creditedCents: 2100 }));
    expect(payload()).toMatchObject({ amountCents: 10000, sequenceType: "oneoff" });

    vi.clearAllMocks();
    db = seed({ links: [storedLink()] });
    expect(await remind(invoiceFixture({ creditedCents: 2100 }), [paymentFixture({ amountCents: 10000 })])).toBeUndefined();
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it("offers nothing, and asks Mollie nothing, for an invoice that is already paid", async () => {
    db = seed({ links: [storedLink()] });

    const url = await remind(invoiceFixture(), [paymentFixture({ amountCents: 12100 })]);

    expect(url).toBeUndefined();
    expect(getPaymentLink).not.toHaveBeenCalled();
    expect(createPaymentLink).not.toHaveBeenCalled();
  });
});
