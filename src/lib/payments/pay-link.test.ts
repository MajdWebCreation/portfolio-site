import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, customerRowFixture, invoiceFixture, paymentFixture } from "@/lib/payments/fixtures";

/*
  Which payment an invoice mail -- and every reminder after it -- asks for.
  Supabase and Mollie are both in memory; nothing here reaches the network.

  The rule these tests hold: one payment decision for every door. An invoice
  of a customer whose monthly service waits for its mandate, with no valid
  or pending mandate at Mollie, gets ONE link for what is still owed, made as
  Mollie's first payment -- paying the invoice gives the mandate. Every other
  invoice gets an ordinary one-off link. Never a separate amount, never a
  second link beside a payment in flight or a running collection.
*/
const createPaymentLink = vi.fn();
const getPaymentLink = vi.fn();
const createPayment = vi.fn();
const createCustomer = vi.fn();
const listMandates = vi.fn();
const archivePaymentLink = vi.fn();
const listPaymentLinkPayments = vi.fn();

vi.mock("@/lib/mollie/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mollie/client")>()),
  createPaymentLink: (...args: unknown[]) => createPaymentLink(...args),
  getPaymentLink: (...args: unknown[]) => getPaymentLink(...args),
  createPayment: (...args: unknown[]) => createPayment(...args),
  createCustomer: (...args: unknown[]) => createCustomer(...args),
  listMandates: (...args: unknown[]) => listMandates(...args),
  archivePaymentLink: (...args: unknown[]) => archivePaymentLink(...args),
  listPaymentLinkPayments: (...args: unknown[]) => listPaymentLinkPayments(...args),
}));

let db: ReturnType<typeof createFakeDb>;
vi.mock("@/lib/admin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/db")>()),
  adminDb: async () => db,
}));

const { invoicePayLink, reminderPayLink, payLinkFor, invoicePaymentMode, openInvoiceForMandate } = await import("@/lib/payments/pay-link");

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
    activations?: Record<string, unknown>[];
  } = {},
) {
  return createFakeDb({
    customers: [customerRowFixture()],
    recurring_services: rows.services ?? [],
    customer_payment_providers: rows.providers ?? [],
    invoice_payment_links: rows.links ?? [],
    mandate_activations: rows.activations ?? [],
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
  createCustomer.mockResolvedValue({ id: "cst_new" });
  listPaymentLinkPayments.mockResolvedValue([]);
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

/* The same link, as the payment that also gives the mandate, on our own Mollie customer. */
const firstRequest = { ...oneOffRequest, sequenceType: "first", customerId: "cst_known", idempotencyKey: "invoice-link-inv-1-first-12100" };

/** Nothing about direct debit was asked of Mollie or made there. */
function expectNoMandateWork() {
  expect(listMandates).not.toHaveBeenCalled();
  expect(createCustomer).not.toHaveBeenCalled();
  expect(createPayment).not.toHaveBeenCalled();
}

describe("the payment link of an invoice mail", () => {
  it("is an ordinary one-off payment link", async () => {
    const result = await invoicePayLink(invoiceFixture());

    expect(result).toEqual({ kind: "link", url: "https://payment-link.mollie.com/payment/pl_new", mode: "oneoff" });
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

    expect(result).toEqual({ kind: "link", url: "https://payment-link.mollie.com/payment/pl_old", mode: "oneoff" });
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  /*
    The YM rule: a customer with a monthly service and no mandate pays the
    invoice and authorises the collection in ONE payment -- the invoice
    amount, as Mollie's first payment.
  */
  it("is one first payment of the invoice amount when the customer's service waits for its mandate", async () => {
    db = seed({ services: [service()], providers: [knownCustomer] });

    const result = await invoicePayLink(invoiceFixture());

    expect(result).toEqual({ kind: "link", url: "https://payment-link.mollie.com/payment/pl_new", mode: "first" });
    expect(payload()).toEqual(firstRequest);
    expect(createPaymentLink).toHaveBeenCalledTimes(1);
    expect(createPayment).not.toHaveBeenCalled();
    expect(db.rows("invoice_payment_links")).toMatchObject([{ sequence_type: "first", amount_cents: 12100 }]);
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

    expect(await invoicePayLink(invoiceFixture())).toEqual({ kind: "link", url: "https://payment-link.mollie.com/payment/pl_new", mode: "oneoff" });
  });
});

describe("the payment button on a reminder", () => {
  const remind = (invoice = invoiceFixture(), payments: Parameters<typeof reminderPayLink>[2] = []) =>
    reminderPayLink(db as never, invoice, payments);

  it("reuses the invoice's open link", async () => {
    db = seed({ links: [storedLink()] });

    const pay = await remind();

    expect(pay?.url).toBe("https://payment-link.mollie.com/payment/pl_old");
    expect(createPaymentLink).not.toHaveBeenCalled();
    expect(archivePaymentLink).not.toHaveBeenCalled();
  });

  it("makes at most one new link across two reminders", async () => {
    db = seed({ links: [storedLink()] });
    atMollie.pl_old = mollieLink("pl_old", expired);

    const first = await remind();
    const second = await remind();

    expect(first?.url).toBe("https://payment-link.mollie.com/payment/pl_new");
    expect(second).toEqual(first);
    expect(createPaymentLink).toHaveBeenCalledTimes(1);
    expect(payload()).toEqual(replacingRequest);
    expect(db.rows("invoice_payment_links")).toHaveLength(1);
  });

  /*
    The mandate came about since the first link was made: the reminder
    closes that link -- it would ask for the mandate twice -- and carries an
    ordinary one-off link.
  */
  it("closes a first link once the mandate is valid and carries a one-off link", async () => {
    db = seed({ services: [service()], providers: [knownCustomer], links: [storedLink({ sequence_type: "first" })] });
    listMandates.mockResolvedValue([{ id: "mdt_ok", status: "valid", method: "directdebit" }]);

    const pay = await remind();

    expect(archivePaymentLink).toHaveBeenCalledWith("pl_old", expect.anything());
    expect(pay).toEqual({ url: "https://payment-link.mollie.com/payment/pl_new", mode: "oneoff" });
    expect(payload()).toEqual(replacingRequest);
  });

  it("is one-off with a valid mandate, and never asks for it again", async () => {
    db = seed({ services: [service()], providers: [{ ...knownCustomer, provider_mandate_id: "mdt_ok" }] });
    listMandates.mockResolvedValue([{ id: "mdt_ok", status: "valid", method: "directdebit" }]);

    expect(await remind()).toEqual({ url: "https://payment-link.mollie.com/payment/pl_new", mode: "oneoff" });
    expect(payload()).toEqual(oneOffRequest);
    expect(createCustomer).not.toHaveBeenCalled();
  });

  /*
    The button is the portal's own decision: never a second way to pay beside
    a collection that may be under way, or beside an attempt still running.
  */
  /* A collecting service has its subscription, and so a mandate: what Mollie collects against. */
  const linkedService = (status: string) =>
    service({ status, activation_invoice_id: null, ...(status === "active" ? { mollie_subscription_id: "sub_1" } : {}) });
  const onService = (overrides: Parameters<typeof invoiceFixture>[0] = {}) => invoiceFixture({ recurringServiceId: "svc-1", ...overrides });

  it("offers the ordinary link on an open invoice without direct debit", async () => {
    expect(await remind()).toEqual({ url: "https://payment-link.mollie.com/payment/pl_new", mode: "oneoff" });
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

    expect(url).toEqual({ url: "https://payment-link.mollie.com/payment/pl_new", mode: "oneoff" });
    expect(payload()).toEqual(oneOffRequest);
  });

  it("offers the link again after a failed collection that nothing repaired: Mollie does not retry it", async () => {
    db = seed({ services: [linkedService("active")] });

    const url = await remind(onService(), [paymentFixture({ status: "failed", paidAt: undefined })]);

    expect(url).toEqual({ url: "https://payment-link.mollie.com/payment/pl_new", mode: "oneoff" });
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

    expect(first?.url).toBe("https://payment-link.mollie.com/payment/pl_new");
    expect(retry).toEqual(first);
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

/*
  The canonical decision, case by case: which kind of payment an invoice of
  a recurring-service customer gets, and when it gets none.
*/
describe("the combined invoice and mandate payment", () => {
  const needsMandate = () => seed({ services: [service()], providers: [knownCustomer] });
  const pay = (invoice = invoiceFixture(), payments: Parameters<typeof reminderPayLink>[2] = []) => payLinkFor(db as never, invoice, async () => payments);

  it("is first exactly when a service waits and Mollie has no valid or pending mandate", () => {
    expect(invoicePaymentMode({ awaitsMandate: true, mandate: "none" })).toBe("first");
    expect(invoicePaymentMode({ awaitsMandate: true, mandate: "invalid" })).toBe("first");
    expect(invoicePaymentMode({ awaitsMandate: true, mandate: "pending" })).toBe("oneoff");
    expect(invoicePaymentMode({ awaitsMandate: true, mandate: "valid" })).toBe("oneoff");
    expect(invoicePaymentMode({ awaitsMandate: false, mandate: "none" })).toBe("oneoff");
  });

  it("asks Mollie nothing about mandates for a customer without a waiting service", async () => {
    db = seed({ services: [service({ status: "paused" })], providers: [knownCustomer] });

    expect(await pay()).toMatchObject({ kind: "link", mode: "oneoff" });
    expect(listMandates).not.toHaveBeenCalled();
  });

  it("does not count a service that has ended", async () => {
    db = seed({ services: [service({ status: "active", ends_on: "2026-01-31" })], providers: [knownCustomer] });

    expect(await pay()).toMatchObject({ kind: "link", mode: "oneoff" });
  });

  it("asks again after a revoked mandate, and not while one is pending", async () => {
    db = needsMandate();
    listMandates.mockResolvedValue([{ id: "mdt_old", status: "invalid", method: "directdebit" }]);
    expect(await pay()).toMatchObject({ kind: "link", mode: "first" });

    vi.clearAllMocks();
    createPaymentLink.mockImplementation(async () => mollieLink("pl_new"));
    db = needsMandate();
    listMandates.mockResolvedValue([{ id: "mdt_new", status: "pending", method: "directdebit" }]);
    expect(await pay()).toMatchObject({ kind: "link", mode: "oneoff" });
  });

  it("makes the Mollie customer the mandate attaches to when there is none yet", async () => {
    db = seed({ services: [service()] });

    expect(await pay()).toMatchObject({ kind: "link", mode: "first" });
    expect(createCustomer).toHaveBeenCalledTimes(1);
    expect(payload()).toMatchObject({ sequenceType: "first", customerId: "cst_new" });
  });

  it("reuses a payable first link: the first mail and the reminder lead to the same payment", async () => {
    db = seed({ services: [service()], providers: [knownCustomer], links: [storedLink({ sequence_type: "first" })] });

    expect(await pay()).toEqual({ kind: "link", url: "https://payment-link.mollie.com/payment/pl_old", mode: "first" });
    expect(createPaymentLink).not.toHaveBeenCalled();
    expect(archivePaymentLink).not.toHaveBeenCalled();
  });

  it("replaces an expired first link with a new first link, never handing the old one back", async () => {
    db = seed({ services: [service()], providers: [knownCustomer], links: [storedLink({ sequence_type: "first" })] });
    atMollie.pl_old = mollieLink("pl_old", expired);

    expect(await pay()).toEqual({ kind: "link", url: "https://payment-link.mollie.com/payment/pl_new", mode: "first" });
    expect(payload()).toEqual({ ...firstRequest, idempotencyKey: "invoice-link-inv-1-first-12100-after-pl_old" });
    expect(db.rows("invoice_payment_links")).toMatchObject([{ provider_payment_link_id: "pl_new", sequence_type: "first" }]);
  });

  it("turns an ordinary link into the combined one: the one-off link is closed first", async () => {
    db = seed({ services: [service()], providers: [knownCustomer], links: [storedLink()] });

    expect(await pay()).toMatchObject({ kind: "link", mode: "first" });
    expect(archivePaymentLink).toHaveBeenCalledWith("pl_old", expect.anything());
    expect(payload()).toMatchObject({ sequenceType: "first", idempotencyKey: "invoice-link-inv-1-first-12100-after-pl_old" });
  });

  it.each(["open", "pending"] as const)("makes no second payment while the first payment is %s", async (status) => {
    db = seed({ services: [service()], providers: [knownCustomer], links: [storedLink({ sequence_type: "first" })] });

    expect(await pay(invoiceFixture(), [paymentFixture({ status, paidAt: undefined })])).toEqual({ kind: "none", reason: "payment-in-flight" });
    expect(listMandates).not.toHaveBeenCalled();
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it("treats a payment still open on the previous link as a payment in flight, and makes no new link", async () => {
    db = seed({ services: [service()], providers: [knownCustomer], links: [storedLink()] });
    listPaymentLinkPayments.mockResolvedValue([{ id: "tr_open", status: "open", amount: { currency: "EUR", value: "121.00" }, description: "Factuur" }]);

    expect(await pay()).toEqual({ kind: "none", reason: "payment-in-flight" });
    expect(archivePaymentLink).not.toHaveBeenCalled();
    expect(createPaymentLink).not.toHaveBeenCalled();
    expect(db.rows("invoice_payment_links")).toMatchObject([{ provider_payment_link_id: "pl_old", sequence_type: "oneoff" }]);
  });

  it("offers the combined payment again after a first payment failed", async () => {
    db = seed({ services: [service()], providers: [knownCustomer], links: [storedLink({ sequence_type: "first" })] });

    expect(await pay(invoiceFixture(), [paymentFixture({ status: "failed", paidAt: undefined })])).toEqual({
      kind: "link",
      url: "https://payment-link.mollie.com/payment/pl_old",
      mode: "first",
    });
  });

  it("asks for exactly what a part payment and a credit note left, in the same single payment", async () => {
    db = needsMandate();

    await pay(invoiceFixture({ creditedCents: 2100 }), [paymentFixture({ amountCents: 4000 })]);

    expect(payload()).toMatchObject({ amountCents: 6000, sequenceType: "first", customerId: "cst_known" });
  });

  it("never pays a settled invoice again to obtain a mandate, and asks Mollie nothing", async () => {
    db = needsMandate();

    const result = await pay(invoiceFixture(), [paymentFixture({ amountCents: 12100, method: "banktransfer" })]);

    expect(result).toEqual({ kind: "failed", reason: "Deze factuur is al betaald." });
    expect(listMandates).not.toHaveBeenCalled();
    expect(createCustomer).not.toHaveBeenCalled();
    expect(createPaymentLink).not.toHaveBeenCalled();
    expect(await remind(invoiceFixture(), [paymentFixture({ amountCents: 12100 })])).toBeUndefined();
  });

  it("closes an open EUR 0.01 activation before the invoice asks for the mandate", async () => {
    db = seed({
      services: [service()],
      providers: [knownCustomer],
      activations: [{ id: "act-1", customer_id: "cust-1", provider: "mollie", provider_customer_id: "cst_known", provider_payment_link_id: "pl_cent", checkout_url: "https://payment-link.mollie.com/payment/pl_cent", amount_cents: 1, paid_at: null, archived_at: null, created_at: "2026-10-01T00:00:00.000Z" }],
    });

    expect(await pay()).toMatchObject({ kind: "link", mode: "first" });
    expect(archivePaymentLink).toHaveBeenCalledWith("pl_cent", expect.anything());
    expect(db.rows("mandate_activations")[0]?.archived_at).toBeTruthy();
  });

  it("makes no first link while the open EUR 0.01 activation cannot be closed", async () => {
    db = seed({
      services: [service()],
      providers: [knownCustomer],
      activations: [{ id: "act-1", customer_id: "cust-1", provider: "mollie", provider_customer_id: "cst_known", provider_payment_link_id: "pl_cent", checkout_url: "https://payment-link.mollie.com/payment/pl_cent", amount_cents: 1, paid_at: null, archived_at: null, created_at: "2026-10-01T00:00:00.000Z" }],
    });
    archivePaymentLink.mockRejectedValueOnce(new Error("Mollie 503"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await pay()).toMatchObject({ kind: "failed" });
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it("fails closed when Mollie cannot say what the mandate is", async () => {
    db = needsMandate();
    listMandates.mockRejectedValue(new Error("Mollie 500"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await pay()).toEqual({ kind: "failed", reason: "Mollie 500" });
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it("fails closed when the customer's services cannot be read", async () => {
    db = needsMandate();
    const failing = {
      ...db,
      from: (table: string) =>
        table === "recurring_services"
          ? { select: () => ({ eq: async () => ({ data: null, error: { message: "connection reset" } }) }) }
          : db.from(table),
    };
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await payLinkFor(failing as never, invoiceFixture(), async () => [])).toMatchObject({ kind: "failed" });
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  /* Admin send, portal click and reminder at the same moment: one payable link, one row. */
  it("leaves one link when three doors ask at once", async () => {
    db = needsMandate();

    const results = await Promise.all([invoicePayLink(invoiceFixture()), pay(), remind()]);

    const keys = createPaymentLink.mock.calls.map((call) => (call[0] as { idempotencyKey: string }).idempotencyKey);
    expect(new Set(keys)).toEqual(new Set(["invoice-link-inv-1-first-12100"]));
    expect(db.rows("invoice_payment_links")).toHaveLength(1);
    expect(results.map((result) => (result && "url" in result ? result.url : undefined))).toEqual([
      "https://payment-link.mollie.com/payment/pl_new",
      "https://payment-link.mollie.com/payment/pl_new",
      "https://payment-link.mollie.com/payment/pl_new",
    ]);
  });

  const remind = (invoice = invoiceFixture(), payments: Parameters<typeof reminderPayLink>[2] = []) => reminderPayLink(db as never, invoice, payments);

  it("gives the reminder the same combined payment as the first mail", async () => {
    db = needsMandate();

    const mail = await invoicePayLink(invoiceFixture());
    const reminder = await remind();

    expect(mail).toMatchObject({ kind: "link", mode: "first" });
    expect(reminder).toEqual({ url: mail.kind === "link" ? mail.url : "", mode: "first" });
  });
});

describe("the invoice that carries the mandate (for the admin's EUR 0.01 guard)", () => {
  it("names an open sent invoice, and none once it is paid", async () => {
    const { invoiceRowFixture } = await import("@/lib/admin/credit-notes/test-support");
    const row = invoiceRowFixture({ status: "sent" });
    db = createFakeDb({ invoices: [row.invoice], invoice_lines: row.lines, credit_notes: [], payments: [], recurring_services: [] });
    expect(await openInvoiceForMandate(db as never, "cust-1")).toEqual({ id: "inv-1", number: "YM-F-2026-000001" });

    db.rows("payments").push({ id: "p", invoice_id: "inv-1", customer_id: "cust-1", amount_cents: 12100, currency: "EUR", status: "paid", source: "manual_bank_transfer", provider_payment_id: null, method: null, paid_at: "2026-10-01T00:00:00.000Z", description: "", created_at: "2026-10-01T00:00:00.000Z", updated_at: "2026-10-01T00:00:00.000Z" });
    expect(await openInvoiceForMandate(db as never, "cust-1")).toBeUndefined();
  });
});
