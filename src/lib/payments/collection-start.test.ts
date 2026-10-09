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
const listSubscriptions = vi.fn();

vi.mock("@/lib/mollie/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mollie/client")>()),
  listMandates: (...args: unknown[]) => listMandates(...args),
  createSubscription: (...args: unknown[]) => createSubscription(...args),
  listSubscriptions: (...args: unknown[]) => listSubscriptions(...args),
}));

const { alreadyCollectingReason, claimStaleMs, firstCollectionDate, startCollection, startInProgressReason } =
  await import("@/lib/payments/collection-start");

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
  name: service.name,
  amount_cents: service.amountCents,
  vat_rate: service.vatRate,
  status: service.status,
  starts_on: service.startsOn ?? null,
  mollie_subscription_id: service.mollie.subscriptionId ?? null,
  subscription_claim_id: null,
  subscription_claimed_at: null,
});

let db: ReturnType<typeof createFakeDb>;

function seed(service: RecurringService, billedPeriodStarts: string[] = [], others: RecurringService[] = []) {
  return createFakeDb({
    customers: [customerRowFixture()],
    customer_payment_providers: [
      { id: "cpp-1", customer_id: "cust-1", provider: "mollie", provider_customer_id: "cst_flexora", provider_mandate_id: null },
    ],
    recurring_services: [serviceRow(service), ...others.map(serviceRow)],
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
  /*
    Mollie as it really behaves once its one-hour idempotency cache has
    expired: every create makes a new subscription, with a new id. Whatever
    stops a second subscription has to be ours.
  */
  atMollie = [];
  createSubscription.mockImplementation(async (input: { startDate: string; metadata: Record<string, string> }) => {
    const created = { id: `sub_${atMollie.length + 1}`, status: "pending", startDate: input.startDate, metadata: input.metadata };
    atMollie.push(created);
    return created;
  });
  listSubscriptions.mockImplementation(async () => [...atMollie]);
});

/** The subscriptions Mollie holds for the customer, as created during a test. */
let atMollie: { id: string; status: string; startDate: string; metadata: Record<string, string> }[] = [];

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
      subscription_claim_id: null,
      subscription_claimed_at: null,
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

    expect(again).toEqual({ ok: false, reason: alreadyCollectingReason });
    expect(createSubscription).toHaveBeenCalledTimes(1);
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

/*
  Exactly one subscription per service, guaranteed by our own database --
  Mollie's Idempotency-Key is kept for one hour, so it is a second line of
  defence only. In every test below Mollie would happily create a second
  subscription if it were asked to: the point is that it never is.
*/
describe("starting a collection exactly once", () => {
  /** Lets one database write fail, the way a dropped connection would. */
  function failNextRecord(target: ReturnType<typeof createFakeDb>) {
    const from = target.from;
    let armed = true;
    return {
      ...target,
      from(table: string) {
        const builder = from(table);
        if (table !== "recurring_services") return builder;
        const update = builder.update;
        builder.update = (row: Record<string, unknown>) => {
          if (armed && row.mollie_subscription_id) {
            armed = false;
            const failing = {
              eq: () => failing,
              is: () => failing,
              select: () => failing,
              maybeSingle: async () => ({ data: null, error: { message: "connection reset" } }),
            };
            return failing as never;
          }
          return update(row);
        };
        return builder;
      },
    };
  }

  it("makes one subscription when two clicks arrive at the same moment", async () => {
    const service = flexora();
    db = seed(service);

    const results = await Promise.all([
      startCollection(db as never, service, "2026-10-09"),
      startCollection(db as never, service, "2026-10-09"),
    ]);

    expect(createSubscription).toHaveBeenCalledTimes(1);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toEqual({ ok: false, reason: startInProgressReason });
    expect(db.rows("recurring_services")[0]).toMatchObject({ mollie_subscription_id: "sub_1", subscription_claim_id: null });
  });

  it("makes nothing on a second click hours later, long after Mollie forgot the key", async () => {
    const service = flexora();
    db = seed(service);
    await startCollection(db as never, service, "2026-10-09", undefined, new Date("2026-10-09T10:00:00Z"));

    const later = await startCollection(db as never, service, "2026-10-10", undefined, new Date("2026-10-10T16:00:00Z"));

    expect(later).toEqual({ ok: false, reason: alreadyCollectingReason });
    expect(createSubscription).toHaveBeenCalledTimes(1);
    expect(atMollie).toHaveLength(1);
  });

  it("refuses a service that already collects without asking Mollie anything", async () => {
    const service = flexora({ status: "active", mollie: { subscriptionId: "sub_existing" } });
    db = seed(service);

    expect(await startCollection(db as never, service, "2026-10-09")).toEqual({ ok: false, reason: alreadyCollectingReason });
    expect(listMandates).not.toHaveBeenCalled();
    expect(listSubscriptions).not.toHaveBeenCalled();
    expect(createSubscription).not.toHaveBeenCalled();
  });

  /* Mollie made it; our write of its id did not land. */
  it("releases the claim when recording fails after Mollie created the subscription", async () => {
    const service = flexora();
    db = seed(service);
    const flaky = failNextRecord(db);

    await expect(startCollection(flaky as never, service, "2026-10-09")).rejects.toThrow("connection reset");

    expect(atMollie).toHaveLength(1);
    expect(db.rows("recurring_services")[0]).toMatchObject({
      mollie_subscription_id: null,
      subscription_claim_id: null,
      subscription_claimed_at: null,
    });
  });

  it("adopts that subscription on the retry instead of creating a second one", async () => {
    const service = flexora();
    db = seed(service);
    await expect(startCollection(failNextRecord(db) as never, service, "2026-10-09")).rejects.toThrow();

    // A day later: far past Mollie's one-hour idempotency window.
    const retried = await startCollection(db as never, service, "2026-10-10", undefined, new Date("2026-10-10T09:00:00Z"));

    expect(retried).toEqual({ ok: true, firstDebitOn: "2026-11-04" });
    expect(createSubscription).toHaveBeenCalledTimes(1);
    expect(atMollie).toHaveLength(1);
    expect(db.rows("recurring_services")[0]).toMatchObject({
      status: "active",
      mollie_subscription_id: "sub_1",
      starts_on: "2026-11-04",
      subscription_claim_id: null,
    });
  });

  /* The process died between Mollie and the write: even the release never happened. */
  it("waits out a claim that is still fresh, then takes it over and adopts what Mollie has", async () => {
    const service = flexora();
    db = seed(service);
    atMollie.push({
      id: "sub_orphan",
      status: "pending",
      startDate: "2026-11-04",
      metadata: { kind: "recurring", recurringServiceId: "svc-1", customerId: "cust-1" },
    });
    Object.assign(db.rows("recurring_services")[0]!, {
      subscription_claim_id: "11111111-1111-4111-8111-111111111111",
      subscription_claimed_at: "2026-10-09T10:00:00.000Z",
    });

    const soon = await startCollection(db as never, service, "2026-10-09", undefined, new Date("2026-10-09T10:05:00Z"));
    expect(soon).toEqual({ ok: false, reason: startInProgressReason });

    const stale = new Date(Date.parse("2026-10-09T10:00:00Z") + claimStaleMs + 1000);
    const taken = await startCollection(db as never, service, "2026-10-09", undefined, stale);

    expect(taken).toEqual({ ok: true, firstDebitOn: "2026-11-04" });
    expect(createSubscription).not.toHaveBeenCalled();
    expect(db.rows("recurring_services")[0]).toMatchObject({ mollie_subscription_id: "sub_orphan", subscription_claim_id: null });
  });

  /* A cancelled subscription is history; it does not stand in for a current one. */
  it("does not adopt a cancelled subscription of the same service", async () => {
    const service = flexora();
    db = seed(service);
    atMollie.push({
      id: "sub_old",
      status: "canceled",
      startDate: "2026-06-04",
      metadata: { kind: "recurring", recurringServiceId: "svc-1", customerId: "cust-1" },
    });

    await startCollection(db as never, service, "2026-10-09");

    expect(createSubscription).toHaveBeenCalledTimes(1);
    expect(db.rows("recurring_services")[0]?.mollie_subscription_id).toBe("sub_2");
  });

  it("gives two services of the same customer a subscription each", async () => {
    const hosting = flexora();
    const seo = flexora({ id: "svc-2", name: "SEO-onderhoud", amountCents: 5000, activationInvoiceId: undefined });
    db = seed(hosting, [], [seo]);

    const first = await startCollection(db as never, hosting, "2026-10-09");
    const second = await startCollection(db as never, seo, "2026-10-09");

    expect(first.ok && second.ok).toBe(true);
    expect(createSubscription).toHaveBeenCalledTimes(2);
    expect(createSubscription.mock.calls.map(([input]) => (input as { idempotencyKey: string }).idempotencyKey)).toEqual([
      "recurring-svc-1",
      "recurring-svc-2",
    ]);
    expect(createSubscription.mock.calls[1]?.[0]).toMatchObject({ amountCents: 6050, description: "SEO-onderhoud" });
    expect(db.rows("recurring_services").map((row) => row.mollie_subscription_id)).toEqual(["sub_1", "sub_2"]);
  });
});
