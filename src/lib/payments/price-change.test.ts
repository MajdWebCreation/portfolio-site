import { beforeEach, describe, expect, it, vi } from "vitest";
import { mollieAmount } from "@/lib/mollie/client";
import type { MolliePayment } from "@/lib/mollie/client";
import { createFakeDb, customerRowFixture, recurringFixture } from "@/lib/payments/fixtures";
import { recurringOverview } from "@/lib/payments/prenotification";
import { amountForPeriod } from "@/lib/payments/pricing";
import { recurringManagement } from "@/lib/payments/recurring-management";
import type { RecurringService } from "@/lib/payments/types";

/**
 * Changing the monthly price of a collecting service, end to end against the
 * in-memory database and a Mollie that answers what the mocks say.
 *
 * The scenario throughout: Flexora's "Websitebeheer & hosting", 10,00 excl.
 * btw, collecting since 4 September on the 4th of every month. The November
 * term was invoiced and announced on 21 October. It is 25 October, and the
 * price goes to 15,00.
 */
const getSubscription = vi.fn();
const updateSubscriptionAmount = vi.fn();
const cancelSubscription = vi.fn();
const listSubscriptionPayments = vi.fn();
const cancelPayment = vi.fn();
const listMandates = vi.fn();

vi.mock("@/lib/mollie/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mollie/client")>()),
  getSubscription: (...args: unknown[]) => getSubscription(...args),
  updateSubscriptionAmount: (...args: unknown[]) => updateSubscriptionAmount(...args),
  cancelSubscription: (...args: unknown[]) => cancelSubscription(...args),
  listSubscriptionPayments: (...args: unknown[]) => listSubscriptionPayments(...args),
  cancelPayment: (...args: unknown[]) => cancelPayment(...args),
  listMandates: (...args: unknown[]) => listMandates(...args),
}));

const { alreadyPlannedReason, listPriceChangesForService, runPriceChanges, schedulePriceChange, subscriptionOverReason, withdrawPriceChange } =
  await import("@/lib/payments/price-change");
const { requestCancellation } = await import("@/lib/payments/cancellation");
const { recurringInvoiceLine } = await import("@/lib/payments/recurring-invoice");

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
  cancellation_requested_at: null,
  last_term_amount_cents: null,
  last_term_synced_at: null,
  lifecycle_problem: null,
  mollie_subscription_id: service.mollie.subscriptionId ?? null,
  subscription_canceled_at: null,
  subscription_claim_id: null,
  subscription_claimed_at: null,
});

const provider = { id: "cpp-1", customer_id: "cust-1", provider: "mollie", provider_customer_id: "cst_flexora", provider_mandate_id: "mdt_1" };

const billed = ["2026-09-04", "2026-10-04", "2026-11-04"];

function seed(service = flexora(), billedPeriodStarts = billed, others: RecurringService[] = [seo()]) {
  return createFakeDb({
    customers: [customerRowFixture()],
    customer_payment_providers: [{ ...provider }],
    recurring_services: [serviceRow(service), ...others.map(serviceRow)],
    invoices: billedPeriodStarts.map((start) => ({
      id: `inv-${start}`,
      customer_id: "cust-1",
      recurring_service_id: service.id,
      billing_period_start: start,
      status: start < "2026-11-01" ? "paid" : "sent",
    })),
  });
}

let db: ReturnType<typeof seed>;
/** What Mollie holds for sub_1, as the mocks report and record it. */
let atMollie: { status: string; amount: { currency: "EUR"; value: string } };
/** The payments Mollie has created for sub_1. */
let created: MolliePayment[];

/** A direct debit Mollie created for a collection date, at the amount it held then. */
const debit = (id: string, dueDate: string, value = "12.10", overrides: Partial<MolliePayment> = {}): MolliePayment => ({
  id,
  status: "pending",
  amount: { currency: "EUR", value },
  description: "Websitebeheer & hosting",
  method: "directdebit",
  subscriptionId: "sub_1",
  isCancelable: true,
  details: { dueDate },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MOLLIE_API_KEY = "test_dummy";
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  db = seed();
  atMollie = { status: "active", amount: mollieAmount(1210) };
  created = [];
  listSubscriptionPayments.mockImplementation(async () => [...created]);
  getSubscription.mockImplementation(async (_customer: string, id: string) => ({ id, ...atMollie, startDate: "2026-09-04" }));
  updateSubscriptionAmount.mockImplementation(async (input: { amountCents: number }) => {
    atMollie = { ...atMollie, amount: mollieAmount(input.amountCents) };
    return { id: "sub_1", ...atMollie };
  });
});

const plan = (input = { newAmountCents: 1500, effectiveFrom: "2026-12-04" }, todayKey = "2026-10-25") =>
  schedulePriceChange(db as never, "svc-1", input, todayKey, "admin-1");

const changes = () => listPriceChangesForService(db as never, "svc-1");

describe("planning a price change", () => {
  /* Test 1. */
  it("writes one change with the old and new amount and the effective date, and touches nothing else", async () => {
    const result = await plan();

    expect(result).toMatchObject({ ok: true, reused: false, oldGrossCents: 1210, newGrossCents: 1815 });
    expect(await changes()).toMatchObject([
      { oldAmountCents: 1000, newAmountCents: 1500, effectiveFrom: "2026-12-04", requestedBy: "admin-1" },
    ]);
    // Nothing at Mollie yet, and the service row still says 10,00.
    expect(updateSubscriptionAmount).not.toHaveBeenCalled();
    expect(db.rows("recurring_services").find((row) => row.id === "svc-1")!.amount_cents).toBe(1000);
  });

  /* Test 6: too close to the next collection, or already invoiced. */
  it("refuses a period that is already invoiced or cannot be announced in time", async () => {
    const invoiced = await plan({ newAmountCents: 1500, effectiveFrom: "2026-11-04" });
    expect(invoiced).toMatchObject({ ok: false });
    expect((invoiced as { reason: string }).reason).toContain("2026-12-04");

    // Nothing billed for December yet, but on 22 November it is inside the window.
    const late = await plan({ newAmountCents: 1500, effectiveFrom: "2026-12-04" }, "2026-11-22");
    expect(late).toMatchObject({ ok: false });
    expect((late as { reason: string }).reason).toContain("2027-01-04");

    const mid = await plan({ newAmountCents: 1500, effectiveFrom: "2026-12-10" });
    expect(mid).toMatchObject({ ok: false });
    expect(await changes()).toEqual([]);
  });

  it("refuses an amount that does not change anything, and a service that does not collect", async () => {
    expect(await plan({ newAmountCents: 1000, effectiveFrom: "2026-12-04" })).toMatchObject({ ok: false });
    db = seed(flexora({ status: "draft", mollie: {} }));
    expect(await plan()).toMatchObject({ ok: false });
    expect(getSubscription).not.toHaveBeenCalled();
  });

  /* Test 14: a subscription that is over takes no new amount. */
  it("refuses when Mollie says the subscription is canceled or completed", async () => {
    for (const status of ["canceled", "completed"]) {
      atMollie = { ...atMollie, status };
      expect(await plan()).toEqual({ ok: false, reason: subscriptionOverReason });
    }
    expect(await changes()).toEqual([]);
  });

  /* Test 7: two clicks, one change. */
  it("makes one change when two identical requests arrive at the same moment", async () => {
    const [first, second] = await Promise.all([plan(), plan()]);

    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true });
    expect([first, second].filter((result) => result.ok && !result.reused)).toHaveLength(1);
    expect(await changes()).toHaveLength(1);
  });

  it("refuses a different change while one is pending, until it is withdrawn", async () => {
    await plan();
    expect(await plan({ newAmountCents: 2000, effectiveFrom: "2026-12-04" })).toEqual({ ok: false, reason: alreadyPlannedReason });

    const [pending] = await changes();
    expect(await withdrawPriceChange(db as never, pending!.id)).toEqual({ ok: true });
    expect(await changes()).toMatchObject([{ canceledReason: "withdrawn" }]);
    expect(await plan({ newAmountCents: 2000, effectiveFrom: "2026-12-04" })).toMatchObject({ ok: true });
  });

  /* Test 12: the admin sees what is planned next to what applies now. */
  it("shows on the customer page as a scheduled change beside the current price", async () => {
    await plan();
    const service = flexora();
    const history = await changes();
    const overview = recurringOverview({ service, billedPeriodStarts: billed, priceChanges: history }, [], "2026-10-25");
    const view = recurringManagement({ service, priceChanges: history, billedPeriodStarts: billed, overview, todayKey: "2026-10-25" });

    expect(view).toMatchObject({
      lifecycle: "active",
      currentNetCents: 1000,
      currentGrossCents: 1210,
      scheduled: { newNetCents: 1500, newGrossCents: 1815, effectiveFrom: "2026-12-04", announceFrom: "2026-11-20", providerUpdated: false, withdrawable: true },
      canChangePrice: false,
    });
    // November is invoiced at 12,10; the next collection is December, at the new amount.
    expect(overview).toMatchObject({ debitOn: "2026-12-04", amountCents: 1815, announceFrom: "2026-11-20" });
  });
});

describe("carrying a price change out", () => {
  /* Tests 2, 4, 5: the old price until the effective date, the new one from it, Mollie and the invoice agreeing. */
  it("updates Mollie on the announcement day with the gross of the new amount, and not a day earlier", async () => {
    await plan();

    const early = await runPriceChanges(db as never, "2026-11-19");
    expect(early).toMatchObject({ providerUpdated: 0, applied: 0, problems: [] });
    expect(updateSubscriptionAmount).not.toHaveBeenCalled();

    const due = await runPriceChanges(db as never, "2026-11-20");
    expect(due).toMatchObject({ providerUpdated: 1, applied: 0, problems: [] });
    expect(updateSubscriptionAmount).toHaveBeenCalledTimes(1);
    expect(updateSubscriptionAmount.mock.calls[0]![0]).toMatchObject({ customerId: "cst_flexora", subscriptionId: "sub_1", amountCents: 1815 });
    expect(mollieAmount(1815)).toEqual({ currency: "EUR", value: "18.15" });

    // The service row keeps the old price until December begins.
    expect(db.rows("recurring_services").find((row) => row.id === "svc-1")!.amount_cents).toBe(1000);
    expect(await changes()).toMatchObject([{ providerUpdatedAt: expect.any(String) }]);
    expect((await changes())[0]!.appliedAt).toBeUndefined();
  });

  it("invoices the first period at the new price, the same figure Mollie collects", async () => {
    await plan();
    await runPriceChanges(db as never, "2026-11-20");

    const history = await changes();
    // The line the term invoice is built from: December at 15,00, November still at 10,00.
    expect(recurringInvoiceLine(flexora(), history, { start: "2026-12-04", end: "2027-01-03" })).toMatchObject({ unitPriceCents: 1500, vatRate: 21 });
    expect(recurringInvoiceLine(flexora(), history, { start: "2026-11-04", end: "2026-12-03" })).toMatchObject({ unitPriceCents: 1000 });

    const overview = recurringOverview({ service: flexora(), billedPeriodStarts: billed, priceChanges: history }, [], "2026-11-20");
    expect(overview).toMatchObject({ debitOn: "2026-12-04", amountCents: 1815, state: "due" });
    expect(amountForPeriod(flexora(), history, "2026-11-04")).toBe(1000);
  });

  it("switches the service over on the effective date, and keeps the history readable", async () => {
    await plan();
    await runPriceChanges(db as never, "2026-11-20");

    const eve = await runPriceChanges(db as never, "2026-12-03");
    expect(eve.applied).toBe(0);

    const day = await runPriceChanges(db as never, "2026-12-04");
    expect(day).toMatchObject({ providerUpdated: 0, applied: 1, problems: [] });
    expect(db.rows("recurring_services").find((row) => row.id === "svc-1")!.amount_cents).toBe(1500);
    expect(await changes()).toMatchObject([{ oldAmountCents: 1000, newAmountCents: 1500, appliedAt: expect.any(String) }]);

    // A second run the same day changes nothing more.
    const again = await runPriceChanges(db as never, "2026-12-04");
    expect(again).toMatchObject({ providerUpdated: 0, applied: 0 });
    expect(updateSubscriptionAmount).toHaveBeenCalledTimes(1);
  });

  /* Test 8: Mollie took the new amount, our write failed, and the next day finishes the job without a second PATCH. */
  it("recovers when Mollie was updated but recording it failed", async () => {
    await plan();
    const original = db.from.bind(db);
    let failOnce = true;
    db.from = ((name: string) => {
      const builder = original(name);
      if (name === "recurring_price_changes" && failOnce) {
        const update = builder.update.bind(builder);
        builder.update = (row: Record<string, unknown>) => {
          if ("provider_updated_at" in row) {
            failOnce = false;
            throw new Error("database unavailable");
          }
          return update(row);
        };
      }
      return builder;
    }) as typeof db.from;

    const broken = await runPriceChanges(db as never, "2026-11-20");
    expect(broken.problems).toMatchObject([{ changeId: expect.any(String), reason: expect.stringContaining("database unavailable") }]);
    expect(updateSubscriptionAmount).toHaveBeenCalledTimes(1);
    expect(atMollie.amount.value).toBe("18.15");

    const retried = await runPriceChanges(db as never, "2026-11-21");
    expect(retried).toMatchObject({ providerUpdated: 1, problems: [] });
    // Mollie already held 18,15: recognised, not patched again.
    expect(updateSubscriptionAmount).toHaveBeenCalledTimes(1);
    expect(await changes()).toMatchObject([{ providerUpdatedAt: expect.any(String) }]);
  });

  /* Tests 9, 10, 11: the paid November term, the SEO service and the mandate are exactly as they were. */
  it("leaves billed periods, the customer's other service and the mandate untouched", async () => {
    const invoicesBefore = db.rows("invoices").map((row) => ({ ...row }));
    const seoBefore = { ...db.rows("recurring_services").find((row) => row.id === "svc-2")! };
    const providerBefore = { ...db.rows("customer_payment_providers")[0]! };

    await plan();
    await runPriceChanges(db as never, "2026-11-20");
    await runPriceChanges(db as never, "2026-12-04");

    expect(db.rows("invoices")).toEqual(invoicesBefore);
    expect(db.rows("recurring_services").find((row) => row.id === "svc-2")).toEqual(seoBefore);
    expect(db.rows("customer_payment_providers")[0]).toEqual(providerBefore);
    expect(amountForPeriod(flexora(), await changes(), "2026-11-04")).toBe(1000);
    for (const call of updateSubscriptionAmount.mock.calls) expect(call[0]).toMatchObject({ subscriptionId: "sub_1" });
    expect(cancelSubscription).not.toHaveBeenCalled();
    expect(listMandates).not.toHaveBeenCalled();
  });

  /* Test 14, on the day itself: a subscription that is over is reported, not patched. */
  it("reports a subscription that is no longer current instead of patching it", async () => {
    await plan();
    atMollie = { ...atMollie, status: "canceled" };

    const run = await runPriceChanges(db as never, "2026-11-20");
    expect(run.problems).toMatchObject([{ reason: expect.stringContaining("canceled") }]);
    expect(updateSubscriptionAmount).not.toHaveBeenCalled();
    expect((await changes())[0]!.providerUpdatedAt).toBeUndefined();
  });

  it("refuses to withdraw once Mollie has been told", async () => {
    await plan();
    await runPriceChanges(db as never, "2026-11-20");
    const [pending] = await changes();
    const result = await withdrawPriceChange(db as never, pending!.id);
    expect(result).toMatchObject({ ok: false });
    expect((result as { reason: string }).reason).toContain("Mollie is al bijgewerkt");
  });

  /* Test 13: the service is ended before the new price would have started. */
  it("lapses when the service is cancelled before the effective date", async () => {
    await plan();

    // On 25 October the terms give a last day of 24 November: before the new price.
    const cancelled = await requestCancellation(db as never, "svc-1", {}, "2026-10-25", "admin-1");
    expect(cancelled).toMatchObject({ ok: true, plan: { endsOn: "2026-11-24" }, lapsedPriceChanges: 1 });
    expect(await changes()).toMatchObject([{ canceledReason: "service_ended" }]);

    const run = await runPriceChanges(db as never, "2026-11-20");
    expect(run).toMatchObject({ providerUpdated: 0, lapsed: 0, problems: [] });
    expect(updateSubscriptionAmount).not.toHaveBeenCalled();
  });

  it("lapses in the daily job too, when the end was planned by another route", async () => {
    await plan();
    const row = db.rows("recurring_services").find((candidate) => candidate.id === "svc-1")!;
    row.ends_on = "2026-11-24";
    row.cancellation_requested_at = "2026-10-26T10:00:00.000Z";

    const run = await runPriceChanges(db as never, "2026-11-20");
    expect(run).toMatchObject({ lapsed: 1, providerUpdated: 0 });
    expect(updateSubscriptionAmount).not.toHaveBeenCalled();
  });

  it("still applies a change that starts in a whole period before an agreed later end", async () => {
    // Nothing billed for November yet: the new price can start on 4 November,
    // and the customer agreed to end on 3 December, a period end.
    db = seed(flexora(), ["2026-09-04", "2026-10-04"]);
    expect(await plan({ newAmountCents: 1500, effectiveFrom: "2026-11-04" }, "2026-10-10")).toMatchObject({ ok: true });
    const cancelled = await requestCancellation(db as never, "svc-1", { endsOn: "2026-12-03", agreedDeviation: true }, "2026-10-10", "admin-1");
    expect(cancelled).toMatchObject({ ok: true, plan: { endsOn: "2026-12-03", lastTerm: { partial: false } }, lapsedPriceChanges: 0 });

    const run = await runPriceChanges(db as never, "2026-10-21");
    expect(run).toMatchObject({ providerUpdated: 1, lapsed: 0 });
    expect(updateSubscriptionAmount).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 1815 }));
  });
});

describe("when Mollie has already created a payment", () => {
  /* Regression 1: nothing created yet -- the ordinary case, with the listing on record. */
  it("asks Mollie for the subscription's payments before patching, and patches when the target period has none", async () => {
    await plan();
    created = [debit("tr_nov", "2026-11-04")];

    const run = await runPriceChanges(db as never, "2026-11-20");
    expect(run).toMatchObject({ providerUpdated: 1, rescheduled: 0, blocked: 0, problems: [] });
    expect(listSubscriptionPayments).toHaveBeenCalledWith("cst_flexora", "sub_1", expect.anything());
    expect(listSubscriptionPayments.mock.invocationCallOrder[0]).toBeLessThan(updateSubscriptionAmount.mock.invocationCallOrder[0]!);
    expect(await changes()).toMatchObject([{ effectiveFrom: "2026-12-04", providerUpdatedAt: expect.any(String) }]);
  });

  /* Regression 2 and 8: the target period's payment exists at the old amount -- that period keeps it everywhere. */
  it("moves the change to the next period when Mollie already created the target period's payment at the old amount", async () => {
    await plan();
    created = [debit("tr_dec", "2026-12-04", "12.10")];

    const run = await runPriceChanges(db as never, "2026-11-20");
    expect(run).toMatchObject({ providerUpdated: 1, rescheduled: 1, blocked: 0, problems: [] });
    const [change] = await changes();
    expect(change).toMatchObject({
      effectiveFrom: "2027-01-04",
      rescheduledFrom: "2026-12-04",
      rescheduleReason: expect.stringContaining("2026-12-04"),
      providerUpdatedAt: expect.any(String),
    });
    // Mollie takes the new amount for the payments it has not created yet.
    expect(updateSubscriptionAmount).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 1815 }));

    // December is invoiced and announced at the old figure, exactly what Mollie collects.
    const history = await changes();
    expect(recurringInvoiceLine(flexora(), history, { start: "2026-12-04", end: "2027-01-03" })).toMatchObject({ unitPriceCents: 1000 });
    expect(recurringOverview({ service: flexora(), billedPeriodStarts: billed, priceChanges: history }, [], "2026-11-20")).toMatchObject({ debitOn: "2026-12-04", amountCents: 1210 });
    expect(recurringInvoiceLine(flexora(), history, { start: "2027-01-04", end: "2027-02-03" })).toMatchObject({ unitPriceCents: 1500 });

    // The service switches over on the new effective date, not the old one.
    expect(await runPriceChanges(db as never, "2026-12-04")).toMatchObject({ applied: 0 });
    expect(await runPriceChanges(db as never, "2027-01-04")).toMatchObject({ applied: 1 });
    expect(db.rows("recurring_services").find((row) => row.id === "svc-1")!.amount_cents).toBe(1500);
  });

  it("recognises a payment Mollie created at the new amount as the change already made", async () => {
    await plan();
    created = [debit("tr_dec", "2026-12-04", "18.15")];
    atMollie = { ...atMollie, amount: mollieAmount(1815) };

    const run = await runPriceChanges(db as never, "2026-11-20");
    expect(run).toMatchObject({ providerUpdated: 1, rescheduled: 0, problems: [] });
    expect(updateSubscriptionAmount).not.toHaveBeenCalled();
    expect((await changes())[0]).toMatchObject({ effectiveFrom: "2026-12-04", providerUpdatedAt: expect.any(String) });
  });

  it("blocks the change, visibly, when no later period is possible before the service ends", async () => {
    await plan();
    const row = db.rows("recurring_services").find((candidate) => candidate.id === "svc-1")!;
    row.ends_on = "2027-01-03";
    row.cancellation_requested_at = "2026-11-01T10:00:00.000Z";
    created = [debit("tr_dec", "2026-12-04", "12.10")];

    const run = await runPriceChanges(db as never, "2026-11-20");
    expect(run).toMatchObject({ providerUpdated: 0, rescheduled: 0, blocked: 1 });
    expect(run.problems).toMatchObject([{ reason: expect.stringContaining("2026-12-04") }]);
    expect(updateSubscriptionAmount).not.toHaveBeenCalled();
    const [change] = await changes();
    expect(change).toMatchObject({ blockedAt: expect.any(String), blockedReason: expect.stringContaining("EUR 12.10") });

    // Blocked applies nowhere: December is billed at the old amount, as Mollie collects it.
    expect(amountForPeriod(flexora(), await changes(), "2026-12-04")).toBe(1000);
    const view = recurringManagement({
      service: flexora({ endsOn: "2027-01-03", cancellationRequestedAt: "2026-11-01T10:00:00.000Z" }),
      priceChanges: await changes(),
      billedPeriodStarts: billed,
      overview: recurringOverview({ service: flexora(), billedPeriodStarts: billed, priceChanges: await changes() }, [], "2026-11-20"),
      todayKey: "2026-11-20",
    });
    expect(view.scheduled).toMatchObject({ blockedReason: expect.stringContaining("12.10"), withdrawable: true });

    // Left alone by later runs, until the admin withdraws it.
    expect(await runPriceChanges(db as never, "2026-11-21")).toMatchObject({ blocked: 0, problems: [] });
    expect(await withdrawPriceChange(db as never, change!.id)).toEqual({ ok: true });
  });

  /* Regression 7: retries stay idempotent across the listing. */
  it("does not move or patch twice when the run is repeated", async () => {
    await plan();
    created = [debit("tr_dec", "2026-12-04", "12.10")];
    await runPriceChanges(db as never, "2026-11-20");
    const again = await runPriceChanges(db as never, "2026-11-20");
    expect(again).toMatchObject({ providerUpdated: 0, rescheduled: 0, problems: [] });
    expect(updateSubscriptionAmount).toHaveBeenCalledTimes(1);
    expect((await changes())[0]).toMatchObject({ effectiveFrom: "2027-01-04", rescheduledFrom: "2026-12-04" });
  });
});

describe("placing Mollie's payments by due date only", () => {
  /* Regression 1: created in November, due in December -- it is December's payment, so the change moves on. */
  it("treats a payment created before the announcement day but due in the target period as that period's", async () => {
    await plan();
    created = [debit("tr_dec", "2026-12-04", "12.10", { createdAt: "2026-11-18T06:00:00+00:00" })];

    const run = await runPriceChanges(db as never, "2026-11-20");
    expect(run).toMatchObject({ rescheduled: 1, blocked: 0, problems: [] });
    expect((await changes())[0]).toMatchObject({ effectiveFrom: "2027-01-04", rescheduledFrom: "2026-12-04" });
  });

  it("does not place a payment on a period by its creation day", async () => {
    await plan();
    // Created on 20 November, due 4 November: November's payment, not December's.
    created = [debit("tr_nov", "2026-11-04", "12.10", { createdAt: "2026-11-20T06:00:00+00:00" })];

    const run = await runPriceChanges(db as never, "2026-11-20");
    expect(run).toMatchObject({ providerUpdated: 1, rescheduled: 0, blocked: 0, problems: [] });
    expect((await changes())[0]).toMatchObject({ effectiveFrom: "2026-12-04" });
  });

  /* Regressions 2, 3 and 4: no due date -- nothing is patched, the change is blocked, the invoice follows Mollie. */
  it("blocks the change when a live payment has no due date, and bills the period at the amount Mollie holds", async () => {
    await plan();
    created = [debit("tr_nameless", "", "12.10", { details: {}, createdAt: "2026-11-18T06:00:00+00:00" })];

    const run = await runPriceChanges(db as never, "2026-11-20");
    expect(run).toMatchObject({ providerUpdated: 0, rescheduled: 0, blocked: 1 });
    expect(run.problems).toMatchObject([{ reason: expect.stringContaining("tr_nameless") }]);
    expect(run.problems[0]!.reason).toContain("zonder incassodatum");
    expect(updateSubscriptionAmount).not.toHaveBeenCalled();

    const history = await changes();
    expect(history[0]).toMatchObject({ blockedAt: expect.any(String), blockedReason: expect.stringContaining("aangemaakt 2026-11-18") });
    // The subscription still holds 12,10, and so does the December invoice.
    expect(recurringInvoiceLine(flexora(), history, { start: "2026-12-04", end: "2027-01-03" })).toMatchObject({ unitPriceCents: 1000 });
    expect(recurringOverview({ service: flexora(), billedPeriodStarts: billed, priceChanges: history }, [], "2026-11-20")).toMatchObject({ debitOn: "2026-12-04", amountCents: 1210 });

    // Once it is final, a fresh change can be planned.
    expect(await withdrawPriceChange(db as never, history[0]!.id)).toEqual({ ok: true });
  });
});
