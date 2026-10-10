import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatCents } from "@/lib/money";
import type { MolliePayment } from "@/lib/mollie/client";
import { createFakeDb, customerRowFixture, recurringFixture } from "@/lib/payments/fixtures";
import { nextDebitSchedule, recurringOverview } from "@/lib/payments/prenotification";
import { recurringManagement } from "@/lib/payments/recurring-management";
import { recurringLifecycle, recurringLifecycleLabel, type PriceChange, type RecurringService } from "@/lib/payments/types";

/**
 * Ending a monthly service: exactly one month's notice, a last period billed
 * pro rata, and the one subscription cancelled at Mollie after the last
 * legitimate collection -- never on the assumption that Mollie has not
 * created a payment yet, always after looking.
 *
 * Flexora's "Websitebeheer & hosting" collects on the 4th since September;
 * September and October are invoiced and paid. SEO is a second service of
 * the same customer.
 */
const getSubscription = vi.fn();
const cancelSubscription = vi.fn();
const updateSubscriptionAmount = vi.fn();
const listSubscriptionPayments = vi.fn();
const cancelPayment = vi.fn();
const listMandates = vi.fn();
const createSubscription = vi.fn();
const listSubscriptions = vi.fn();

vi.mock("@/lib/mollie/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mollie/client")>()),
  getSubscription: (...args: unknown[]) => getSubscription(...args),
  cancelSubscription: (...args: unknown[]) => cancelSubscription(...args),
  updateSubscriptionAmount: (...args: unknown[]) => updateSubscriptionAmount(...args),
  listSubscriptionPayments: (...args: unknown[]) => listSubscriptionPayments(...args),
  cancelPayment: (...args: unknown[]) => cancelPayment(...args),
  listMandates: (...args: unknown[]) => listMandates(...args),
  createSubscription: (...args: unknown[]) => createSubscription(...args),
  listSubscriptions: (...args: unknown[]) => listSubscriptions(...args),
}));

const {
  alreadyEndedReason,
  cancellationOptions,
  cancellationPlan,
  contractualLastDay,
  deviationReason,
  isProviderCancelDue,
  requestCancellation,
  runCancellations,
  settleCancellation,
  syncLastTerm,
  withdrawCancellation,
} = await import("@/lib/payments/cancellation");
const { startCollection } = await import("@/lib/payments/collection-start");
const { schedulePriceChange, listPriceChangesForService, runPriceChanges } = await import("@/lib/payments/price-change");
const { recurringInvoiceLine } = await import("@/lib/payments/recurring-invoice");
const { runPrenotifications } = await import("@/lib/payments/prenotification-runner");
const { buildCancellationMail } = await import("@/lib/payments/service-change-email");

const flexora = (overrides: Partial<RecurringService> = {}): RecurringService =>
  recurringFixture({
    id: "svc-1",
    name: "Websitebeheer & hosting",
    amountCents: 1000,
    vatRate: 21,
    startsOn: "2026-09-04",
    status: "active",
    mollie: { subscriptionId: "sub_1" },
    ...overrides,
  });

const seo = (): RecurringService =>
  recurringFixture({ id: "svc-2", name: "SEO", amountCents: 5000, startsOn: "2026-09-04", status: "active", mollie: { subscriptionId: "sub_2" } });

const serviceRow = (service: RecurringService) => ({
  id: service.id,
  customer_id: service.customerId,
  name: service.name,
  amount_cents: service.amountCents,
  vat_rate: service.vatRate,
  status: service.status,
  starts_on: service.startsOn ?? null,
  ends_on: service.endsOn ?? null,
  cancellation_requested_at: service.cancellationRequestedAt ?? null,
  cancellation_requested_by: null,
  last_term_amount_cents: service.lastTerm?.amountCents ?? null,
  last_term_synced_at: service.lastTerm?.syncedAt ?? null,
  lifecycle_problem: null,
  mollie_subscription_id: service.mollie.subscriptionId ?? null,
  subscription_canceled_at: service.mollie.subscriptionCanceledAt ?? null,
  subscription_claim_id: null,
  subscription_claimed_at: null,
});

const provider = { id: "cpp-1", customer_id: "cust-1", provider: "mollie", provider_customer_id: "cst_flexora", provider_mandate_id: "mdt_1" };

function seed(service = flexora(), billedPeriodStarts = ["2026-09-04", "2026-10-04"], others: RecurringService[] = [seo()]) {
  return createFakeDb({
    customers: [customerRowFixture()],
    customer_payment_providers: [{ ...provider }],
    recurring_services: [serviceRow(service), ...others.map(serviceRow)],
    invoices: billedPeriodStarts.map((start) => ({
      id: `inv-${start}`,
      customer_id: "cust-1",
      recurring_service_id: service.id,
      billing_period_start: start,
      status: "paid",
    })),
  });
}

/** A direct debit Mollie created for a collection date. */
const debit = (id: string, dueDate: string, overrides: Partial<MolliePayment> = {}): MolliePayment => ({
  id,
  status: "pending",
  amount: { currency: "EUR", value: "12.10" },
  description: "Websitebeheer & hosting",
  method: "directdebit",
  subscriptionId: "sub_1",
  isCancelable: true,
  details: { dueDate },
  ...overrides,
});

let db: ReturnType<typeof seed>;
let atMollie: Record<string, { status: string; amount: { currency: "EUR"; value: string }; canceledAt?: string }>;
/** The payments Mollie has created for sub_1, by id. */
let created: Map<string, MolliePayment>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MOLLIE_API_KEY = "test_dummy";
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  db = seed();
  atMollie = {
    sub_1: { status: "active", amount: { currency: "EUR", value: "12.10" } },
    sub_2: { status: "active", amount: { currency: "EUR", value: "60.50" } },
  };
  created = new Map();
  getSubscription.mockImplementation(async (_customer: string, id: string) => ({ id, ...atMollie[id]!, startDate: "2026-09-04" }));
  cancelSubscription.mockImplementation(async (_customer: string, id: string) => {
    atMollie[id] = { ...atMollie[id]!, status: "canceled", canceledAt: "2026-11-05T07:00:00.000Z" };
    return { id, ...atMollie[id]! };
  });
  updateSubscriptionAmount.mockImplementation(async (input: { subscriptionId: string; amountCents: number }) => {
    const value = `${Math.floor(input.amountCents / 100)}.${String(input.amountCents % 100).padStart(2, "0")}`;
    atMollie[input.subscriptionId] = { ...atMollie[input.subscriptionId]!, amount: { currency: "EUR", value } };
    return { id: input.subscriptionId, ...atMollie[input.subscriptionId]! };
  });
  listSubscriptionPayments.mockImplementation(async (_customer: string, id: string) => (id === "sub_1" ? [...created.values()] : []));
  cancelPayment.mockImplementation(async (id: string) => {
    const payment = created.get(id)!;
    const canceled = { ...payment, status: "canceled" as const, canceledAt: "2026-11-05T07:00:00.000Z" };
    created.set(id, canceled);
    return canceled;
  });
  listMandates.mockResolvedValue([{ id: "mdt_1", status: "valid", method: "directdebit" }]);
  listSubscriptions.mockResolvedValue([]);
});

const service = () => db.rows("recurring_services").find((row) => row.id === "svc-1")!;
const cancel = (todayKey = "2026-10-10", request = {}) => requestCancellation(db as never, "svc-1", request, todayKey, "admin-1");
const base = { startsOn: "2026-09-04", amountCents: 1000, vatRate: 21, priceChanges: [] as PriceChange[], billedPeriodStarts: ["2026-09-04", "2026-10-04"] };

describe("the last day the terms give", () => {
  /* Regression 10: exactly one month, never a day of extension. */
  it("is one month after the request, less one day, whatever the billing calendar says", () => {
    expect(contractualLastDay("2026-10-10")).toBe("2026-11-09");
    expect(contractualLastDay("2026-10-03")).toBe("2026-11-02");
    expect(contractualLastDay("2026-10-04")).toBe("2026-11-03");
    expect(contractualLastDay("2026-10-25")).toBe("2026-11-24");
    expect(contractualLastDay("2026-01-31")).toBe("2026-02-27");
  });

  /* Regression 9: the four examples, around the period boundary (anchor day 4). */
  it("ends 10 October's request on 9 November, with six days of November billed pro rata", () => {
    const plan = cancellationPlan({ ...base, todayKey: "2026-10-10" });
    expect(plan).toMatchObject({
      noticeEndsOn: "2026-11-10",
      contractualEndsOn: "2026-11-09",
      endsOn: "2026-11-09",
      deviates: false,
      lastTerm: { period: { start: "2026-11-04", end: "2026-12-03" }, daysUsed: 6, periodDays: 30, partial: true },
      lastDebitOn: "2026-11-04",
      lastTermNetCents: 200,
      lastTermGrossCents: 242,
      lastTermBilled: false,
      collectionsAhead: ["2026-11-04"],
      firstForbiddenDebitOn: "2026-12-04",
      providerCancelFrom: "2026-11-05",
    });
    expect("creditDue" in plan).toBe(false);
  });

  it("ends 3 October's request on 2 November: the October term, already collected, is one day too long and credited", () => {
    const plan = cancellationPlan({ ...base, todayKey: "2026-10-03" });
    expect(plan).toMatchObject({
      endsOn: "2026-11-02",
      lastTerm: { period: { start: "2026-10-04", end: "2026-11-03" }, daysUsed: 30, periodDays: 31, partial: true },
      lastDebitOn: "2026-10-04",
      lastTermBilled: true,
      creditDue: { days: 1, netCents: 32, grossCents: 39 },
      collectionsAhead: ["2026-10-04"],
      providerCancelFrom: "2026-10-05",
    });
  });

  it("ends 4 October's request on 3 November, exactly a period end, nothing pro rata", () => {
    const plan = cancellationPlan({ ...base, todayKey: "2026-10-04" });
    expect(plan).toMatchObject({
      endsOn: "2026-11-03",
      lastTerm: { period: { start: "2026-10-04", end: "2026-11-03" }, partial: false },
      lastDebitOn: "2026-10-04",
      lastTermNetCents: 1000,
      collectionsAhead: ["2026-10-04"],
      providerCancelFrom: "2026-10-05",
    });
    expect("creditDue" in plan).toBe(false);
  });

  it("ends 25 October's request on 24 November: November was announced in full, nine days are credited", () => {
    const plan = cancellationPlan({ ...base, billedPeriodStarts: [...base.billedPeriodStarts, "2026-11-04"], todayKey: "2026-10-25" });
    expect(plan).toMatchObject({
      endsOn: "2026-11-24",
      lastTerm: { period: { start: "2026-11-04", end: "2026-12-03" }, daysUsed: 21, periodDays: 30, partial: true },
      lastTermBilled: true,
      lastTermNetCents: 700,
      creditDue: { days: 9, netCents: 300, grossCents: 363 },
      collectionsAhead: ["2026-11-04"],
      providerCancelFrom: "2026-11-05",
    });
  });

  it("never adds up to a month: the last day is one month out for every request day", () => {
    for (const today of ["2026-10-01", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-15", "2026-10-31"]) {
      const plan = cancellationPlan({ ...base, todayKey: today });
      if ("error" in plan) throw new Error(plan.error);
      expect(plan.endsOn).toBe(contractualLastDay(today));
      expect(plan.deviates).toBe(false);
    }
  });

  it("offers the contractual day first, then period ends after it, each marked as a deviation", () => {
    const options = cancellationOptions({ ...base, todayKey: "2026-10-10" });
    expect(options.map((plan) => [plan.endsOn, plan.deviates])).toEqual([
      ["2026-11-09", false],
      ["2026-12-03", true],
      ["2027-01-03", true],
    ]);
  });

  it("accepts an agreed earlier or later day, never one in the past", () => {
    expect(cancellationPlan({ ...base, todayKey: "2026-10-10", requestedEndsOn: "2026-10-20" })).toMatchObject({ endsOn: "2026-10-20", deviates: true, belowNotice: true });
    expect(cancellationPlan({ ...base, todayKey: "2026-10-10", requestedEndsOn: "2026-10-09" })).toMatchObject({ error: expect.any(String) });
    expect(cancellationPlan({ ...base, todayKey: "2026-10-10", requestedEndsOn: "2027-02-03" })).toMatchObject({ endsOn: "2027-02-03", deviates: true, belowNotice: false });
  });

  it("cancels at Mollie the day after the last legitimate collection", () => {
    expect(isProviderCancelDue({ startsOn: "2026-09-04", endsOn: "2026-11-09" }, "2026-11-04")).toBe(false);
    expect(isProviderCancelDue({ startsOn: "2026-09-04", endsOn: "2026-11-09" }, "2026-11-05")).toBe(true);
  });
});

describe("planning the end of a service", () => {
  it("records the request and the contractual last day, and settles the pro-rata last term with Mollie at once", async () => {
    const result = await cancel();

    expect(result).toMatchObject({ ok: true, reused: false, providerCanceledNow: false, lastTermSynced: true, plan: { endsOn: "2026-11-09", lastDebitOn: "2026-11-04" } });
    expect(service()).toMatchObject({
      ends_on: "2026-11-09",
      cancellation_requested_by: "admin-1",
      status: "active",
      last_term_amount_cents: 200,
      last_term_synced_at: expect.any(String),
      subscription_canceled_at: null,
    });
    // Mollie was asked what it created, then given the pro-rata gross for the one collection left.
    expect(listSubscriptionPayments).toHaveBeenCalledWith("cst_flexora", "sub_1", expect.anything());
    expect(updateSubscriptionAmount).toHaveBeenCalledWith(expect.objectContaining({ subscriptionId: "sub_1", amountCents: 242 }));
    expect(cancelSubscription).not.toHaveBeenCalled();
  });

  it("requires an agreed deviation for any day other than the contractual one", async () => {
    expect(await cancel("2026-10-10", { endsOn: "2026-12-03" })).toEqual({ ok: false, reason: deviationReason });
    expect(await cancel("2026-10-10", { endsOn: "2026-10-20" })).toEqual({ ok: false, reason: deviationReason });
    expect(service().ends_on).toBeNull();

    const agreed = await cancel("2026-10-10", { endsOn: "2026-12-03", agreedDeviation: true });
    expect(agreed).toMatchObject({ ok: true, plan: { endsOn: "2026-12-03", deviates: true, lastTerm: { partial: false } } });
    // A whole last period: nothing to settle at Mollie.
    expect(updateSubscriptionAmount).not.toHaveBeenCalled();
  });

  it("touches neither the customer's other service nor the mandate", async () => {
    const seoBefore = { ...db.rows("recurring_services").find((row) => row.id === "svc-2")! };
    const providerBefore = { ...db.rows("customer_payment_providers")[0]! };

    await cancel();
    await runCancellations(db as never, "2026-11-05");
    await runCancellations(db as never, "2026-11-10");

    expect(db.rows("recurring_services").find((row) => row.id === "svc-2")).toEqual(seoBefore);
    expect(db.rows("customer_payment_providers")[0]).toEqual(providerBefore);
    expect(cancelSubscription).toHaveBeenCalledTimes(1);
    expect(cancelSubscription).toHaveBeenCalledWith("cst_flexora", "sub_1", expect.anything());
    for (const call of updateSubscriptionAmount.mock.calls) expect(call[0]).toMatchObject({ subscriptionId: "sub_1" });
    expect(atMollie.sub_2!.status).toBe("active");
    expect(listMandates).not.toHaveBeenCalled();
  });

  it("is idempotent: a second request returns the plan that exists", async () => {
    await cancel();
    const requestedAt = service().cancellation_requested_at;
    const second = await cancel("2026-10-12", { endsOn: "2027-01-03", agreedDeviation: true });

    expect(second).toMatchObject({ ok: true, reused: true, plan: { endsOn: "2026-11-09" } });
    expect(service()).toMatchObject({ ends_on: "2026-11-09", cancellation_requested_at: requestedAt });
    expect(updateSubscriptionAmount).toHaveBeenCalledTimes(1);
  });

  it("plans once when two requests arrive at the same moment", async () => {
    const [a, b] = await Promise.all([cancel(), cancel()]);
    expect([a, b].filter((result) => result.ok && !result.reused)).toHaveLength(1);
    expect(service().ends_on).toBe("2026-11-09");
  });

  it("refuses a service that has ended, and one that does not collect", async () => {
    db = seed(flexora({ status: "canceled" }));
    expect(await cancel()).toEqual({ ok: false, reason: alreadyEndedReason });
    db = seed(flexora({ endsOn: "2026-10-03", cancellationRequestedAt: "2026-09-01T00:00:00.000Z" }));
    expect(await cancel()).toEqual({ ok: false, reason: alreadyEndedReason });
    db = seed(flexora({ status: "draft", mollie: {} }));
    expect(await cancel()).toMatchObject({ ok: false });
  });

  it("lapses a price change that would start after the last day, or in the partial last period", async () => {
    // December change, end on 24 November: after the end.
    db = seed(flexora(), ["2026-09-04", "2026-10-04", "2026-11-04"]);
    expect(await schedulePriceChange(db as never, "svc-1", { newAmountCents: 1500, effectiveFrom: "2026-12-04" }, "2026-10-25")).toMatchObject({ ok: true });
    expect(await cancel("2026-10-25")).toMatchObject({ ok: true, plan: { endsOn: "2026-11-24" }, lapsedPriceChanges: 1 });
    expect(await listPriceChangesForService(db as never, "svc-1")).toMatchObject([{ canceledReason: "service_ended" }]);

    // November change, end on 9 November: inside the partial last period, Mollie not told yet.
    db = seed(flexora(), ["2026-09-04", "2026-10-04"]);
    expect(await schedulePriceChange(db as never, "svc-1", { newAmountCents: 1500, effectiveFrom: "2026-11-04" }, "2026-10-10")).toMatchObject({ ok: true });
    const result = await cancel("2026-10-10");
    expect(result).toMatchObject({ ok: true, lapsedPriceChanges: 1 });
    // The last term is pro rata of the price in effect before the change.
    expect(service().last_term_amount_cents).toBe(200);
    expect(updateSubscriptionAmount).toHaveBeenLastCalledWith(expect.objectContaining({ amountCents: 242 }));
  });
});

describe("the pro-rata last term and Mollie", () => {
  it("patches the subscription to the pro-rata gross when Mollie has not created that payment", async () => {
    await cancel();
    expect(await syncLastTerm(db as never, "svc-1")).toMatchObject({ synced: true, amountCents: 200 });
    expect(atMollie.sub_1!.amount.value).toBe("2.42");

    // The invoice the daily pass will make: six days, at the settled amount.
    const ending = flexora({ endsOn: "2026-11-09", cancellationRequestedAt: "2026-10-10T10:00:00.000Z", lastTerm: { amountCents: 200, syncedAt: "2026-10-10T10:00:01.000Z" } });
    expect(recurringInvoiceLine(ending, [], { start: "2026-11-04", end: "2026-12-03" })).toMatchObject({
      unitPriceCents: 200,
      description: expect.stringContaining("2026-11-04 t/m 2026-11-09 (6 van 30 dagen)"),
    });
    expect(recurringOverview({ service: ending, billedPeriodStarts: ["2026-09-04", "2026-10-04"] }, [], "2026-10-21")).toMatchObject({ debitOn: "2026-11-04", amountCents: 242 });
  });

  /* Regression 8: Mollie already created the last period's payment -- the invoice follows what Mollie collects. */
  it("collects as created when Mollie already made the last period's payment, and shows the credit", async () => {
    created.set("tr_nov", debit("tr_nov", "2026-11-04"));

    const result = await cancel();
    expect(result).toMatchObject({ ok: true, lastTermSynced: true });
    expect(service()).toMatchObject({ last_term_amount_cents: 1000, last_term_synced_at: expect.any(String) });
    expect(updateSubscriptionAmount).not.toHaveBeenCalled();

    // Invoice, announcement and Mollie say 12,10; the days not delivered are credited by hand.
    const ending = flexora({ endsOn: "2026-11-09", cancellationRequestedAt: "2026-10-10T10:00:00.000Z", lastTerm: { amountCents: 1000, syncedAt: "2026-10-10T10:00:01.000Z" } });
    expect(recurringInvoiceLine(ending, [], { start: "2026-11-04", end: "2026-12-03" })).toMatchObject({ unitPriceCents: 1000 });
    expect(recurringOverview({ service: ending, billedPeriodStarts: ["2026-09-04", "2026-10-04"] }, [], "2026-10-21")).toMatchObject({ debitOn: "2026-11-04", amountCents: 1210 });
    const view = recurringManagement({
      service: ending,
      priceChanges: [],
      billedPeriodStarts: ["2026-09-04", "2026-10-04"],
      overview: recurringOverview({ service: ending, billedPeriodStarts: ["2026-09-04", "2026-10-04"] }, [], "2026-10-10"),
      todayKey: "2026-10-10",
    });
    expect(view.ending).toMatchObject({ lastTermGrossCents: 1210, creditDue: { days: 24, netCents: 800, grossCents: 968 } });
  });

  it("collects as announced when the last period was invoiced before the cancellation", async () => {
    db = seed(flexora(), ["2026-09-04", "2026-10-04", "2026-11-04"]);
    const result = await cancel("2026-10-25");
    expect(result).toMatchObject({ ok: true, plan: { endsOn: "2026-11-24", lastTermBilled: true, creditDue: { days: 9, grossCents: 363 } } });
    expect(service().last_term_amount_cents).toBe(1000);
    expect(updateSubscriptionAmount).not.toHaveBeenCalled();
  });

  it("is settled by the daily job when Mollie was unreachable at the request", async () => {
    listSubscriptionPayments.mockRejectedValueOnce(new Error("Mollie 503"));
    const result = await cancel();
    expect(result).toMatchObject({ ok: true, lastTermSynced: false });
    expect(service().last_term_synced_at).toBeNull();

    const run = await runCancellations(db as never, "2026-10-11");
    expect(run).toMatchObject({ lastTermsSynced: 1, problems: [] });
    expect(service()).toMatchObject({ last_term_amount_cents: 200 });
    expect(atMollie.sub_1!.amount.value).toBe("2.42");
  });
});

describe("what still happens before the end, and what does not", () => {
  it("still announces the last period, and nothing after the last day", async () => {
    await cancel();
    const ending = flexora({ endsOn: "2026-11-09", cancellationRequestedAt: "2026-10-10T10:00:00.000Z" });

    expect(nextDebitSchedule({ service: ending, billedPeriodStarts: ["2026-09-04", "2026-10-04"] })).toMatchObject({ debitOn: "2026-11-04", announceFrom: "2026-10-21" });
    expect(nextDebitSchedule({ service: ending, billedPeriodStarts: ["2026-09-04", "2026-10-04", "2026-11-04"] })).toEqual({ reason: "ended" });
  });

  /* Regression 3: no forbidden payment yet -- the subscription alone is cancelled, the day after the last collection. */
  it("cancels the subscription the day after the last legitimate collection when Mollie created nothing beyond it", async () => {
    await cancel();
    created.set("tr_nov", debit("tr_nov", "2026-11-04", { amount: { currency: "EUR", value: "2.42" } }));

    const early = await runCancellations(db as never, "2026-11-04");
    expect(early).toMatchObject({ providerCanceled: 0, paymentsCanceled: 0, problems: [] });
    expect(cancelSubscription).not.toHaveBeenCalled();

    const due = await runCancellations(db as never, "2026-11-05");
    expect(due).toMatchObject({ providerCanceled: 1, paymentsCanceled: 0, problems: [] });
    expect(cancelPayment).not.toHaveBeenCalled();
    expect(cancelSubscription).toHaveBeenCalledWith("cst_flexora", "sub_1", expect.anything());
    expect(service()).toMatchObject({ subscription_canceled_at: "2026-11-05T07:00:00.000Z", status: "active", lifecycle_problem: null });
  });

  /* Regressions 4 and 5: Mollie already created a payment past the end, and lets us cancel it. */
  it("cancels a payment Mollie created past the last day when Mollie marks it cancelable", async () => {
    await cancel();
    created.set("tr_nov", debit("tr_nov", "2026-11-04", { amount: { currency: "EUR", value: "2.42" } }));
    created.set("tr_dec", debit("tr_dec", "2026-12-04", { isCancelable: true }));

    const run = await runCancellations(db as never, "2026-11-05");
    expect(run).toMatchObject({ providerCanceled: 1, paymentsCanceled: 1, problems: [] });
    expect(cancelPayment).toHaveBeenCalledWith("tr_dec", expect.anything());
    expect(created.get("tr_dec")!.status).toBe("canceled");
    expect(cancelSubscription).toHaveBeenCalledTimes(1);
    expect(service().lifecycle_problem).toBeNull();
  });

  /* Regression 6: the forbidden payment is not cancelable -- never silently collected, visible to the admin. */
  it("leaves a payment Mollie will not let us cancel as a visible problem, and still stops the subscription", async () => {
    await cancel();
    created.set("tr_dec", debit("tr_dec", "2026-12-04", { isCancelable: false }));

    const run = await runCancellations(db as never, "2026-11-05");
    expect(run).toMatchObject({ providerCanceled: 1, paymentsCanceled: 0 });
    expect(run.problems).toMatchObject([{ serviceId: "svc-1", reason: expect.stringContaining("tr_dec") }]);
    expect(cancelPayment).not.toHaveBeenCalled();
    expect(cancelSubscription).toHaveBeenCalledTimes(1);
    expect(service().lifecycle_problem).toContain("niet meer annuleren");

    const view = recurringManagement({
      service: flexora({
        endsOn: "2026-11-09",
        cancellationRequestedAt: "2026-10-10T10:00:00.000Z",
        lifecycleProblem: service().lifecycle_problem as string,
        mollie: { subscriptionId: "sub_1", subscriptionCanceledAt: "2026-11-05T07:00:00.000Z" },
      }),
      priceChanges: [],
      billedPeriodStarts: ["2026-09-04", "2026-10-04", "2026-11-04"],
      overview: { state: "not_needed", reason: "ended" },
      todayKey: "2026-11-06",
    });
    expect(view.warning).toContain("tr_dec");
  });

  it("treats a 422 from Mollie on cancelling a payment as a problem, not a retry loop", async () => {
    await cancel();
    created.set("tr_dec", debit("tr_dec", "2026-12-04", { isCancelable: true }));
    cancelPayment.mockRejectedValueOnce(new Error("Mollie 422: The payment can no longer be canceled"));

    const run = await runCancellations(db as never, "2026-11-05");
    expect(run.problems).toMatchObject([{ reason: expect.stringContaining("Mollie 422") }]);
    expect(service().subscription_canceled_at).toBe("2026-11-05T07:00:00.000Z");
  });

  /* Regression 7: the job may run as often as it likes. */
  it("is safe to run twice on the same day and every day after", async () => {
    await cancel();
    await runCancellations(db as never, "2026-11-05");
    const again = await runCancellations(db as never, "2026-11-05");
    expect(again).toMatchObject({ providerCanceled: 0, ended: 0, problems: [] });
    expect(cancelSubscription).toHaveBeenCalledTimes(1);

    const after = await runCancellations(db as never, "2026-11-10");
    expect(after).toMatchObject({ providerCanceled: 0, ended: 1 });
    expect(service().status).toBe("canceled");

    const done = await runCancellations(db as never, "2026-11-11");
    expect(done).toMatchObject({ considered: 0 });
  });

  it("records a subscription Mollie already reports as cancelled instead of cancelling again", async () => {
    await cancel();
    atMollie.sub_1 = { ...atMollie.sub_1!, status: "canceled", canceledAt: "2026-11-01T12:00:00.000Z" };

    const run = await runCancellations(db as never, "2026-11-05");
    expect(run).toMatchObject({ providerCanceled: 1, problems: [] });
    expect(cancelSubscription).not.toHaveBeenCalled();
    expect(service().subscription_canceled_at).toBe("2026-11-01T12:00:00.000Z");
  });

  it("cancels right away when no legitimate collection is left", async () => {
    const result = await cancel("2026-10-10", { endsOn: "2026-10-20", agreedDeviation: true });
    expect(result).toMatchObject({ ok: true, providerCanceledNow: true, plan: { collectionsAhead: [], providerCancelFrom: "2026-10-10", creditDue: { days: 14 } } });
    expect(cancelSubscription).toHaveBeenCalledTimes(1);
  });

  it("waits, and says so, while the last legitimate collection is still ahead", async () => {
    await cancel();
    expect(await settleCancellation(db as never, "svc-1", "2026-11-04")).toMatchObject({ providerCanceled: false, ended: false, waiting: "not_due" });
    await runCancellations(db as never, "2026-11-05");
    expect(await settleCancellation(db as never, "svc-1", "2026-11-06")).toMatchObject({ providerCanceled: false, waiting: "already" });
  });

  it("keeps a failed Mollie call for the next day, and the status until the end has passed", async () => {
    await cancel();
    cancelSubscription.mockRejectedValueOnce(new Error("Mollie 503: try later"));

    const failed = await runCancellations(db as never, "2026-11-05");
    expect(failed.problems).toMatchObject([{ serviceId: "svc-1", reason: expect.stringContaining("Mollie 503") }]);
    expect(service().subscription_canceled_at).toBeNull();

    const past = await runCancellations(db as never, "2026-11-10");
    expect(past).toMatchObject({ providerCanceled: 1, ended: 1 });
  });

  it("shows ended with Mollie still live as something to look at", () => {
    const stuck = flexora({ endsOn: "2026-11-09", cancellationRequestedAt: "2026-10-10T10:00:00.000Z" });
    const view = recurringManagement({
      service: stuck,
      priceChanges: [],
      billedPeriodStarts: ["2026-09-04", "2026-10-04", "2026-11-04"],
      overview: recurringOverview({ service: stuck, billedPeriodStarts: [] }, [], "2026-11-12"),
      todayKey: "2026-11-12",
    });
    expect(view.lifecycle).toBe("ended");
    expect(view.warning).toContain("Mollie");
    expect(view.canCancel).toBe(false);
  });
});

describe("taking a cancellation back", () => {
  it("restores the full amount at Mollie and clears the end while the last payment does not exist yet", async () => {
    await cancel();
    expect(atMollie.sub_1!.amount.value).toBe("2.42");
    expect(await withdrawCancellation(db as never, "svc-1", "2026-10-20")).toEqual({ ok: true });
    expect(atMollie.sub_1!.amount.value).toBe("12.10");
    expect(service()).toMatchObject({ ends_on: null, cancellation_requested_at: null, last_term_amount_cents: null, last_term_synced_at: null, status: "active" });
    expect(recurringLifecycle(flexora(), "2026-10-20")).toBe("active");
  });

  it("is refused once Mollie created the last payment at the pro-rata amount, or cancelled the subscription", async () => {
    await cancel();
    created.set("tr_nov", debit("tr_nov", "2026-11-04", { amount: { currency: "EUR", value: "2.42" } }));
    const held = await withdrawCancellation(db as never, "svc-1", "2026-11-02");
    expect(held).toMatchObject({ ok: false, reason: expect.stringContaining("pro-rata") });
    expect(service().ends_on).toBe("2026-11-09");

    await runCancellations(db as never, "2026-11-05");
    const gone = await withdrawCancellation(db as never, "svc-1", "2026-11-06");
    expect((gone as { reason: string }).reason).toContain("Mollie");
  });
});

describe("after the end", () => {
  it("cannot be started again without a new service", async () => {
    await cancel();
    await runCancellations(db as never, "2026-11-05");
    await runCancellations(db as never, "2026-11-10");
    expect(service().status).toBe("canceled");

    expect(await startCollection(db as never, { id: "svc-1" }, "2026-11-12")).toMatchObject({ ok: false });
    expect(createSubscription).not.toHaveBeenCalled();
    expect(await cancel("2026-11-12")).toEqual({ ok: false, reason: alreadyEndedReason });
    expect(await runPriceChanges(db as never, "2026-11-12")).toMatchObject({ problems: [] });
  });

  it("reads as the three states the admin sees", () => {
    const day = (key: string) => key;
    expect(recurringLifecycleLabel(flexora(), "2026-10-10", day)).toBe("Actief");
    const planned = flexora({ endsOn: "2026-11-09", cancellationRequestedAt: "2026-10-10T10:00:00.000Z" });
    expect(recurringLifecycleLabel(planned, "2026-11-09", day)).toBe("Opgezegd — eindigt op 2026-11-09");
    expect(recurringLifecycleLabel(planned, "2026-11-10", day)).toBe("Beëindigd op 2026-11-09");
  });
});

describe("the confirmation mail", () => {
  it("names the last day, the pro-rata last term and what is still collected", () => {
    const plan = cancellationPlan({ ...base, todayKey: "2026-10-10" });
    if ("error" in plan) throw new Error(plan.error);

    const mail = buildCancellationMail({
      contactName: "A. Alfa",
      serviceName: "Websitebeheer & hosting",
      monthlyGrossCents: 1210,
      requestedOn: plan.requestedOn,
      endsOn: plan.endsOn,
      lastTerm: { start: "2026-11-04", end: plan.endsOn, partial: true, daysUsed: 6, periodDays: 30, grossCents: plan.lastTermGrossCents },
      collectionsAhead: plan.collectionsAhead,
    });

    expect(mail.text).toContain("tot en met 9 nov 2026");
    expect(mail.text).toContain("Opgezegd op: 10 okt 2026");
    expect(mail.text).toContain(`Laatste termijn: 4 nov 2026 t/m 9 nov 2026 (6 van 30 dagen), ${formatCents(242)}`);
    expect(mail.text).toContain(`Nog te incasseren: 4 nov 2026 (${formatCents(242)})`);
    expect(mail.text).toContain("naar rato van de geleverde dagen");
    expect(mail.text).not.toContain("gecrediteerd");
  });

  it("explains a term announced in full and the credit that follows", () => {
    const mail = buildCancellationMail({
      contactName: "A. Alfa",
      serviceName: "Websitebeheer & hosting",
      monthlyGrossCents: 1210,
      requestedOn: "2026-10-25",
      endsOn: "2026-11-24",
      lastTerm: { start: "2026-11-04", end: "2026-11-24", partial: true, daysUsed: 21, periodDays: 30, grossCents: 1210 },
      creditDue: { days: 9, grossCents: 363 },
      collectionsAhead: ["2026-11-04"],
    });
    expect(mail.text).toContain(`Wordt gecrediteerd: ${formatCents(363)} voor de 9 dagen na 24 nov 2026`);
    expect(mail.text).toContain("zoals aangekondigd geïncasseerd");
    expect(mail.text).toContain(`Nog te incasseren: 4 nov 2026 (${formatCents(1210)})`);
  });
});

describe("a payment whose period cannot be known", () => {
  const nameless = () => debit("tr_nameless", "", { details: {}, createdAt: "2026-10-09T06:00:00+00:00" });

  /* Regressions 2 and 3: no due date -- the last term is not settled and nothing is patched. */
  it("holds the last term's settlement and shows the problem, without patching Mollie", async () => {
    created.set("tr_nameless", nameless());

    const result = await cancel();
    expect(result).toMatchObject({ ok: true, lastTermSynced: false });
    expect(updateSubscriptionAmount).not.toHaveBeenCalled();
    expect(service()).toMatchObject({ last_term_synced_at: null, lifecycle_problem: expect.stringContaining("tr_nameless") });
    expect(service().lifecycle_problem).toContain("aangemaakt 2026-10-09");

    const run = await runCancellations(db as never, "2026-10-11");
    expect(run.problems).toMatchObject([{ serviceId: "svc-1", reason: expect.stringContaining("zonder incassodatum") }]);
    expect(updateSubscriptionAmount).not.toHaveBeenCalled();
  });

  /* Regression 4: the invoice for the last period is not made at an amount Mollie may not collect. */
  it("keeps the announcement pass from invoicing the last period until it is settled", async () => {
    created.set("tr_nameless", nameless());
    await cancel();
    const row = service();
    const ending = flexora({ endsOn: "2026-11-09", cancellationRequestedAt: row.cancellation_requested_at as string, lifecycleProblem: row.lifecycle_problem as string });

    const invoices: string[] = [];
    const summary = await runPrenotifications(
      {
        listSchedules: async () => [{ service: ending, billedPeriodStarts: ["2026-09-04", "2026-10-04"], priceChanges: [] }],
        ensureInvoice: async (_service, period) => {
          invoices.push(period.start);
          throw new Error("must not be reached");
        },
        listUnsentInvoices: async () => [],
        recipient: async () => ({ ok: false, reason: "n/a" }),
        claim: async () => ({ claimed: true, id: "x" }),
        markSent: async () => undefined,
        markFailed: async () => undefined,
      },
      async () => new Uint8Array(),
      async () => ({ sent: false, reason: "n/a" }),
      "2026-10-21",
    );
    expect(invoices).toEqual([]);
    expect(summary.problems).toMatchObject([{ serviceId: "svc-1", reason: expect.stringContaining("nog niet met Mollie afgestemd") }]);
  });

  it("does not cancel the subscription while such a payment exists, and does once it is final", async () => {
    await cancel();
    created.set("tr_nov", debit("tr_nov", "2026-11-04", { amount: { currency: "EUR", value: "2.42" } }));
    created.set("tr_nameless", nameless());

    const held = await runCancellations(db as never, "2026-11-05");
    expect(held).toMatchObject({ providerCanceled: 0, paymentsCanceled: 0 });
    expect(held.problems).toMatchObject([{ reason: expect.stringContaining("tr_nameless") }]);
    expect(cancelSubscription).not.toHaveBeenCalled();
    expect(cancelPayment).not.toHaveBeenCalled();
    expect(service()).toMatchObject({ subscription_canceled_at: null, lifecycle_problem: expect.stringContaining("tr_nameless") });

    created.set("tr_nameless", { ...nameless(), status: "failed" });
    const resolved = await runCancellations(db as never, "2026-11-06");
    expect(resolved).toMatchObject({ providerCanceled: 1, problems: [] });
    expect(service()).toMatchObject({ subscription_canceled_at: expect.any(String), lifecycle_problem: null });
  });

  it("refuses to withdraw the cancellation while such a payment exists", async () => {
    await cancel();
    created.set("tr_nameless", nameless());
    const result = await withdrawCancellation(db as never, "svc-1", "2026-10-20");
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining("tr_nameless") });
    expect(service().ends_on).toBe("2026-11-09");
  });

  it("settles the last term once the nameless payment is final", async () => {
    created.set("tr_nameless", nameless());
    await cancel();
    created.set("tr_nameless", { ...nameless(), status: "canceled" });

    const run = await runCancellations(db as never, "2026-10-11");
    expect(run).toMatchObject({ lastTermsSynced: 1, problems: [] });
    expect(service()).toMatchObject({ last_term_amount_cents: 200, lifecycle_problem: null });
  });
});

describe("a credit owed to the customer", () => {
  const announced = () =>
    flexora({ endsOn: "2026-11-24", cancellationRequestedAt: "2026-10-25T10:00:00.000Z", lastTerm: { amountCents: 1000, syncedAt: "2026-10-25T10:00:01.000Z" } });
  const view = (service: RecurringService) =>
    recurringManagement({
      service,
      priceChanges: [],
      billedPeriodStarts: ["2026-09-04", "2026-10-04", "2026-11-04"],
      overview: { state: "not_needed", reason: "ended" },
      todayKey: "2026-10-26",
    });

  it("stays in view as an open task until the credit note exists and is processed", () => {
    const open = view(announced());
    expect(open.ending?.creditDue).toMatchObject({ days: 9, netCents: 300, grossCents: 363 });
    expect(open.ending?.creditDue?.creditNote).toBeUndefined();
    expect(open.warning).toContain("Te crediteren");

    const note = { id: "cn-1", number: "YM-C-2026-000001", state: "refund_due" as const, remainingCents: 363 };
    const credited = recurringManagement({
      service: announced(),
      priceChanges: [],
      billedPeriodStarts: ["2026-09-04", "2026-10-04", "2026-11-04"],
      overview: { state: "not_needed", reason: "ended" },
      todayKey: "2026-10-26",
      cancellationCreditNote: note,
    });
    expect(credited.ending?.creditDue?.creditNote).toEqual(note);
    expect(credited.warning).toContain("YM-C-2026-000001");

    const processed = recurringManagement({
      service: announced(),
      priceChanges: [],
      billedPeriodStarts: ["2026-09-04", "2026-10-04", "2026-11-04"],
      overview: { state: "not_needed", reason: "ended" },
      todayKey: "2026-10-26",
      cancellationCreditNote: { ...note, state: "processed", remainingCents: 0 },
    });
    expect(processed.warning).toBeUndefined();
  });
});
