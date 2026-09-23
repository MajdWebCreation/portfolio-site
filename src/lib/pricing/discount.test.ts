import { describe, expect, it } from "vitest";
import {
  developmentDiscountFromSettings,
  developmentPrice,
  isValidDevelopmentDiscountPercent,
} from "@/lib/pricing/discount";

describe("developmentPrice", () => {
  it("returns the base amount unchanged when there is no discount", () => {
    expect(developmentPrice(1495, null)).toEqual({ baseAmount: 1495, amount: 1495, percent: null });
    expect(developmentPrice(695, null)).toEqual({ baseAmount: 695, amount: 695, percent: null });
  });

  it("rounds a 30% discount to the nearest whole euro, half up", () => {
    const discount = { percent: 30 };
    expect(developmentPrice(695, discount)).toEqual({ baseAmount: 695, amount: 487, percent: 30 });
    expect(developmentPrice(1495, discount).amount).toBe(1047);
    expect(developmentPrice(1995, discount).amount).toBe(1397);
    expect(developmentPrice(2495, discount).amount).toBe(1747);
    expect(developmentPrice(4995, discount).amount).toBe(3497);
    expect(developmentPrice(75, discount).amount).toBe(53);
    expect(developmentPrice(8500, discount).amount).toBe(5950);
  });

  it("follows another percentage through the same rule", () => {
    const discount = { percent: 20 };
    expect(developmentPrice(695, discount).amount).toBe(556);
    expect(developmentPrice(1495, discount).amount).toBe(1196);
    expect(developmentPrice(4995, discount).amount).toBe(3996);
  });

  it("handles the bounds of the accepted range", () => {
    expect(developmentPrice(1495, { percent: 1 }).amount).toBe(1480); // 1480.05
    expect(developmentPrice(695, { percent: 1 }).amount).toBe(688); // 688.05
    expect(developmentPrice(1495, { percent: 90 }).amount).toBe(150); // 149.5
    expect(developmentPrice(695, { percent: 90 }).amount).toBe(70); // 69.5
  });
});

describe("developmentDiscountFromSettings", () => {
  it("is off without settings", () => {
    expect(developmentDiscountFromSettings(null)).toBeNull();
    expect(developmentDiscountFromSettings(undefined)).toBeNull();
  });

  it("is off when switched off, whatever the percentage", () => {
    expect(developmentDiscountFromSettings({ enabled: false, percent: 30 })).toBeNull();
  });

  it("is the stored percentage when switched on", () => {
    expect(developmentDiscountFromSettings({ enabled: true, percent: 30 })).toEqual({ percent: 30 });
    expect(developmentDiscountFromSettings({ enabled: true, percent: 20 })).toEqual({ percent: 20 });
  });

  it("never invents or accepts a percentage outside 1 through 90", () => {
    for (const percent of [0, -5, 91, 100, 30.5, Number.NaN]) {
      expect(developmentDiscountFromSettings({ enabled: true, percent })).toBeNull();
    }
  });
});

describe("isValidDevelopmentDiscountPercent", () => {
  it("accepts whole numbers from 1 through 90 only", () => {
    expect(isValidDevelopmentDiscountPercent(1)).toBe(true);
    expect(isValidDevelopmentDiscountPercent(30)).toBe(true);
    expect(isValidDevelopmentDiscountPercent(90)).toBe(true);
    for (const value of [0, 91, 12.5, "30", null, undefined, Number.POSITIVE_INFINITY]) {
      expect(isValidDevelopmentDiscountPercent(value)).toBe(false);
    }
  });
});
