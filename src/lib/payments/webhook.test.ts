import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Invoice, InvoiceStatus } from "@/lib/admin/invoices/types";
import type { MolliePayment } from "@/lib/mollie/client";
import { calculateTotals } from "@/lib/money";
import { invoiceFixture, recurringFixture } from "@/lib/payments/fixtures";
import type { Payment, RecurringService } from "@/lib/payments/types";
import {
  isIntegrationTestPayment,
  nextInvoiceStatus,
  processMolliePayment,
  type PaymentRecord,
  type WebhookOutcome,
  type WebhookStore,
} from "@/lib/payments/webhook";
import { calculateTotals as totalsOf } from "@/lib/money";
import { customerFinancials } from "@/lib/payments/customer-status";

/**
 * An in-memory stand-in for the database, keyed the way the real schema is
 * keyed: one payment per (source, provider_payment_id), one subscription per
 * service. No Mollie is contacted; the payment resource is handed in, exactly
 * as the route hands in what it fetched.
 */
function makeStore(
  initial: {
    invoices?: Invoice[];
    services?: RecurringService[];
    /** Widens the window between checking for an invoice and inserting it. */
    raceWindow?: boolean;
    /**
     * Payments Mollie confirms were made on a direct debit activation link,
     * with what the activation flow answers for them.
     */
    activationPayments?: Record<string, WebhookOutcome>;
    /** Payment links we recorded: pl_ id -> invoice id. */
    links?: Record<string, string>;
    /** The payment ids Mollie says those links produced. */
    linkPayments?: string[];
  } = {},
) {
  const invoices = new Map((initial.invoices ?? [invoiceFixture()]).map((invoice) => [invoice.id, { ...invoice }]));
  const services = new Map((initial.services ?? []).map((service) => [service.id, { ...service }]));
  const payments: Payment[] = [];
  const activationCalls: { molliePaymentId: string; activationIdHint?: string }[] = [];
  const paymentLinks = new Map(Object.entries(initial.links ?? {}));
  const linkConfirmations: { molliePaymentId: string; invoiceId: string }[] = [];
  const createdInvoices: string[] = [];
  /* Stands in for the unique index on (recurring_service_id, billing_period_start). */
  const periodKeys = new Set<string>();

  const tick = async () => {
    if (initial.raceWindow) await new Promise((resolve) => setTimeout(resolve, 0));
  };

  const store: WebhookStore = {
    async upsertPayment(record: PaymentRecord) {
      const existing = payments.find(
        (payment) => payment.source === record.source && payment.providerPaymentId === record.providerPaymentId,
      );
      if (existing) {
        // Never walk back from money-arrived.
        if (existing.status !== "paid") {
          existing.status = record.status;
          existing.amountCents = record.amountCents;
          if (record.paidAt) existing.paidAt = record.paidAt;
        }
        return existing;
      }
      const created: Payment = {
        id: `pay-${payments.length + 1}`,
        invoiceId: record.invoiceId,
        customerId: record.customerId,
        amountCents: record.amountCents,
        currency: "EUR",
        status: record.status,
        source: record.source,
        providerPaymentId: record.providerPaymentId,
        description: record.description,
        createdAt: "2026-09-02T10:00:00.000Z",
        updatedAt: "2026-09-02T10:00:00.000Z",
        ...(record.paidAt ? { paidAt: record.paidAt } : {}),
      };
      payments.push(created);
      return created;
    },
    async getInvoice(id) {
      return invoices.get(id);
    },
    async listPaymentsForInvoice(id) {
      return payments.filter((payment) => payment.invoiceId === id);
    },
    async setInvoiceStatus(id, status: InvoiceStatus) {
      const invoice = invoices.get(id);
      if (invoice) invoice.status = status;
    },
    /* The activation flow, stubbed: only the payments Mollie confirmed are its. */
    async handleMandateActivation(payment, activationIdHint) {
      activationCalls.push({ molliePaymentId: payment.id, ...(activationIdHint ? { activationIdHint } : {}) });
      return initial.activationPayments?.[payment.id];
    },
    async findActivationIdForPaymentLink() {
      return undefined;
    },
    /*
      The unique index, simulated: the check and the insert are separated by an
      await, so parallel callers genuinely interleave, and the loser has to do
      what the real code does -- read back the row the winner wrote.
    */
    async ensureRecurringInvoice(service, period) {
      const key = `${service.id}|${period.start}`;
      const existingId = [...invoices.values()].find(
        (invoice) => invoice.recurringServiceId === service.id && invoice.billingPeriodStart === period.start,
      );
      if (existingId) return existingId;

      await tick();

      if (periodKeys.has(key)) {
        const raced = [...invoices.values()].find(
          (invoice) => invoice.recurringServiceId === service.id && invoice.billingPeriodStart === period.start,
        );
        if (raced) return raced;
      }
      periodKeys.add(key);

      const invoice = invoiceFixture({
        id: `inv-${createdInvoices.length + 2}`,
        netCents: service.amountCents,
        recurringServiceId: service.id,
        billingPeriodStart: period.start,
        billingPeriodEnd: period.end,
        issueDate: period.start,
        dueDate: "2099-01-01",
      });
      invoices.set(invoice.id, invoice);
      createdInvoices.push(invoice.id);
      return invoice;
    },
    async findInvoiceIdForProviderPayment(id) {
      return payments.find((payment) => payment.providerPaymentId === id)?.invoiceId;
    },
    async findServiceBySubscriptionId(subscriptionId) {
      return [...services.values()].find((service) => service.mollie.subscriptionId === subscriptionId);
    },
    async findInvoiceIdForPaymentLink(providerPaymentLinkId) {
      return paymentLinks.get(providerPaymentLinkId);
    },
    /* Mollie's own list of the link's payments, stubbed. */
    async confirmLinkPayment(molliePaymentId, invoiceId) {
      linkConfirmations.push({ molliePaymentId, invoiceId });
      return [...paymentLinks.entries()].some(
        ([, linkedInvoice]) => linkedInvoice === invoiceId && (initial.linkPayments ?? []).includes(molliePaymentId),
      );
    },
  };

  return {
    store,
    invoices,
    services,
    payments,
    activationCalls,
    linkConfirmations,
    createdInvoices,
  };
}

const total = calculateTotals(invoiceFixture().lines).totalCents; // 121,00

function molliePayment(overrides: Partial<MolliePayment> = {}): MolliePayment {
  return {
    id: "tr_1",
    status: "paid",
    amount: { currency: "EUR", value: "121.00" },
    description: "Factuur",
    method: "ideal",
    paidAt: "2026-09-02T10:00:00.000Z",
    metadata: { kind: "invoice", invoiceId: "inv-1", customerId: "cust-1" },
    ...overrides,
  };
}

const today = "2026-09-20";

// Processing must never reach the network by itself; the payment resource is
// handed in, the way the route hands in what it fetched.
beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    throw new Error("A test tried to reach the network");
  });
});

describe("a one-off invoice payment", () => {
  it("records the payment and marks the invoice paid", async () => {
    const { store, invoices, payments } = makeStore();
    const outcome = await processMolliePayment(molliePayment(), store, today);

    expect(outcome.handled).toBe(true);
    expect(payments).toHaveLength(1);
    expect(payments[0]?.status).toBe("paid");
    expect(payments[0]?.amountCents).toBe(total);
    expect(invoices.get("inv-1")?.status).toBe("paid");
  });

  it("leaves the invoice open when the payment failed", async () => {
    const { store, invoices, payments } = makeStore({ invoices: [invoiceFixture({ dueDate: "2026-09-30" })] });
    await processMolliePayment(molliePayment({ status: "failed", paidAt: undefined }), store, today);

    expect(payments[0]?.status).toBe("failed");
    expect(payments[0]?.paidAt).toBeUndefined();
    expect(invoices.get("inv-1")?.status).toBe("sent");
  });

  it("marks an unpaid invoice overdue once its due date has passed", async () => {
    const { store, invoices } = makeStore();
    await processMolliePayment(molliePayment({ status: "failed", paidAt: undefined }), store, "2026-10-01");
    expect(invoices.get("inv-1")?.status).toBe("overdue");
  });

  /* The core idempotency requirement: a hundred deliveries, one payment. */
  it("handles the same webhook a hundred times without duplicating anything", async () => {
    const { store, invoices, payments } = makeStore();
    for (let i = 0; i < 100; i += 1) {
      await processMolliePayment(molliePayment(), store, today);
    }
    expect(payments).toHaveLength(1);
    expect(invoices.get("inv-1")?.status).toBe("paid");
  });

  it("updates the existing row when a known payment id comes back with a new status", async () => {
    const { store, payments } = makeStore();
    await processMolliePayment(molliePayment({ status: "open", paidAt: undefined }), store, today);
    expect(payments[0]?.status).toBe("open");

    await processMolliePayment(molliePayment(), store, today);
    expect(payments).toHaveLength(1);
    expect(payments[0]?.status).toBe("paid");
  });

  /* A late failure for a payment that already succeeded changes nothing. */
  it("never overwrites a successful payment with a failure", async () => {
    const { store, invoices, payments } = makeStore();
    await processMolliePayment(molliePayment(), store, today);
    await processMolliePayment(molliePayment({ status: "failed", paidAt: undefined }), store, today);

    expect(payments[0]?.status).toBe("paid");
    expect(invoices.get("inv-1")?.status).toBe("paid");
  });

  it("refuses a payment whose metadata names another customer", async () => {
    const { store, payments } = makeStore();
    const outcome = await processMolliePayment(
      molliePayment({ metadata: { kind: "invoice", invoiceId: "inv-1", customerId: "cust-999" } }),
      store,
      today,
    );
    expect(outcome.handled).toBe(false);
    expect(payments).toHaveLength(0);
  });

  it("does nothing for an invoice that no longer exists", async () => {
    const { store, payments } = makeStore();
    const outcome = await processMolliePayment(
      molliePayment({ metadata: { kind: "invoice", invoiceId: "inv-gone" } }),
      store,
      today,
    );
    expect(outcome.handled).toBe(false);
    expect(payments).toHaveLength(0);
  });

  it("does nothing for a payment that carries no invoice at all", async () => {
    const { store } = makeStore();
    const outcome = await processMolliePayment(molliePayment({ metadata: null }), store, today);
    expect(outcome.handled).toBe(false);
  });

  it("only settles the invoice the payment belongs to", async () => {
    const { store, invoices } = makeStore({ invoices: [invoiceFixture({ id: "inv-1" }), invoiceFixture({ id: "inv-2" })] });
    await processMolliePayment(molliePayment(), store, today);
    expect(invoices.get("inv-1")?.status).toBe("paid");
    expect(invoices.get("inv-2")?.status).toBe("sent");
  });
});

describe("invoice status decisions", () => {
  it("leaves drafts and cancelled invoices alone, whatever arrives", () => {
    expect(nextInvoiceStatus({ status: "draft", dueDate: "2026-01-01" }, true, today)).toBe("draft");
    expect(nextInvoiceStatus({ status: "cancelled", dueDate: "2026-01-01" }, true, today)).toBe("cancelled");
  });

  /*
    A definitive invoice that was never sent is not a claim either: the
    customer has not been asked, so it cannot fall overdue. It stays where it
    is until the mail goes out.
  */
  it("leaves a definitive invoice that has not been sent where it is", () => {
    expect(nextInvoiceStatus({ status: "issued", dueDate: "2026-01-01" }, false, today)).toBe("issued");
    expect(nextInvoiceStatus({ status: "issued", dueDate: "2026-01-01" }, true, today)).toBe("issued");
  });

  it("keeps a paid invoice paid even when the payments no longer add up", () => {
    expect(nextInvoiceStatus({ status: "paid", dueDate: "2026-01-01" }, false, today)).toBe("paid");
  });
});

describe("a monthly direct debit charge", () => {
  const active = recurringFixture({
    status: "active",
    startsOn: "2026-09-12",
    mollie: { subscriptionId: "sub_1" },
  });

  function chargePayment(overrides: Partial<MolliePayment> = {}): MolliePayment {
    return molliePayment({
      id: "tr_charge",
      amount: { currency: "EUR", value: "30.25" },
      subscriptionId: "sub_1",
      sequenceType: "recurring",
      paidAt: "2026-10-12T06:00:00.000Z",
      metadata: null,
      ...overrides,
    });
  }

  it("bills the period the collection is for and marks it paid", async () => {
    const { store, createdInvoices, invoices, payments } = makeStore({ services: [active] });
    const outcome = await processMolliePayment(chargePayment(), store, "2026-10-12");

    expect(outcome.handled).toBe(true);
    expect(createdInvoices).toHaveLength(1);
    const invoice = invoices.get(createdInvoices[0]!)!;
    expect(invoice.billingPeriodStart).toBe("2026-10-12");
    expect(invoice.status).toBe("paid");
    expect(payments).toHaveLength(1);
  });

  /* The invoice is made at the amount Mollie collected, for the period of the direct debit's due date. */
  it("hands the collected amount to the invoice, and places the charge by its due date rather than when it was paid", async () => {
    const { store, invoices } = makeStore({ services: [active] });
    const seen: { periodStart: string; collectedGrossCents: number }[] = [];
    const original = store.ensureRecurringInvoice;
    store.ensureRecurringInvoice = async (service, period, collectedGrossCents) => {
      seen.push({ periodStart: period.start, collectedGrossCents });
      return original(service, period, collectedGrossCents);
    };

    // Due 12 November, confirmed paid days later: November's term, not October's.
    await processMolliePayment(
      chargePayment({ details: { dueDate: "2026-11-12" }, paidAt: "2026-11-16T06:00:00.000Z", createdAt: "2026-11-09T06:00:00.000Z" }),
      store,
      "2026-11-16",
    );
    expect(seen).toEqual([{ periodStart: "2026-11-12", collectedGrossCents: 3025 }]);
    expect([...invoices.values()].at(-1)!.billingPeriodStart).toBe("2026-11-12");
  });

  it("creates one invoice across a hundred retries", async () => {
    const { store, createdInvoices, payments } = makeStore({ services: [active] });
    for (let i = 0; i < 100; i += 1) {
      await processMolliePayment(chargePayment(), store, "2026-10-12");
    }
    expect(createdInvoices).toHaveLength(1);
    expect(payments).toHaveLength(1);
  });

  /*
    Not the same thing as a retry: these deliveries overlap, so the check for
    an existing invoice happens before any of them has inserted one. The
    unique index is what decides, and the losers read back the winner's row.
  */
  it("creates one invoice when twenty deliveries are processed in parallel", async () => {
    const { store, createdInvoices, payments } = makeStore({ services: [active], raceWindow: true });

    await Promise.all(Array.from({ length: 20 }, () => processMolliePayment(chargePayment(), store, "2026-10-12")));

    expect(createdInvoices).toHaveLength(1);
    expect(payments).toHaveLength(1);
  });

  it("bills a second month separately", async () => {
    const { store, createdInvoices, invoices } = makeStore({ services: [active] });
    await processMolliePayment(chargePayment(), store, "2026-10-12");
    await processMolliePayment(
      chargePayment({ id: "tr_charge2", paidAt: "2026-11-12T06:00:00.000Z" }),
      store,
      "2026-11-12",
    );

    expect(createdInvoices).toHaveLength(2);
    expect(invoices.get(createdInvoices[1]!)?.billingPeriodStart).toBe("2026-11-12");
  });

  /* A failed collection still produces the bill, and it stays open. */
  it("leaves the invoice unpaid when the collection failed", async () => {
    const { store, createdInvoices, invoices } = makeStore({ services: [active] });
    await processMolliePayment(chargePayment({ status: "failed", paidAt: undefined }), store, "2026-10-12");

    expect(createdInvoices).toHaveLength(1);
    expect(invoices.get(createdInvoices[0]!)?.status).toBe("sent");
  });
});

describe("invoices without any Mollie involvement", () => {
  it("keeps working: nothing about them is touched by webhook handling", async () => {
    const { store, invoices } = makeStore({ invoices: [invoiceFixture({ id: "inv-1" }), invoiceFixture({ id: "plain", status: "sent" })] });
    await processMolliePayment(molliePayment(), store, today);

    const untouched = invoices.get("plain");
    expect(untouched?.status).toBe("sent");
    expect(await store.listPaymentsForInvoice("plain")).toEqual([]);
  });
});

describe("a callback for the admin integration check", () => {
  function checkPayment(overrides: Partial<MolliePayment> = {}): MolliePayment {
    return molliePayment({
      id: "tr_check",
      amount: { currency: "EUR", value: "0.01" },
      description: "YM Creations integratietest (testmodus)",
      metadata: { integration_test: "true", kind: "integration_test", source: "admin-integration-check" },
      ...overrides,
    });
  }

  it("is recognised by its marker", () => {
    expect(isIntegrationTestPayment(checkPayment())).toBe(true);
    expect(isIntegrationTestPayment({ metadata: { integration_test: true } })).toBe(true);
    expect(isIntegrationTestPayment({ metadata: { kind: "integration_test" } })).toBe(true);
    expect(isIntegrationTestPayment(molliePayment())).toBe(false);
    expect(isIntegrationTestPayment({ metadata: null })).toBe(false);
  });

  /*
    The strongest form of "changes nothing": the store is a proxy that throws
    on any access, so the test fails if a single read or write is attempted.
  */
  it("never touches the database at all", async () => {
    const neverStore = new Proxy({} as WebhookStore, {
      get(_target, property) {
        return () => {
          throw new Error(`The webhook called store.${String(property)} for an integration test payment`);
        };
      },
    });

    const outcome = await processMolliePayment(checkPayment(), neverStore, "2026-09-20");
    expect(outcome).toEqual({ handled: true, note: "integration test payment ignored" });
  });

  it("leaves invoices, payments, services and customer status exactly as they were", async () => {
    const service = recurringFixture({ status: "active", startsOn: "2026-09-12", mollie: { subscriptionId: "sub_1" } });
    const { store, invoices, payments, services, createdInvoices, activationCalls } = makeStore({
      invoices: [invoiceFixture({ dueDate: "2026-09-30" })],
      services: [service],
    });

    const today = "2026-09-20";
    const before = customerFinancials([...invoices.values()], payments, today);

    // Paid, failed and open: none of them may mean anything here.
    for (const status of ["paid", "failed", "open"] as const) {
      await processMolliePayment(
        checkPayment({ status, ...(status === "paid" ? {} : { paidAt: undefined }) }),
        store,
        today,
      );
    }

    expect(payments).toEqual([]);
    expect(createdInvoices).toEqual([]);
    expect(activationCalls).toEqual([]);
    expect(invoices.get("inv-1")?.status).toBe("sent");
    expect(services.get("svc-1")).toEqual(service);

    const after = customerFinancials([...invoices.values()], payments, today);
    expect(after).toEqual(before);
    expect(after.status).toBe("open");
    expect(after.outstandingCents).toBe(totalsOf(invoiceFixture().lines).totalCents);
  });

  /* An ordinary payment that happens to carry extra metadata is not a test. */
  it("does not mistake a real payment for one", async () => {
    const { store, payments, invoices } = makeStore();
    await processMolliePayment(
      molliePayment({ metadata: { kind: "invoice", invoiceId: "inv-1", customerId: "cust-1", note: "integration" } }),
      store,
      "2026-09-20",
    );

    expect(payments).toHaveLength(1);
    expect(invoices.get("inv-1")?.status).toBe("paid");
  });
});

/*
  A payment link carries no metadata, so a link payment reaches the webhook
  with nothing on it that names an invoice. The invoice comes from our own row
  -- reached through the hint in the link's webhook URL -- and Mollie has to
  confirm the payment really came from that link.
*/
describe("a payment that came from a payment link", () => {
  const linkPayment = () => {
    const payment = molliePayment();
    delete payment.metadata;
    return payment;
  };

  it("settles the invoice its link belongs to", async () => {
    const { store, invoices, payments, linkConfirmations } = makeStore({
      links: { pl_1: "inv-1" },
      linkPayments: ["tr_1"],
    });

    const outcome = await processMolliePayment(linkPayment(), store, today, { invoiceIdHint: "inv-1" });

    expect(outcome.handled).toBe(true);
    expect(invoices.get("inv-1")!.status).toBe("paid");
    expect(payments).toHaveLength(1);
    // The hint was checked against the provider before anything was written.
    expect(linkConfirmations).toEqual([{ molliePaymentId: "tr_1", invoiceId: "inv-1" }]);
  });

  /* A hint nobody can confirm writes nothing at all. */
  it("refuses a hint the provider does not confirm", async () => {
    const { store, invoices, payments } = makeStore({ links: { pl_1: "inv-1" }, linkPayments: [] });

    const outcome = await processMolliePayment(linkPayment(), store, today, { invoiceIdHint: "inv-1" });

    expect(outcome).toMatchObject({ handled: false, note: "payment cannot be traced to an invoice" });
    expect(invoices.get("inv-1")!.status).toBe("sent");
    expect(payments).toHaveLength(0);
  });

  it("refuses a link payment with no hint at all", async () => {
    const { store, payments } = makeStore({ links: { pl_1: "inv-1" }, linkPayments: ["tr_1"] });

    const outcome = await processMolliePayment(linkPayment(), store, today);

    expect(outcome.handled).toBe(false);
    expect(payments).toHaveLength(0);
  });

  /* A retry finds the payment already recorded and needs no second lookup. */
  it("routes a repeated delivery from the payment it already recorded", async () => {
    const { store, payments, linkConfirmations } = makeStore({
      links: { pl_1: "inv-1" },
      linkPayments: ["tr_1"],
    });

    await processMolliePayment(linkPayment(), store, today, { invoiceIdHint: "inv-1" });
    await processMolliePayment(linkPayment(), store, today, { invoiceIdHint: "inv-1" });

    expect(payments).toHaveLength(1);
    expect(linkConfirmations).toHaveLength(1);
  });
});

/*
  The production delivery pattern: Mollie's first call failed, its retry
  succeeded. The failed attempt must leave nothing half-done that the retry
  would then double.
*/
describe("a delivery that fails and is retried", () => {
  it("records the payment once and settles the invoice once", async () => {
    const made = makeStore({ links: { pl_1: "inv-1" }, linkPayments: ["tr_1"] });
    const payment = molliePayment({ metadata: null });
    const upsert = made.store.upsertPayment;
    let calls = 0;
    made.store.upsertPayment = async (record) => {
      calls += 1;
      if (calls === 1) throw new Error("Betaling vastleggen: connection reset");
      return upsert(record);
    };

    await expect(processMolliePayment(payment, made.store, today, { invoiceIdHint: "inv-1" })).rejects.toThrow();
    const retried = await processMolliePayment(payment, made.store, today, { invoiceIdHint: "inv-1" });
    await processMolliePayment(payment, made.store, today, { invoiceIdHint: "inv-1" });

    expect(retried).toMatchObject({ handled: true, invoiceStatus: "paid" });
    expect(made.payments).toHaveLength(1);
    expect(made.invoices.get("inv-1")!.status).toBe("paid");
  });
});

/*
  The recovery for an activation invoice that was paid without producing a
  mandate -- YM-F-2026-000002, Flexora Bouw: the website invoice of 363,00
  (300,00 + 21%) was paid through a one-off link, and the monthly service of
  10,00 excl. btw (12,10 incl.) that it announced from 4 October never got
  its mandate. The standalone activation link asks for the first monthly
  term, 12,10, as a separate first payment.

  What must hold: the 363,00 is never asked for again, the paid invoice is
  never touched, the 12,10 becomes its own term invoice, and the first
  automatic collection after it can always be announced fourteen days ahead.
*/

/*
  A payment on a direct debit activation link. Its EUR 0.01 buys a mandate,
  not a term, so the webhook hands it to the activation flow before any
  invoice is looked up -- and an ordinary invoice payment never reaches that
  flow's answer.
*/
describe("a direct debit activation payment", () => {
  const cent = () =>
    molliePayment({
      id: "tr_cent",
      amount: { currency: "EUR", value: "0.01" },
      sequenceType: "first",
      customerId: "cst_1",
      mandateId: "mdt_1",
      metadata: null,
    });

  it("goes to the activation flow and never touches an invoice", async () => {
    const made = makeStore({
      activationPayments: { tr_cent: { handled: true, note: "activation paid; mandate valid" } },
      links: { pl_1: "inv-1" },
      linkPayments: ["tr_cent"],
    });

    const outcome = await processMolliePayment(cent(), made.store, today, {
      activationIdHint: "act-1",
      // Even a hint naming an invoice cannot pull the cent onto it.
      invoiceIdHint: "inv-1",
    });

    expect(outcome).toEqual({ handled: true, note: "activation paid; mandate valid" });
    expect(made.activationCalls).toEqual([{ molliePaymentId: "tr_cent", activationIdHint: "act-1" }]);
    expect(made.payments).toEqual([]);
    expect(made.invoices.get("inv-1")!.status).toBe("sent");
    expect(made.linkConfirmations).toEqual([]);
  });

  it("does not move an open invoice's balance or a paid invoice's status", async () => {
    const made = makeStore({
      invoices: [invoiceFixture({ id: "inv-open" }), invoiceFixture({ id: "inv-paid", status: "paid" })],
      activationPayments: { tr_cent: { handled: true, note: "activation paid; mandate valid" } },
    });

    for (let i = 0; i < 3; i += 1) {
      await processMolliePayment(cent(), made.store, today, { activationIdHint: "act-1" });
    }

    expect(made.payments).toEqual([]);
    expect(made.invoices.get("inv-open")!.status).toBe("sent");
    expect(made.invoices.get("inv-paid")!.status).toBe("paid");
    expect(made.createdInvoices).toEqual([]);
  });

  /* A pending mandate asks Mollie to deliver again; the route answers non-2xx. */
  it("passes a request for redelivery through unchanged", async () => {
    const made = makeStore({
      activationPayments: {
        tr_cent: { handled: false, retry: true, note: "activation paid; mandate still pending at the provider" },
      },
    });

    const outcome = await processMolliePayment(cent(), made.store, today, { activationIdHint: "act-1" });

    expect(outcome).toMatchObject({ handled: false, retry: true });
    expect(made.payments).toEqual([]);
  });

  it("leaves ordinary invoice payments to the invoice routing", async () => {
    const made = makeStore();

    const outcome = await processMolliePayment(molliePayment(), made.store, today);

    expect(made.activationCalls).toEqual([{ molliePaymentId: "tr_1" }]);
    expect(outcome).toMatchObject({ handled: true, invoiceStatus: "paid" });
    expect(made.payments).toHaveLength(1);
  });

  /*
    The old coupling, gone: a service that names this invoice is not switched
    on by paying it, whatever the payment carries.
  */
  it("never activates a service because its invoice was paid", async () => {
    const service = recurringFixture({ status: "draft", activationInvoiceId: "inv-1", startsOn: "2026-10-15" });
    const made = makeStore({ services: [service] });

    await processMolliePayment(
      molliePayment({ customerId: "cst_1", mandateId: "mdt_1", sequenceType: "first" }),
      made.store,
      today,
    );

    expect(made.invoices.get("inv-1")!.status).toBe("paid");
    expect(made.services.get("svc-1")).toEqual(service);
  });
});
