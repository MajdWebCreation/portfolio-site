import { describe, expect, it, vi } from "vitest";
import type { Invoice } from "@/lib/admin/invoices/types";
import type { RecurringService } from "@/lib/payments/types";

/**
 * The activation summaries must say the same thing whether a page hands over
 * what it already read or lets this module read it, and the invoice page's
 * three facts must be asked together.
 */

const queries: string[] = [];
const rows: Record<string, unknown[]> = {
  customer_payment_providers: [{ customer_id: "cust-1", provider_mandate_id: "mdt_1" }],
  invoices: [{ id: "inv-1", number_value: "YM-F-2026-0007", status: "paid" }],
};

function table(name: string) {
  const chain = {
    select: () => chain,
    in: () => chain,
    not: () => chain,
    eq: () => chain,
    maybeSingle: () => chain,
    then: (resolve: (value: { data: unknown[]; error: null }) => void) => {
      queries.push(name);
      resolve({ data: rows[name] ?? [], error: null });
    },
  };
  return chain;
}

vi.mock("@/lib/admin/db", () => ({ adminDb: async () => ({ from: table }) }));

const readers = { services: 0 };
let started: string[] = [];
function deferred<T>(name: string, value: T): Promise<T> {
  started.push(name);
  return new Promise((resolve) => setTimeout(() => resolve(value), 5));
}

const service: RecurringService = {
  id: "svc-1",
  customerId: "cust-1",
  name: "Onderhoud",
  description: "",
  amountCents: 4900,
  currency: "EUR",
  vatRate: 21,
  billingInterval: "monthly",
  startsOn: "2026-10-01",
  status: "pending_activation",
  activationInvoiceId: "inv-1",
  mollie: {},
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
} as unknown as RecurringService;

vi.mock("@/lib/payments/pay-link", () => ({
  serviceActivatedBy: async () => deferred("attached", service),
}));

vi.mock("@/lib/admin/readers", () => ({
  readRecurringServicesForCustomer: async () => {
    readers.services += 1;
    return deferred("services", [service]);
  },
}));

const { activationSummaries, invoiceActivation, mandateByCustomer } = await import("@/lib/payments/activation-view");

const invoice = {
  id: "inv-1",
  number: { value: "YM-F-2026-0007", provisional: false },
  status: "paid",
} as unknown as Invoice;

describe("activationSummaries", () => {
  it("reads mandates and activation invoices when handed nothing", async () => {
    queries.length = 0;

    const summaries = await activationSummaries([service]);

    expect(queries.sort()).toEqual(["customer_payment_providers", "invoices"]);
    expect(summaries["svc-1"]?.invoice).toEqual({ id: "inv-1", number: "YM-F-2026-0007", paid: true });
  });

  it("gives the same answer from what the page already read, without a query", async () => {
    const fromDatabase = await activationSummaries([service]);
    queries.length = 0;

    const fromPage = await activationSummaries([service], {
      customerIds: ["cust-1"],
      mandates: new Set(["cust-1"]),
      invoices: [invoice],
    });

    expect(queries).toEqual([]);
    expect(fromPage).toEqual(fromDatabase);
  });

  it("still reads what the page did not have", async () => {
    queries.length = 0;

    const other = { ...service, id: "svc-2", customerId: "cust-2", activationInvoiceId: "inv-9" } as RecurringService;
    await activationSummaries([service, other], {
      customerIds: ["cust-1"],
      mandates: new Set(["cust-1"]),
      invoices: [invoice],
    });

    expect(queries.sort()).toEqual(["customer_payment_providers", "invoices"]);
  });

  it("asks nothing for an empty list of customers", async () => {
    queries.length = 0;
    expect(await mandateByCustomer([])).toEqual(new Set());
    expect(queries).toEqual([]);
  });
});

describe("invoiceActivation", () => {
  it("starts its three reads together and takes the services from the shared reader", async () => {
    queries.length = 0;
    started = [];
    readers.services = 0;

    const view = await invoiceActivation({ id: "inv-1", customerId: "cust-1", status: "paid" });

    // Both slow reads were started before either had resolved, and the mandate
    // query went out in the same breath.
    expect(started).toEqual(["attached", "services"]);
    expect(queries).toEqual(["customer_payment_providers"]);
    expect(readers.services).toBe(1);
    expect(view.attached?.id).toBe("svc-1");
    expect(view.status).toBeDefined();
  });
});
