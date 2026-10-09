import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, customerRowFixture, recurringFixture } from "@/lib/payments/fixtures";
import { nextDebitSchedule } from "@/lib/payments/prenotification";
import type { RecurringService } from "@/lib/payments/types";

/*
  Starting the monthly collection: the third step, only after Mollie calls the
  mandate valid, and on a date that bills no period twice and can still be
  announced fourteen days ahead.
*/
const listMandates = vi.fn();
const createSubscription = vi.fn();

vi.mock("@/lib/mollie/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mollie/client")>()),
  listMandates: (...args: unknown[]) => listMandates(...args),
  createSubscription: (...args: unknown[]) => createSubscription(...args),
}));

const { firstCollectionDate, startCollection } = await import("@/lib/payments/collection-start");

/* Flexora Bouw's service: 10,00 excl. btw, first collection agreed for 4 October. */
const flexora = (overrides: Partial<RecurringService> = {}) =>
  recurringFixture({
    id: "svc-1",
    name: "Websitebeheer & hosting",
    amountCents: 1000,
    vatRate: 21,
    startsOn: "2026-10-04",
    status: "draft",
    activationInvoiceId: "inv-363",
    ...overrides,
  });

const serviceRow = (service: RecurringService) => ({
  id: service.id,
  customer_id: service.customerId,
  status: service.status,
  starts_on: service.startsOn ?? null,
  mollie_subscription_id: service.mollie.subscriptionId ?? null,
});

let db: ReturnType<typeof createFakeDb>;

function seed(service: RecurringService, billedPeriodStarts: string[] = []) {
  return createFakeDb({
    customers: [customerRowFixture()],
    customer_payment_providers: [
      { id: "cpp-1", customer_id: "cust-1", provider: "mollie", provider_customer_id: "cst_flexora", provider_mandate_id: null },
    ],
    recurring_services: [serviceRow(service)],
    invoices: [
      // The paid 363,00 project invoice: not a billed period of the service.
      { id: "inv-363", customer_id: "cust-1", recurring_service_id: null, billing_period_start: null },
      ...billedPeriodStarts.map((start, index) => ({
        id: `inv-term-${index}`,
        customer_id: "cust-1",
        recurring_service_id: service.id,
        billing_period_start: start,
      })),
    ],
  });
}

const valid = [{ id: "mdt_new", status: "valid", method: "directdebit" }];

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MOLLIE_API_KEY = "test_dummy";
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  listMandates.mockResolvedValue(valid);
  createSubscription.mockResolvedValue({ id: "sub_1", status: "active" });
});

describe("the first automatic collection", () => {
  /* Flexora, started today (9 October): October cannot be announced any more. */
  it("is the first agreed date that can still be announced", () => {
    expect(firstCollectionDate({ startsOn: "2026-10-04", billedPeriodStarts: [], todayKey: "2026-10-09" })).toBe(
      "2026-11-04",
    );
  });

  it("keeps 4 November up to the day it can still be announced, and moves on after", () => {
    // Fourteen days from tomorrow: 20 Oct gives 4 Nov exactly, 21 Oct does not.
    expect(firstCollectionDate({ startsOn: "2026-10-04", billedPeriodStarts: [], todayKey: "2026-10-20" })).toBe(
      "2026-11-04",
    );
    expect(firstCollectionDate({ startsOn: "2026-10-04", billedPeriodStarts: [], todayKey: "2026-10-21" })).toBe(
      "2026-12-04",
    );
  });

  /* Test 14: a period already billed is never collected again. */
  it("comes after every period that is already billed", () => {
    expect(
      firstCollectionDate({ startsOn: "2026-10-04", billedPeriodStarts: ["2026-10-04"], todayKey: "2026-10-09" }),
    ).toBe("2026-11-04");
    expect(
      firstCollectionDate({
        startsOn: "2026-10-04",
        billedPeriodStarts: ["2026-10-04", "2026-11-04", "2026-12-04"],
        todayKey: "2026-10-09",
      }),
    ).toBe("2027-01-04");
  });

  it("is the earliest announceable day for a service without a start date", () => {
    expect(firstCollectionDate({ billedPeriodStarts: [], todayKey: "2026-10-09" })).toBe("2026-10-24");
  });

  it("keeps the day of the month through short months", () => {
    expect(firstCollectionDate({ startsOn: "2026-01-31", billedPeriodStarts: [], todayKey: "2026-02-01" })).toBe(
      "2026-02-28",
    );
  });
});

describe("starting the monthly collection", () => {
  it("creates one subscription on the mandate Mollie confirms, from the computed date", async () => {
    const service = flexora();
    db = seed(service);

    const result = await startCollection(db as never, service, "2026-10-09");

    expect(result).toEqual({ ok: true, firstDebitOn: "2026-11-04" });
    expect(createSubscription).toHaveBeenCalledTimes(1);
    expect(createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "cst_flexora",
        mandateId: "mdt_new",
        amountCents: 1210,
        interval: "1 month",
        startDate: "2026-11-04",
        idempotencyKey: "recurring-svc-1",
        metadata: { kind: "recurring", recurringServiceId: "svc-1", customerId: "cust-1" },
      }),
    );
    expect(db.rows("recurring_services")[0]).toMatchObject({
      status: "active",
      mollie_subscription_id: "sub_1",
      starts_on: "2026-11-04",
    });
    expect(db.rows("customer_payment_providers")[0]?.provider_mandate_id).toBe("mdt_new");
  });

  /*
    The announcement job and Mollie agree on the date: with nothing billed,
    the next collection the schedule announces is the subscription's start.
  */
  it("leaves the announcement schedule pointing at the same first collection", async () => {
    const service = flexora();
    db = seed(service);
    await startCollection(db as never, service, "2026-10-09");

    const row = db.rows("recurring_services")[0]!;
    const started = { ...service, status: "active" as const, startsOn: row.starts_on as string, mollie: { subscriptionId: "sub_1" } };
    expect(nextDebitSchedule({ service: started, billedPeriodStarts: [] })).toMatchObject({
      debitOn: "2026-11-04",
      announceFrom: "2026-10-21",
    });
  });

  /* Test 14: the first charge never lands on a period that is already paid. */
  it("starts after a period that was already billed, and keeps the anchor", async () => {
    const service = flexora();
    db = seed(service, ["2026-10-04"]);

    const result = await startCollection(db as never, service, "2026-10-09");

    expect(result).toEqual({ ok: true, firstDebitOn: "2026-11-04" });
    expect(db.rows("recurring_services")[0]?.starts_on).toBe("2026-10-04");
    expect(
      nextDebitSchedule({
        service: { ...service, status: "active", mollie: { subscriptionId: "sub_1" } },
        billedPeriodStarts: ["2026-10-04"],
      }),
    ).toMatchObject({ debitOn: "2026-11-04" });
  });

  /* Test 13: no subscription before a valid mandate. */
  it.each([
    ["none", []],
    ["pending", [{ id: "mdt_new", status: "pending", method: "directdebit" }]],
    ["invalid", [{ id: "mdt_new", status: "invalid", method: "directdebit" }]],
  ])("does not start while the mandate is %s", async (_state, mandates) => {
    const service = flexora();
    db = seed(service);
    listMandates.mockResolvedValue(mandates);

    const result = await startCollection(db as never, service, "2026-10-09");

    expect(result.ok).toBe(false);
    expect(createSubscription).not.toHaveBeenCalled();
    expect(db.rows("recurring_services")[0]).toMatchObject({ status: "draft", mollie_subscription_id: null });
  });

  it("does not start twice", async () => {
    const service = flexora();
    db = seed(service);
    await startCollection(db as never, service, "2026-10-09");

    const again = await startCollection(db as never, service, "2026-10-09");

    expect(again).toEqual({ ok: false, reason: "Voor deze dienst loopt de incasso al." });
  });

  it("refuses for a service that already collects", async () => {
    const service = flexora({ mollie: { subscriptionId: "sub_old" }, status: "active" });
    db = seed(service);

    expect(await startCollection(db as never, service, "2026-10-09")).toEqual({
      ok: false,
      reason: "Voor deze dienst loopt de incasso al.",
    });
    expect(createSubscription).not.toHaveBeenCalled();
  });

  it("accepts a later date the admin chose, and refuses an earlier one", async () => {
    const service = flexora();
    db = seed(service);
    expect(await startCollection(db as never, service, "2026-10-09", "2026-10-20")).toEqual({
      ok: false,
      reason: "De eerste incasso kan op zijn vroegst op 2026-11-04.",
    });

    expect(await startCollection(db as never, service, "2026-10-09", "2026-12-01")).toEqual({
      ok: true,
      firstDebitOn: "2026-12-01",
    });
    expect(createSubscription).toHaveBeenCalledWith(expect.objectContaining({ startDate: "2026-12-01" }));
  });

  it("refuses a chosen date once a period is billed: the calendar follows from that", async () => {
    const service = flexora();
    db = seed(service, ["2026-10-04"]);

    const result = await startCollection(db as never, service, "2026-10-09", "2026-12-01");

    expect(result.ok).toBe(false);
    expect(createSubscription).not.toHaveBeenCalled();
  });
});
