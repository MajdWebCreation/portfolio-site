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
    activations?: { id: string; recurringServiceId: string; molliePaymentId: string; usedAt?: string }[];
    /** Widens the window between checking for an invoice and inserting it. */
    raceWindow?: boolean;
  } = {},
) {
  const invoices = new Map((initial.invoices ?? [invoiceFixture()]).map((invoice) => [invoice.id, { ...invoice }]));
  const services = new Map((initial.services ?? []).map((service) => [service.id, { ...service }]));
  const activations = [...(initial.activations ?? [])];
  const payments: Payment[] = [];
  const providerLinks: { customerId: string; providerCustomerId: string; providerMandateId: string }[] = [];
  const subscriptionCalls: { serviceId: string; startDate: string }[] = [];
  const invoiceMails: { invoiceId: string; number: string; status: string }[] = [];
  let mailFails = false;
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
    async findActivationByPaymentId(id) {
      const found = activations.find((activation) => activation.molliePaymentId === id);
      return found
        ? { id: found.id, recurringServiceId: found.recurringServiceId, ...(found.usedAt ? { usedAt: found.usedAt } : {}) }
        : undefined;
    },
    async getRecurringService(id) {
      return services.get(id);
    },
    async storeProviderMandate({ customerId, providerCustomerId, providerMandateId }) {
      const existing = providerLinks.find((link) => link.customerId === customerId);
      if (existing) {
        existing.providerCustomerId = providerCustomerId;
        existing.providerMandateId = providerMandateId;
        return;
      }
      providerLinks.push({ customerId, providerCustomerId, providerMandateId });
    },
    async activateService(serviceId, startsOn) {
      const service = services.get(serviceId);
      if (!service) return undefined;
      if (!service.startsOn) service.startsOn = startsOn;
      if (service.status !== "canceled") service.status = "active";
      return service;
    },
    async markActivationUsed(activationId) {
      const activation = activations.find((item) => item.id === activationId);
      if (activation && !activation.usedAt) activation.usedAt = "2026-09-02T10:00:00.000Z";
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
    /* Idempotent on the document's own `sent_at`, like the real one. */
    async sendSettledInvoice(invoice) {
      if (mailFails) return { sent: false, reason: "Resend was onbereikbaar" };
      invoiceMails.push({ invoiceId: invoice.id, number: invoice.number.value, status: invoice.status });
      const stored = invoices.get(invoice.id);
      if (stored) stored.sentAt = "2026-09-12T10:05:00.000Z";
      return { sent: true };
    },
    async createSubscription(service, startDate) {
      if (service.mollie.subscriptionId) return;
      subscriptionCalls.push({ serviceId: service.id, startDate });
      const stored = services.get(service.id);
      if (stored) stored.mollie = { subscriptionId: `sub_${service.id}` };
    },
    async findInvoiceIdForProviderPayment(id) {
      return payments.find((payment) => payment.providerPaymentId === id)?.invoiceId;
    },
    async findServiceBySubscriptionId(subscriptionId) {
      return [...services.values()].find((service) => service.mollie.subscriptionId === subscriptionId);
    },
  };

  return {
    store,
    invoices,
    services,
    payments,
    providerLinks,
    subscriptionCalls,
    createdInvoices,
    invoiceMails,
    failMail: (value: boolean) => {
      mailFails = value;
    },
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

  it("keeps a paid invoice paid even when the payments no longer add up", () => {
    expect(nextInvoiceStatus({ status: "paid", dueDate: "2026-01-01" }, false, today)).toBe("paid");
  });
});

describe("activating direct debit", () => {
  const activation = { id: "act-1", recurringServiceId: "svc-1", molliePaymentId: "tr_first" };

  function firstPayment(overrides: Partial<MolliePayment> = {}): MolliePayment {
    return molliePayment({
      id: "tr_first",
      // The gross amount: the service costs 25,00 excl. btw.
      amount: { currency: "EUR", value: "30.25" },
      customerId: "cst_1",
      mandateId: "mdt_1",
      sequenceType: "first",
      paidAt: "2026-09-12T10:00:00.000Z",
      metadata: { kind: "recurring_activation", recurringServiceId: "svc-1", customerId: "cust-1" },
      ...overrides,
    });
  }

  /*
    The first payment is the first billing period, so it produces one ordinary
    invoice and one ordinary payment row -- not a special case beside them.
  */
  it("bills the first period once and attaches the payment to it", async () => {
    const { store, invoices, payments, createdInvoices } = makeStore({ services: [recurringFixture()], activations: [{ ...activation }] });
    await processMolliePayment(firstPayment(), store, "2026-09-12");

    expect(createdInvoices).toHaveLength(1);
    const invoice = invoices.get(createdInvoices[0]!)!;
    expect(invoice.recurringServiceId).toBe("svc-1");
    expect(invoice.billingPeriodStart).toBe("2026-09-12");
    expect(invoice.billingPeriodEnd).toBe("2026-10-11");
    expect(invoice.status).toBe("paid");

    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ invoiceId: invoice.id, status: "paid", source: "mollie" });
  });

  it("stores the mandate against the customer, not against the service", async () => {
    const { store, providerLinks, services } = makeStore({ services: [recurringFixture()], activations: [{ ...activation }] });
    await processMolliePayment(firstPayment(), store, "2026-09-12");

    expect(providerLinks).toEqual([{ customerId: "cust-1", providerCustomerId: "cst_1", providerMandateId: "mdt_1" }]);
    expect(services.get("svc-1")?.mollie).toEqual({ subscriptionId: "sub_svc-1" });
  });

  /* The month just paid must not be collected again. */
  it("starts the subscription at the next period", async () => {
    const { store, subscriptionCalls } = makeStore({ services: [recurringFixture()], activations: [{ ...activation }] });
    await processMolliePayment(firstPayment(), store, "2026-09-12");

    expect(subscriptionCalls).toEqual([{ serviceId: "svc-1", startDate: "2026-10-12" }]);
  });

  it("uses the agreed start date when the service has one", async () => {
    const { store, subscriptionCalls, invoices, createdInvoices } = makeStore({
      services: [recurringFixture({ startsOn: "2026-10-01" })],
      activations: [{ ...activation }],
    });
    await processMolliePayment(firstPayment(), store, "2026-09-12");

    expect(invoices.get(createdInvoices[0]!)?.billingPeriodStart).toBe("2026-10-01");
    expect(subscriptionCalls).toEqual([{ serviceId: "svc-1", startDate: "2026-11-01" }]);
  });

  /* Reopened links, double clicks and repeated webhooks all land here. */
  it("never creates a second subscription, invoice or payment however often the webhook arrives", async () => {
    const { store, subscriptionCalls, createdInvoices, payments } = makeStore({ services: [recurringFixture()], activations: [{ ...activation }] });
    for (let i = 0; i < 100; i += 1) {
      await processMolliePayment(firstPayment(), store, "2026-09-12");
    }
    expect(subscriptionCalls).toHaveLength(1);
    expect(createdInvoices).toHaveLength(1);
    expect(payments).toHaveLength(1);
  });

  it("does not activate anything when the first payment failed", async () => {
    const { store, services, subscriptionCalls, createdInvoices } = makeStore({ services: [recurringFixture()], activations: [{ ...activation }] });
    const outcome = await processMolliePayment(firstPayment({ status: "failed", paidAt: undefined }), store, "2026-09-12");

    expect(outcome.handled).toBe(true);
    expect(services.get("svc-1")?.status).toBe("awaiting_mandate");
    expect(subscriptionCalls).toEqual([]);
    expect(createdInvoices).toEqual([]);
  });

  it("waits when the payment succeeded but carries no mandate yet", async () => {
    const { store, subscriptionCalls } = makeStore({ services: [recurringFixture()], activations: [{ ...activation }] });
    const outcome = await processMolliePayment(firstPayment({ mandateId: undefined }), store, "2026-09-12");
    expect(outcome.handled).toBe(false);
    expect(subscriptionCalls).toEqual([]);
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
    const { store, invoices, payments, services, createdInvoices, subscriptionCalls } = makeStore({
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
    expect(subscriptionCalls).toEqual([]);
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

describe("the invoice for the first term", () => {
  const activation = { id: "act-1", recurringServiceId: "svc-1", molliePaymentId: "tr_first" };

  function firstPayment(overrides: Partial<MolliePayment> = {}): MolliePayment {
    return molliePayment({
      id: "tr_first",
      amount: { currency: "EUR", value: "30.25" },
      customerId: "cst_1",
      mandateId: "mdt_1",
      sequenceType: "first",
      paidAt: "2026-09-12T10:00:00.000Z",
      metadata: { kind: "recurring_activation", recurringServiceId: "svc-1", customerId: "cust-1" },
      ...overrides,
    });
  }

  /*
    The customer paid this term themselves in the checkout they just left, so
    the document goes out now -- not tomorrow, and not as an announcement.
  */
  it("is mailed straight away, as a paid invoice", async () => {
    const { store, invoiceMails, createdInvoices, payments } = makeStore({
      services: [recurringFixture()],
      activations: [{ ...activation }],
    });

    const outcome = await processMolliePayment(firstPayment(), store, "2026-09-12");

    expect(outcome).toMatchObject({ handled: true, note: "first term invoiced and mailed" });
    expect(createdInvoices).toHaveLength(1);
    expect(payments).toHaveLength(1);
    expect(invoiceMails).toHaveLength(1);
    // Mailed as paid, so the document says settled rather than announcing.
    expect(invoiceMails[0]).toMatchObject({ invoiceId: createdInvoices[0], status: "paid" });
  });

  it("mails nothing twice however often the webhook arrives", async () => {
    const { store, invoiceMails, createdInvoices } = makeStore({
      services: [recurringFixture()],
      activations: [{ ...activation }],
    });

    for (let i = 0; i < 20; i += 1) await processMolliePayment(firstPayment(), store, "2026-09-12");

    expect(createdInvoices).toHaveLength(1);
    expect(invoiceMails).toHaveLength(1);
  });

  /*
    A mail that fails is reported as unhandled, so the route answers non-2xx
    and Mollie delivers again. The retry reuses the same invoice and the same
    number; only the mail is attempted once more.
  */
  it("asks for a redelivery when the mail fails, and reuses the same invoice", async () => {
    const made = makeStore({ services: [recurringFixture()], activations: [{ ...activation }] });
    made.failMail(true);

    const failed = await processMolliePayment(firstPayment(), made.store, "2026-09-12");
    expect(failed.handled).toBe(false);
    expect(failed.note).toContain("first term invoice mail failed");
    expect(made.invoiceMails).toHaveLength(0);
    expect(made.createdInvoices).toHaveLength(1);

    const numberBefore = made.invoices.get(made.createdInvoices[0]!)?.number.value;

    made.failMail(false);
    const retried = await processMolliePayment(firstPayment(), made.store, "2026-09-12");

    expect(retried.handled).toBe(true);
    expect(made.createdInvoices).toHaveLength(1);
    expect(made.invoices.get(made.createdInvoices[0]!)?.number.value).toBe(numberBefore);
    expect(made.invoiceMails).toHaveLength(1);
    expect(made.payments).toHaveLength(1);
  });

  it("does not mail anything when the first payment failed", async () => {
    const { store, invoiceMails, createdInvoices } = makeStore({
      services: [recurringFixture()],
      activations: [{ ...activation }],
    });

    await processMolliePayment(firstPayment({ status: "failed", paidAt: undefined }), store, "2026-09-12");

    expect(createdInvoices).toEqual([]);
    expect(invoiceMails).toEqual([]);
  });
});
