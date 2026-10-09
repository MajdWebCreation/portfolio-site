import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, customerRowFixture, invoiceFixture, testCustomer } from "@/lib/payments/fixtures";
import { providerCustomerEmailReason } from "@/lib/payments/provider-customer";

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

/*
  The note an activation invoice carries from the moment it is issued: what
  the PDF and the mail tell the customer about the first direct debit. An
  invoice that switches a service on always has one -- the send flow refuses
  any other -- so the fixtures for that case carry it too.
*/
const announced = {
  serviceId: "svc-1",
  serviceName: "Websitebeheer",
  monthlyNetCents: 2500,
  monthlyGrossCents: 3025,
  firstDebitOn: "2026-10-01",
};
const activationInvoice = (overrides: Parameters<typeof invoiceFixture>[0] = {}) =>
  invoiceFixture({ activationNote: announced, ...overrides });

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
    customers?: Record<string, unknown>[];
  } = {},
) {
  return createFakeDb({
    customers: rows.customers ?? [customerRowFixture()],
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

    const result = await invoicePayLink(activationInvoice());

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

    await invoicePayLink(activationInvoice());

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

    const result = await invoicePayLink(activationInvoice());

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

    const result = await invoicePayLink(activationInvoice());

    expect(result.kind === "link" && result.decision.sequence).toBe("first");
  });

  it("stays a one-off payment when the service already collects", async () => {
    db = seed({ services: [service({ mollie_subscription_id: "sub_1" })] });

    const result = await invoicePayLink(activationInvoice());

    expect(result.kind === "link" && result.decision.reason).toBe("already-subscribed");
    expect(createPaymentLink).toHaveBeenCalledWith(expect.objectContaining({ sequenceType: "oneoff" }));
  });

  /* The monthly price is collected by the subscription, never by this link. */
  it("never adds the monthly amount to the payment link", async () => {
    db = seed({ services: [service({ amount_cents: 9900 })] });

    await invoicePayLink(activationInvoice());

    const [args] = createPaymentLink.mock.calls[0] as [{ amountCents: number }];
    expect(args.amountCents).toBe(12100);
  });
});

/*
  Who the customer is at Mollie comes from the customer record as it is now.
  The invoice keeps the copy it took when it was written -- that is what the
  PDF prints -- but Mollie keeps whatever it is given at creation, for good,
  so it is given the current name and address and never the copy.
*/
describe("the customer created at Mollie", () => {
  const writtenBefore = activationInvoice({
    customer: { ...testCustomer, companyName: "Alfa (oud) BV", email: "old@example.com" },
  });

  it("gets the name and address the customer has now, not the invoice's copy", async () => {
    db = seed({
      services: [service()],
      customers: [customerRowFixture({ company_name: "Alfa Nieuw BV", email: "new@example.com" })],
    });

    const result = await invoicePayLink(writtenBefore);

    expect(result.kind).toBe("link");
    expect(createCustomer).toHaveBeenCalledTimes(1);
    expect(createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Alfa Nieuw BV", email: "new@example.com", idempotencyKey: "customer-cust-1" }),
    );
  });

  it.each([[""], ["   "], ["geen-adres"]])(
    "is not created, and no link is made, when the customer's address is %j -- never with the old one",
    async (email) => {
      db = seed({ services: [service()], customers: [customerRowFixture({ email })] });

      const result = await invoicePayLink(writtenBefore);

      expect(result).toEqual({ kind: "failed", reason: providerCustomerEmailReason });
      expect(createCustomer).not.toHaveBeenCalled();
      expect(createPaymentLink).not.toHaveBeenCalled();
      expect(db.rows("customer_payment_providers")).toHaveLength(0);
    },
  );

  /* An existing Mollie customer is reused as it is; nothing is created or read for it. */
  it("leaves an existing provider customer alone", async () => {
    db = seed({
      services: [service()],
      customers: [customerRowFixture({ email: "new@example.com" })],
      providers: [
        { id: "cpp-1", customer_id: "cust-1", provider: "mollie", provider_customer_id: "cst_known", provider_mandate_id: null },
      ],
    });

    await invoicePayLink(writtenBefore);

    expect(createCustomer).not.toHaveBeenCalled();
    expect(createPaymentLink).toHaveBeenCalledWith(expect.objectContaining({ customerId: "cst_known" }));
  });
});

/*
  The reminders, and the production bug they once had: YM-F-2026-000002 went
  out with a `first` link that would have set up the monthly direct debit, the
  first reminder replaced it with a `oneoff` link, and the customer paid that
  one -- the invoice settled and no mandate came of it. A reminder now asks
  the same question as the invoice mail, through the same function.
*/
describe("the payment button on a reminder", () => {
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
    provider_payment_link_id: "pl_first",
    checkout_url: "https://payment-link.mollie.com/payment/pl_first",
    sequence_type: "first",
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

  /** The current links at Mollie, by id: what getPaymentLink answers. */
  let atMollie: Record<string, Record<string, unknown>>;

  beforeEach(() => {
    atMollie = {};
    getPaymentLink.mockImplementation(async (id: string) => atMollie[id] ?? mollieLink(id));
    archivePaymentLink.mockImplementation(async (id: string) => ({ ...mollieLink(id), archived: true }));
    createPaymentLink.mockImplementation(async () => mollieLink("pl_new"));
  });

  const remind = (invoice = activationInvoice()) => reminderPayLink(db as never, invoice, []);

  /* The regression itself: the open `first` link is the one the reminder carries. */
  it("reuses the open first link instead of replacing it with a one-off one", async () => {
    db = seed({ services: [service()], providers: [knownCustomer], links: [storedLink()] });

    const url = await remind();

    expect(url).toBe("https://payment-link.mollie.com/payment/pl_first");
    expect(createPaymentLink).not.toHaveBeenCalled();
    expect(archivePaymentLink).not.toHaveBeenCalled();
    expect(db.rows("invoice_payment_links")).toMatchObject([{ provider_payment_link_id: "pl_first", sequence_type: "first" }]);
  });

  it("makes a new first link, for the same customer, when the old one can no longer be paid", async () => {
    db = seed({ services: [service()], providers: [knownCustomer], links: [storedLink()] });
    atMollie.pl_first = mollieLink("pl_first", expired);

    const url = await remind();

    expect(url).toBe("https://payment-link.mollie.com/payment/pl_new");
    expect(createPaymentLink).toHaveBeenCalledTimes(1);
    expect(createPaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({ sequenceType: "first", customerId: "cst_known", amountCents: 12100 }),
    );
    expect(db.rows("invoice_payment_links")).toMatchObject([{ provider_payment_link_id: "pl_new", sequence_type: "first" }]);
  });

  it("never falls back to a one-off link while the announced mandate is still missing", async () => {
    db = seed({ services: [service()], providers: [knownCustomer], links: [storedLink({ sequence_type: "oneoff" })] });
    listMandates.mockResolvedValue([{ id: "mdt_old", status: "invalid", method: "directdebit" }]);

    await remind();

    // The stored one-off link asks the wrong question: closed, then replaced by a first link.
    expect(archivePaymentLink).toHaveBeenCalledWith("pl_first", expect.anything());
    const sequences = createPaymentLink.mock.calls.map(([args]) => (args as { sequenceType: string }).sequenceType);
    expect(sequences).toEqual(["first"]);
  });

  /* A pending mandate cannot be collected against, so it does not count as given. */
  it("keeps asking for the authorisation while Mollie only has a pending mandate", async () => {
    db = seed({ services: [service()], providers: [knownCustomer], links: [storedLink()] });
    listMandates.mockResolvedValue([{ id: "mdt_p", status: "pending", method: "directdebit" }]);

    const url = await remind();

    expect(url).toBe("https://payment-link.mollie.com/payment/pl_first");
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it("makes at most one new link across two reminders", async () => {
    db = seed({ services: [service()], providers: [knownCustomer], links: [storedLink()] });
    atMollie.pl_first = mollieLink("pl_first", expired);

    const first = await remind();
    const second = await remind();

    expect(first).toBe("https://payment-link.mollie.com/payment/pl_new");
    expect(second).toBe(first);
    expect(createPaymentLink).toHaveBeenCalledTimes(1);
    expect(db.rows("invoice_payment_links")).toHaveLength(1);
  });

  /*
    The customer has authorised us in the meantime. The reminder only collects
    the invoice; the webhook switches the service on from the mandate that
    exists. The open first link is closed so it cannot be paid as well.
  */
  it("asks for a one-off payment, and closes the open first link, once a valid mandate exists", async () => {
    db = seed({ services: [service()], providers: [knownCustomer], links: [storedLink()] });
    listMandates.mockResolvedValue([{ id: "mdt_ok", status: "valid", method: "directdebit" }]);

    await remind();

    expect(archivePaymentLink).toHaveBeenCalledWith("pl_first", expect.anything());
    const [args] = createPaymentLink.mock.calls[0] as [{ sequenceType: string; customerId?: string }];
    expect(args.sequenceType).toBe("oneoff");
    expect(args.customerId).toBeUndefined();
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it("offers nothing, and asks Mollie nothing, for an invoice that is already paid", async () => {
    db = seed({ services: [service()], providers: [knownCustomer], links: [storedLink()] });
    const { paymentFixture } = await import("@/lib/payments/fixtures");

    const url = await reminderPayLink(db as never, activationInvoice(), [paymentFixture({ amountCents: 12100 })]);

    expect(url).toBeUndefined();
    expect(getPaymentLink).not.toHaveBeenCalled();
    expect(listMandates).not.toHaveBeenCalled();
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  /* An admin resending the paid invoice gets a refusal, not a new way to pay it. */
  it("refuses a new payment option when a paid invoice is sent again", async () => {
    db = seed({ services: [service()], providers: [knownCustomer], links: [storedLink()] });
    db.rows("payments").push({
      id: "pay-363",
      invoice_id: "inv-1",
      customer_id: "cust-1",
      amount_cents: 12100,
      currency: "EUR",
      status: "paid",
      source: "mollie",
      provider_payment_id: "tr_reminder",
      method: "ideal",
      paid_at: "2026-10-07T09:26:51.000Z",
      description: "Factuur",
      created_at: "2026-10-07T09:28:09.000Z",
      updated_at: "2026-10-07T09:28:09.000Z",
    });

    const result = await invoicePayLink(activationInvoice({ status: "paid" }));

    expect(result).toEqual({ kind: "failed", reason: "Deze factuur is al betaald." });
    expect(createPaymentLink).not.toHaveBeenCalled();
    expect(archivePaymentLink).not.toHaveBeenCalled();
  });

  it("keeps an ordinary invoice an ordinary one-off payment", async () => {
    db = seed();

    await remind(invoiceFixture());

    const [args] = createPaymentLink.mock.calls[0] as [{ sequenceType: string; customerId?: string }];
    expect(args.sequenceType).toBe("oneoff");
    expect(args.customerId).toBeUndefined();
    expect(listMandates).not.toHaveBeenCalled();
    expect(createCustomer).not.toHaveBeenCalled();
  });

  /* A reminder never starts an authorisation the invoice itself did not announce. */
  it("stays one-off when the invoice never announced a mandate", async () => {
    db = seed({ services: [service()], providers: [knownCustomer] });

    await remind(invoiceFixture());

    expect(createPaymentLink).toHaveBeenCalledWith(expect.objectContaining({ sequenceType: "oneoff" }));
  });
});

/*
  What actually leaves for Mollie, field by field, in the five situations the
  fix is about. Written out in full so a change to any of them is visible.
*/
describe("the payment link request sent to Mollie", () => {
  const knownCustomer = {
    id: "cpp-1",
    customer_id: "cust-1",
    provider: "mollie",
    provider_customer_id: "cst_known",
    provider_mandate_id: null,
  };
  const common = {
    amountCents: 12100,
    description: "YM Creations factuur YM-F-2026-000001",
    webhookUrl: "https://example.test/api/mollie/webhook?invoice=inv-1",
  };
  const payload = (call = 0) => {
    const args = createPaymentLink.mock.calls[call]?.[0] as Record<string, unknown> | undefined;
    if (!args) return undefined;
    // The redirect carries a signed token and the config the API key: neither is the question here.
    return Object.fromEntries(Object.entries(args).filter(([key]) => key !== "redirectUrl" && key !== "config"));
  };
  const expiredLink = (id: string) => ({
    id,
    description: "Factuur",
    expiresAt: "2026-01-01T00:00:00.000Z",
    _links: { paymentLink: { href: `https://payment-link.mollie.com/payment/${id}` } },
  });

  it("A: first invoice, no mandate", async () => {
    db = seed({ services: [service()], providers: [knownCustomer] });
    await invoicePayLink(activationInvoice());
    expect(payload()).toEqual({
      ...common,
      sequenceType: "first",
      customerId: "cst_known",
      idempotencyKey: "invoice-link-inv-1-first-12100",
    });
  });

  it("B and C: first and second reminder, no mandate -- the stored first link, no request at all", async () => {
    db = seed({
      services: [service()],
      providers: [knownCustomer],
      links: [
        {
          id: "lnk-1",
          invoice_id: "inv-1",
          customer_id: "cust-1",
          provider: "mollie",
          provider_payment_link_id: "pl_first",
          checkout_url: "https://payment-link.mollie.com/payment/pl_first",
          sequence_type: "first",
          amount_cents: 12100,
        },
      ],
    });
    getPaymentLink.mockResolvedValue({
      id: "pl_first",
      description: "Factuur",
      _links: { paymentLink: { href: "https://payment-link.mollie.com/payment/pl_first" } },
    });

    await reminderPayLink(db as never, activationInvoice(), []);
    await reminderPayLink(db as never, activationInvoice(), []);

    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  it("B': a reminder whose first link expired sends a new first request", async () => {
    db = seed({
      services: [service()],
      providers: [knownCustomer],
      links: [
        {
          id: "lnk-1",
          invoice_id: "inv-1",
          customer_id: "cust-1",
          provider: "mollie",
          provider_payment_link_id: "pl_first",
          checkout_url: "https://payment-link.mollie.com/payment/pl_first",
          sequence_type: "first",
          amount_cents: 12100,
        },
      ],
    });
    getPaymentLink.mockResolvedValue(expiredLink("pl_first"));

    await reminderPayLink(db as never, activationInvoice(), []);

    expect(payload()).toEqual({
      ...common,
      sequenceType: "first",
      customerId: "cst_known",
      idempotencyKey: "invoice-link-inv-1-first-12100",
    });
  });

  it("D: customer with a valid mandate -- one-off, no customer, no new authorisation", async () => {
    db = seed({ services: [service()], providers: [{ ...knownCustomer, provider_mandate_id: "mdt_ok" }] });
    listMandates.mockResolvedValue([{ id: "mdt_ok", status: "valid", method: "directdebit" }]);

    await reminderPayLink(db as never, activationInvoice(), []);

    expect(payload()).toEqual({ ...common, sequenceType: "oneoff", idempotencyKey: "invoice-link-inv-1-oneoff-12100" });
  });

  it("E: an ordinary invoice", async () => {
    db = seed();
    await invoicePayLink(invoiceFixture());
    expect(payload()).toEqual({ ...common, sequenceType: "oneoff", idempotencyKey: "invoice-link-inv-1-oneoff-12100" });
  });
});
