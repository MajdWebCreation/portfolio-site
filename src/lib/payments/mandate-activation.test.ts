import { beforeEach, describe, expect, it, vi } from "vitest";
import { mollieAmount, type MolliePayment } from "@/lib/mollie/client";
import { createFakeDb, customerRowFixture } from "@/lib/payments/fixtures";

/*
  Activating direct debit on its own: a EUR 0.01 `first` payment link per
  customer, a mandate that only counts once Mollie calls it valid, and never
  a cent of it near an invoice. Supabase and Mollie are both in memory.
*/
const createPaymentLink = vi.fn();
const getPaymentLink = vi.fn();
const archivePaymentLink = vi.fn();
const listPaymentLinkPayments = vi.fn();
const listMandates = vi.fn();
const createCustomer = vi.fn();

vi.mock("@/lib/mollie/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mollie/client")>()),
  createPaymentLink: (...args: unknown[]) => createPaymentLink(...args),
  getPaymentLink: (...args: unknown[]) => getPaymentLink(...args),
  archivePaymentLink: (...args: unknown[]) => archivePaymentLink(...args),
  listPaymentLinkPayments: (...args: unknown[]) => listPaymentLinkPayments(...args),
  listMandates: (...args: unknown[]) => listMandates(...args),
  createCustomer: (...args: unknown[]) => createCustomer(...args),
}));

const {
  activationForPayment,
  activationsForCustomer,
  alreadyActiveReason,
  pendingReason,
  processActivationPayment,
  refreshDirectDebit,
  requestMandateActivation,
} = await import("@/lib/payments/mandate-activation");
const { directDebitStatus } = await import("@/lib/payments/direct-debit-status");

const knownCustomer = {
  id: "cpp-1",
  customer_id: "cust-1",
  provider: "mollie",
  provider_customer_id: "cst_flexora",
  provider_mandate_id: null,
};

/* YM-F-2026-000002 as it stands: 363,00, paid through a one-off link. */
const paidInvoice = { id: "inv-363", customer_id: "cust-1", number_value: "YM-F-2026-000002", status: "paid" };
const paidInvoicePayment = {
  id: "pay-363",
  invoice_id: "inv-363",
  customer_id: "cust-1",
  amount_cents: 36300,
  status: "paid",
  source: "mollie",
  provider_payment_id: "tr_reminder",
};
const openInvoice = { id: "inv-open", customer_id: "cust-1", number_value: "YM-F-2026-000003", status: "sent" };

let db: ReturnType<typeof createFakeDb>;

function seed(rows: { providers?: Record<string, unknown>[]; activations?: Record<string, unknown>[] } = {}) {
  return createFakeDb({
    customers: [customerRowFixture()],
    customer_payment_providers: rows.providers ?? [{ ...knownCustomer }],
    mandate_activations: rows.activations ?? [],
    invoices: [{ ...paidInvoice }, { ...openInvoice }],
    payments: [{ ...paidInvoicePayment }],
  });
}

const link = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  description: "Activeren automatische incasso",
  _links: { paymentLink: { href: `https://payment-links.mollie.com/payment/${id}` } },
  ...overrides,
});

const centPayment = (overrides: Partial<MolliePayment> = {}): MolliePayment => ({
  id: "tr_cent",
  status: "paid",
  amount: { currency: "EUR", value: "0.01" },
  description: "Activeren automatische incasso",
  method: "ideal",
  paidAt: "2026-10-10T09:00:00.000Z",
  sequenceType: "first",
  customerId: "cst_flexora",
  mandateId: "mdt_new",
  ...overrides,
});

const valid = [{ id: "mdt_new", status: "valid", method: "directdebit" }];
const pending = [{ id: "mdt_new", status: "pending", method: "directdebit" }];
const invalid = [{ id: "mdt_new", status: "invalid", method: "directdebit" }];

/** The invoices and payments, exactly as they were seeded. */
function expectInvoicesUntouched() {
  expect(db.rows("invoices")).toEqual([paidInvoice, openInvoice]);
  expect(db.rows("payments")).toEqual([paidInvoicePayment]);
}

let created = 0;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MOLLIE_API_KEY = "test_dummy";
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  db = seed();
  created = 0;
  listMandates.mockResolvedValue([]);
  listPaymentLinkPayments.mockResolvedValue([]);
  createCustomer.mockResolvedValue({ id: "cst_created" });
  getPaymentLink.mockImplementation(async (id: string) => link(id));
  archivePaymentLink.mockImplementation(async (id: string) => link(id, { archived: true }));
  createPaymentLink.mockImplementation(async () => {
    created += 1;
    return link(`pl_act${created}`);
  });
});

const request = () => requestMandateActivation(db as never, "cust-1");

describe("handing out an activation link", () => {
  /* Tests 1, 3, 4, 5: the paid 363,00 does not stand in the way, and the link is right. */
  it("is possible for a customer whose invoice is paid but who has no mandate", async () => {
    const result = await request();

    expect(result).toMatchObject({ ok: true, reused: false });
    expect(createPaymentLink).toHaveBeenCalledTimes(1);
    const [args] = createPaymentLink.mock.calls[0] as [Record<string, unknown>];
    expect(args).toMatchObject({
      amountCents: 1,
      description: "Activeren automatische incasso",
      sequenceType: "first",
      customerId: "cst_flexora",
      redirectUrl: "https://example.test/nl/betaling/incasso-afgerond",
    });
    expect(args.webhookUrl).toMatch(/^https:\/\/example\.test\/api\/mollie\/webhook\?activation=[0-9a-f-]{36}$/);
    // What Mollie receives for one cent.
    expect(mollieAmount(args.amountCents as number)).toEqual({ currency: "EUR", value: "0.01" });
    expect(createCustomer).not.toHaveBeenCalled();
    expectInvoicesUntouched();
  });

  /* Test 2: an open invoice keeps exactly what it owes. */
  it("leaves an open invoice's balance and status alone", async () => {
    await request();
    expectInvoicesUntouched();
  });

  it("records the link as the customer's open activation, separate from any invoice", async () => {
    await request();

    expect(db.rows("mandate_activations")).toMatchObject([
      {
        customer_id: "cust-1",
        provider_customer_id: "cst_flexora",
        provider_payment_link_id: "pl_act1",
        checkout_url: "https://payment-links.mollie.com/payment/pl_act1",
        amount_cents: 1,
      },
    ]);
    expect(db.rows("invoice_payment_links")).toEqual([]);
  });

  it("creates the Mollie customer from the record when there is none yet", async () => {
    db = seed({ providers: [] });

    await request();

    expect(createCustomer).toHaveBeenCalledWith(expect.objectContaining({ email: "a@example.com", idempotencyKey: "customer-cust-1" }));
    expect(createPaymentLink).toHaveBeenCalledWith(expect.objectContaining({ customerId: "cst_created" }));
  });

  /* Test 11: clicking twice hands out the same link. */
  it("reuses the open link instead of making a second payable one", async () => {
    const first = await request();
    const second = await request();

    expect(createPaymentLink).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ ok: true, reused: true });
    expect(first.ok && second.ok && second.activation.checkoutUrl).toBe(first.ok && first.activation.checkoutUrl);
    expect(db.rows("mandate_activations")).toHaveLength(1);
  });

  it("keeps one payable link when two clicks race: the loser's link is closed", async () => {
    // Both see no open activation; both create a link; only one row may exist.
    const [a, b] = await Promise.all([request(), request()]);

    expect(a.ok && b.ok).toBe(true);
    const open = db.rows("mandate_activations").filter((row) => row.paid_at == null && row.archived_at == null);
    expect(open).toHaveLength(1);
    // Both really raced: two links were made at Mollie, and the loser's was closed.
    expect(createPaymentLink).toHaveBeenCalledTimes(2);
    expect(archivePaymentLink).toHaveBeenCalledTimes(1);
    expect(a.ok && b.ok && a.activation.id).toBe(b.ok && b.activation.id);
  });

  it("replaces a link that can no longer be paid, and closes nothing that is already dead", async () => {
    await request();
    getPaymentLink.mockImplementation(async (id: string) => link(id, { expiresAt: "2026-01-01T00:00:00.000Z" }));

    const again = await request();

    expect(again).toMatchObject({ ok: true, reused: false });
    expect(createPaymentLink).toHaveBeenCalledTimes(2);
    expect(archivePaymentLink).not.toHaveBeenCalled();
    expect(db.rows("mandate_activations")[0]?.archived_at).toBeTruthy();
  });

  /* Test 12: a valid mandate is not asked for again. */
  it("refuses, and makes nothing at Mollie, when the customer already has a valid mandate", async () => {
    listMandates.mockResolvedValue(valid);

    const result = await request();

    expect(result).toEqual({ ok: false, reason: alreadyActiveReason });
    expect(createPaymentLink).not.toHaveBeenCalled();
    expect(db.rows("customer_payment_providers")[0]?.provider_mandate_id).toBe("mdt_new");
  });

  it("refuses while a mandate is still pending at Mollie", async () => {
    listMandates.mockResolvedValue(pending);

    expect(await request()).toEqual({ ok: false, reason: pendingReason });
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  /* Test 8 (setup): an invalid mandate is no mandate; the customer can be asked again. */
  it("hands out a link when the only mandate is invalid", async () => {
    listMandates.mockResolvedValue(invalid);

    expect(await request()).toMatchObject({ ok: true });
  });
});

describe("the activation payment, as the webhook sees it", () => {
  async function activation() {
    const result = await request();
    if (!result.ok) throw new Error(result.reason);
    return result.activation;
  }

  async function status() {
    const provider = db.rows("customer_payment_providers")[0];
    return directDebitStatus({
      activations: await activationsForCustomer(db as never, "cust-1"),
      mandateOnRecord: Boolean(provider?.provider_mandate_id),
    });
  }

  /* Test 6. */
  it("makes direct debit active when Mollie calls the mandate valid", async () => {
    const act = await activation();
    listMandates.mockResolvedValue(valid);

    const outcome = await processActivationPayment(db as never, centPayment(), act);

    expect(outcome).toEqual({ handled: true, note: "activation paid; mandate valid" });
    expect(db.rows("mandate_activations")[0]).toMatchObject({
      provider_payment_id: "tr_cent",
      paid_at: "2026-10-10T09:00:00.000Z",
      mandate_id: "mdt_new",
      mandate_status: "valid",
    });
    expect(db.rows("mandate_activations")[0]?.validated_at).toBeTruthy();
    expect(db.rows("customer_payment_providers")[0]?.provider_mandate_id).toBe("mdt_new");
    expect(await status()).toBe("active");
  });

  /* Test 7. */
  it("is not active yet while the mandate is pending, and asks Mollie to deliver again", async () => {
    const act = await activation();
    listMandates.mockResolvedValue(pending);

    const outcome = await processActivationPayment(db as never, centPayment(), act);

    expect(outcome).toMatchObject({ handled: false, retry: true });
    expect(db.rows("mandate_activations")[0]?.validated_at ?? null).toBeNull();
    expect(db.rows("customer_payment_providers")[0]?.provider_mandate_id).toBeNull();
    expect(await status()).toBe("mandate_pending");
  });

  /* Test 8. */
  it("is a problem, not active, when Mollie reports the mandate invalid", async () => {
    const act = await activation();
    listMandates.mockResolvedValue(invalid);

    const outcome = await processActivationPayment(db as never, centPayment(), act);

    expect(outcome).toMatchObject({ handled: true });
    expect(outcome.retry).toBeUndefined();
    expect(db.rows("customer_payment_providers")[0]?.provider_mandate_id).toBeNull();
    expect(await status()).toBe("problem");
  });

  it("clears a cached mandate that Mollie no longer calls valid", async () => {
    db = seed({ providers: [{ ...knownCustomer, provider_mandate_id: "mdt_old" }] });
    const act = await activation();
    listMandates.mockResolvedValue([{ id: "mdt_old", status: "invalid", method: "directdebit" }]);

    await processActivationPayment(db as never, centPayment(), act);

    expect(db.rows("customer_payment_providers")[0]?.provider_mandate_id).toBeNull();
  });

  /* Tests 9 and 10. */
  it("is idempotent, and never writes a payment or touches an invoice", async () => {
    const act = await activation();
    listMandates.mockResolvedValue(valid);

    for (let i = 0; i < 5; i += 1) {
      await processActivationPayment(db as never, centPayment({ paidAt: `2026-10-1${i}T09:00:00.000Z` }), act);
    }

    expect(db.rows("mandate_activations")).toHaveLength(1);
    // The first delivery's moment stays the paid moment.
    expect(db.rows("mandate_activations")[0]?.paid_at).toBe("2026-10-10T09:00:00.000Z");
    expectInvoicesUntouched();
  });

  it("leaves the link payable after a failed attempt", async () => {
    const act = await activation();

    const outcome = await processActivationPayment(db as never, centPayment({ status: "failed", paidAt: undefined }), act);

    expect(outcome).toEqual({ handled: true, note: "activation payment failed" });
    expect(db.rows("mandate_activations")[0]?.paid_at ?? null).toBeNull();
    expect(listMandates).toHaveBeenCalledTimes(1); // only the check before handing out the link
  });
});

describe("recognising an activation payment", () => {
  it("believes the activation named in the webhook URL only when Mollie confirms the payment", async () => {
    const result = await request();
    if (!result.ok) throw new Error(result.reason);
    const id = result.activation.id;

    listPaymentLinkPayments.mockResolvedValue([]);
    expect(await activationForPayment(db as never, "tr_cent", id)).toBeUndefined();

    listPaymentLinkPayments.mockResolvedValue([centPayment()]);
    expect(await activationForPayment(db as never, "tr_cent", id)).toMatchObject({ id });
    expect(listPaymentLinkPayments).toHaveBeenLastCalledWith("pl_act1", expect.anything());
  });

  it("finds a recorded activation payment without asking Mollie again", async () => {
    const result = await request();
    if (!result.ok) throw new Error(result.reason);
    listMandates.mockResolvedValue(valid);
    await processActivationPayment(db as never, centPayment(), result.activation);
    listPaymentLinkPayments.mockClear();

    expect(await activationForPayment(db as never, "tr_cent")).toMatchObject({ id: result.activation.id });
    expect(listPaymentLinkPayments).not.toHaveBeenCalled();
  });

  it("is nothing for an ordinary invoice payment", async () => {
    expect(await activationForPayment(db as never, "tr_reminder")).toBeUndefined();
  });
});

describe("Status controleren", () => {
  /* The webhook never arrived, or Mollie gave up retrying: the admin asks. */
  it("processes a paid open link exactly as the webhook would", async () => {
    await request();
    listPaymentLinkPayments.mockResolvedValue([centPayment()]);
    listMandates.mockResolvedValue(valid);

    expect(await refreshDirectDebit(db as never, "cust-1")).toBe("active");
    expect(db.rows("mandate_activations")[0]).toMatchObject({ provider_payment_id: "tr_cent", mandate_status: "valid" });
    expectInvoicesUntouched();
  });

  it("turns a pending mandate into an active one once Mollie calls it valid", async () => {
    const result = await request();
    if (!result.ok) throw new Error(result.reason);
    listMandates.mockResolvedValue(pending);
    await processActivationPayment(db as never, centPayment(), result.activation);

    listMandates.mockResolvedValue(valid);
    expect(await refreshDirectDebit(db as never, "cust-1")).toBe("active");
    expect(db.rows("customer_payment_providers")[0]?.provider_mandate_id).toBe("mdt_new");
  });

  it("notices a mandate that was revoked at the bank", async () => {
    const result = await request();
    if (!result.ok) throw new Error(result.reason);
    listMandates.mockResolvedValue(valid);
    await processActivationPayment(db as never, centPayment(), result.activation);

    listMandates.mockResolvedValue(invalid);
    expect(await refreshDirectDebit(db as never, "cust-1")).toBe("problem");
    expect(db.rows("customer_payment_providers")[0]?.provider_mandate_id).toBeNull();
  });
});

describe("the direct debit status", () => {
  const at = (createdAt: string, extra: Record<string, unknown> = {}) => ({ createdAt, ...extra });

  it("reads each state from the activations and the cached mandate", () => {
    expect(directDebitStatus({ activations: [], mandateOnRecord: false })).toBe("not_active");
    expect(directDebitStatus({ activations: [], mandateOnRecord: true })).toBe("active");
    expect(directDebitStatus({ activations: [at("2026-10-09")], mandateOnRecord: false })).toBe("awaiting_customer");
    expect(
      directDebitStatus({ activations: [at("2026-10-09", { archivedAt: "2026-10-10" })], mandateOnRecord: false }),
    ).toBe("not_active");
    expect(
      directDebitStatus({ activations: [at("2026-10-09", { paidAt: "2026-10-10" })], mandateOnRecord: false }),
    ).toBe("mandate_pending");
    expect(
      directDebitStatus({
        activations: [at("2026-10-09", { paidAt: "2026-10-10", mandateStatus: "none" })],
        mandateOnRecord: false,
      }),
    ).toBe("problem");
  });

  /* A new link after a problem: the customer is being asked again. */
  it("prefers a newer open link over an older paid one that went wrong", () => {
    expect(
      directDebitStatus({
        activations: [at("2026-10-12"), at("2026-10-09", { paidAt: "2026-10-10", mandateStatus: "invalid" })],
        mandateOnRecord: false,
      }),
    ).toBe("awaiting_customer");
  });
});
