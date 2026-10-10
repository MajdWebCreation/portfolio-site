import { describe, expect, it } from "vitest";
import { calculateTotals } from "@/lib/money";
import {
  amountForPeriod,
  chargeForPeriod,
  endsInside,
  firstAnnounceablePeriodStart,
  grossOf,
  isLocalApplyDue,
  isProviderUpdateDue,
  lastTermOf,
  priceChangeOptions,
  proratedNetCents,
  providerUpdateDay,
} from "@/lib/payments/pricing";
import type { PriceChange } from "@/lib/payments/types";

/**
 * What a period costs, read off the price history, and when a new price may
 * start. Pure rules; the daily job and the admin screen both apply them.
 */
const change = (overrides: Partial<PriceChange> = {}): PriceChange => ({
  id: "pc-1",
  recurringServiceId: "svc-1",
  customerId: "cust-1",
  oldAmountCents: 1000,
  newAmountCents: 1500,
  effectiveFrom: "2026-12-04",
  requestedAt: "2026-10-10T10:00:00.000Z",
  ...overrides,
});

describe("the amount a period costs", () => {
  const service = { amountCents: 1000, vatRate: 21 };

  it("is the service's own amount while there is no history", () => {
    expect(amountForPeriod(service, [], "2026-11-04")).toBe(1000);
  });

  /* Tests 2 and 3: the old price up to the effective date, the new one from it. */
  it("keeps the old price before the effective date and uses the new one from it", () => {
    const history = [change()];
    expect(amountForPeriod(service, history, "2026-11-04")).toBe(1000);
    expect(amountForPeriod(service, history, "2026-12-03")).toBe(1000);
    expect(amountForPeriod(service, history, "2026-12-04")).toBe(1500);
    expect(amountForPeriod(service, history, "2027-03-04")).toBe(1500);
  });

  /* Test 9: once the service row shows the new price, an old period still reads the old one. */
  it("reads an old period off the history even after the service switched over", () => {
    const switched = { amountCents: 1500, vatRate: 21 };
    const history = [change({ providerUpdatedAt: "2026-11-20T07:00:00.000Z", appliedAt: "2026-12-04T07:00:00.000Z" })];
    expect(amountForPeriod(switched, history, "2026-11-04")).toBe(1000);
    expect(amountForPeriod(switched, history, "2026-12-04")).toBe(1500);
  });

  it("follows a chain of changes by effective date", () => {
    const history = [
      change({ id: "a", oldAmountCents: 1000, newAmountCents: 1500, effectiveFrom: "2026-12-04" }),
      change({ id: "b", oldAmountCents: 1500, newAmountCents: 2000, effectiveFrom: "2027-03-04" }),
    ];
    expect(amountForPeriod(service, history, "2026-11-04")).toBe(1000);
    expect(amountForPeriod(service, history, "2027-02-04")).toBe(1500);
    expect(amountForPeriod(service, history, "2027-03-04")).toBe(2000);
  });

  it("ignores a change that is blocked: Mollie could not be given its amount", () => {
    const history = [change({ blockedAt: "2026-11-20T07:00:00.000Z", blockedReason: "incasso bestond al" })];
    expect(amountForPeriod(service, history, "2026-12-04")).toBe(1000);
  });

  it("ignores a change that was withdrawn or lapsed", () => {
    const history = [change({ canceledAt: "2026-10-11T10:00:00.000Z", canceledReason: "withdrawn" })];
    expect(amountForPeriod(service, history, "2026-12-04")).toBe(1000);
  });

  /* Test 15: VAT in cents, through the one arithmetic the invoice uses. */
  it("computes the gross amount exactly as the invoice line would", () => {
    for (const net of [1000, 999, 1234, 1, 33333]) {
      const expected = calculateTotals([{ quantityHundredths: 100, unitPriceCents: net, vatRate: 21 }]).totalCents;
      expect(grossOf(net, 21)).toBe(expected);
      expect(Number.isInteger(grossOf(net, 21))).toBe(true);
    }
    expect(grossOf(1000, 21)).toBe(1210);
    expect(grossOf(1500, 21)).toBe(1815);
    expect(grossOf(999, 21)).toBe(1209);
    expect(grossOf(1234, 21)).toBe(1493);
    expect(grossOf(1000, 9)).toBe(1090);
    expect(grossOf(1000, 0)).toBe(1000);
    expect(chargeForPeriod({ amountCents: 1000, vatRate: 21 }, [change()], "2026-12-04")).toBe(1815);
  });
});

describe("when a new price may start", () => {
  /* Test 6: a period inside the announcement window keeps its price. */
  it("is the first unbilled period start at least fourteen days from tomorrow", () => {
    // 10 Oct, nothing billed yet, first collection 4 Nov: 4 Nov is 25 days out.
    expect(firstAnnounceablePeriodStart({ anchor: "2026-11-04", billedPeriodStarts: [], todayKey: "2026-10-10" })).toBe("2026-11-04");
    // 21 Oct: 4 Nov is 14 days out but counted from tomorrow it is 13; next month.
    expect(firstAnnounceablePeriodStart({ anchor: "2026-11-04", billedPeriodStarts: [], todayKey: "2026-10-21" })).toBe("2026-12-04");
    // 20 Oct: exactly fourteen days from tomorrow still counts.
    expect(firstAnnounceablePeriodStart({ anchor: "2026-11-04", billedPeriodStarts: [], todayKey: "2026-10-20" })).toBe("2026-11-04");
  });

  it("skips every period that already has an invoice", () => {
    expect(
      firstAnnounceablePeriodStart({ anchor: "2026-09-04", billedPeriodStarts: ["2026-09-04", "2026-10-04", "2026-11-04"], todayKey: "2026-10-25" }),
    ).toBe("2026-12-04");
  });

  it("offers the months after it, and nothing past a planned end", () => {
    const options = priceChangeOptions({ startsOn: "2026-09-04", billedPeriodStarts: ["2026-10-04"], todayKey: "2026-10-10" }, 3);
    expect(options.map((option) => option.effectiveFrom)).toEqual(["2026-11-04", "2026-12-04", "2027-01-04"]);
    expect(options[0]!.announceFrom).toBe("2026-10-21");

    const ending = priceChangeOptions({ startsOn: "2026-09-04", endsOn: "2026-12-03", billedPeriodStarts: ["2026-10-04"], todayKey: "2026-10-10" });
    expect(ending.map((option) => option.effectiveFrom)).toEqual(["2026-11-04"]);
  });

  it("keeps the anchor day through short months", () => {
    const options = priceChangeOptions({ startsOn: "2026-01-31", billedPeriodStarts: ["2026-01-31"], todayKey: "2026-02-01" }, 3);
    expect(options.map((option) => option.effectiveFrom)).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
  });
});

describe("the two days a change is carried out on", () => {
  it("updates Mollie fourteen days before the first collection at the new price", () => {
    expect(providerUpdateDay("2026-12-04")).toBe("2026-11-20");
    expect(isProviderUpdateDue(change(), "2026-11-19")).toBe(false);
    expect(isProviderUpdateDue(change(), "2026-11-20")).toBe(true);
    expect(isProviderUpdateDue(change(), "2026-12-01")).toBe(true);
  });

  it("switches the service over on the effective date, and only after Mollie was told", () => {
    expect(isLocalApplyDue(change(), "2026-12-04")).toBe(false);
    const told = change({ providerUpdatedAt: "2026-11-20T07:00:00.000Z" });
    expect(isLocalApplyDue(told, "2026-12-03")).toBe(false);
    expect(isLocalApplyDue(told, "2026-12-04")).toBe(true);
  });
});

describe("a partial last period", () => {
  const november = { start: "2026-11-04", end: "2026-12-03" };

  it("counts the days delivered inclusively against the whole period", () => {
    expect(lastTermOf(november, "2026-11-09")).toMatchObject({ daysUsed: 6, periodDays: 30, partial: true });
    expect(lastTermOf(november, "2026-11-04")).toMatchObject({ daysUsed: 1, partial: true });
    expect(lastTermOf(november, "2026-12-03")).toMatchObject({ daysUsed: 30, periodDays: 30, partial: false });
    expect(lastTermOf({ start: "2026-10-04", end: "2026-11-03" }, "2026-11-02")).toMatchObject({ daysUsed: 30, periodDays: 31, partial: true });
  });

  it("bills the days delivered pro rata, rounded once to whole cents", () => {
    expect(proratedNetCents(1000, { daysUsed: 6, periodDays: 30 })).toBe(200);
    expect(proratedNetCents(1000, { daysUsed: 30, periodDays: 31 })).toBe(968);
    expect(proratedNetCents(1000, { daysUsed: 1, periodDays: 31 })).toBe(32);
    expect(proratedNetCents(1000, { daysUsed: 30, periodDays: 30 })).toBe(1000);
    expect(proratedNetCents(1500, { daysUsed: 21, periodDays: 30 })).toBe(1050);
    expect(grossOf(proratedNetCents(1000, { daysUsed: 6, periodDays: 30 }), 21)).toBe(242);
  });

  it("knows whether a last day falls inside a period", () => {
    expect(endsInside(november, "2026-11-09")).toBe(true);
    expect(endsInside(november, "2026-12-03")).toBe(false);
    expect(endsInside(november, "2026-10-20")).toBe(false);
    expect(endsInside(november, undefined)).toBe(false);
  });
});
