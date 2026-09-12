import { describe, expect, it } from "vitest";
import { addMonths, billingPeriod, firstPeriodStart, nextPeriodStart, periodEnd, periodForCharge } from "@/lib/payments/billing-period";

/**
 * The dates that decide when a customer is charged. Getting these wrong means
 * either billing a month twice or skipping one, so they are pinned here.
 */
describe("monthly billing dates", () => {
  it("moves a month on, same day", () => {
    expect(addMonths("2026-09-12", 1)).toBe("2026-10-12");
    expect(addMonths("2026-12-31", 1)).toBe("2027-01-31");
  });

  it("clamps to the last day of a shorter month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-03-31", 1)).toBe("2026-04-30");
  });

  /* Without an anchor a run of additions creeps backwards: 31 Jan would end
     up on 28 Mar instead of 31 Mar. */
  it("keeps the anchor day across several months", () => {
    const anchor = 31;
    const february = nextPeriodStart("2026-01-31", anchor);
    expect(february).toBe("2026-02-28");
    expect(nextPeriodStart(february, anchor)).toBe("2026-03-31");
  });

  it("ends a period the day before the next one starts", () => {
    expect(periodEnd("2026-09-12")).toBe("2026-10-11");
    expect(periodEnd("2026-01-31")).toBe("2026-02-27");
    expect(billingPeriod("2026-09-01")).toEqual({ start: "2026-09-01", end: "2026-09-30" });
  });

  it("starts period one on the agreed date, or on the day it was paid", () => {
    expect(firstPeriodStart({ startsOn: "2026-10-01" }, "2026-09-12")).toBe("2026-10-01");
    expect(firstPeriodStart({}, "2026-09-12")).toBe("2026-09-12");
  });
});

describe("which period a collection belongs to", () => {
  const anchor = "2026-09-12";

  it("puts a charge in the period it falls in", () => {
    expect(periodForCharge(anchor, "2026-09-12")).toEqual({ start: "2026-09-12", end: "2026-10-11" });
    expect(periodForCharge(anchor, "2026-10-12")).toEqual({ start: "2026-10-12", end: "2026-11-11" });
    expect(periodForCharge(anchor, "2026-12-20")).toEqual({ start: "2026-12-12", end: "2027-01-11" });
  });

  /* A collection a few days late still belongs to its own month, which is
     what keeps one charge to one invoice. */
  it("does not push a late collection into the next period", () => {
    expect(periodForCharge(anchor, "2026-10-14").start).toBe("2026-10-12");
    expect(periodForCharge(anchor, "2026-11-11").start).toBe("2026-10-12");
  });
});
