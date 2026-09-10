import { describe, expect, it } from "vitest";
import { calculateTotals, isValidVatRate, lineNetCents } from "./tax";

describe("lineNetCents", () => {
  it("multiplies quantity and unit price exactly", () => {
    expect(lineNetCents({ quantityHundredths: 100, unitPriceCents: 149500 })).toBe(149500);
    expect(lineNetCents({ quantityHundredths: 300, unitPriceCents: 110 })).toBe(330);
    expect(lineNetCents({ quantityHundredths: 250, unitPriceCents: 9500 })).toBe(23750);
  });
  it("rounds half cents up", () => {
    // 1,5 × € 0,05 = 0,075 → € 0,08
    expect(lineNetCents({ quantityHundredths: 150, unitPriceCents: 5 })).toBe(8);
    // 0,33 × € 1,00 = 0,33
    expect(lineNetCents({ quantityHundredths: 33, unitPriceCents: 100 })).toBe(33);
  });
  it("handles zero", () => {
    expect(lineNetCents({ quantityHundredths: 0, unitPriceCents: 5000 })).toBe(0);
    expect(lineNetCents({ quantityHundredths: 100, unitPriceCents: 0 })).toBe(0);
  });
  it("rejects non-integers", () => {
    expect(() => lineNetCents({ quantityHundredths: 1.5, unitPriceCents: 100 })).toThrow(RangeError);
    expect(() => lineNetCents({ quantityHundredths: 100, unitPriceCents: Number.NaN })).toThrow(RangeError);
  });
});

describe("isValidVatRate", () => {
  it("accepts whole and two-decimal percentages within 0..100", () => {
    expect(isValidVatRate(21)).toBe(true);
    expect(isValidVatRate(9)).toBe(true);
    expect(isValidVatRate(0)).toBe(true);
    expect(isValidVatRate(12.5)).toBe(true);
    expect(isValidVatRate(-1)).toBe(false);
    expect(isValidVatRate(101)).toBe(false);
    expect(isValidVatRate(Number.NaN)).toBe(false);
  });
});

describe("calculateTotals", () => {
  it("computes a single-rate quote", () => {
    const totals = calculateTotals([
      { quantityHundredths: 100, unitPriceCents: 149500, vatRate: 21 },
      { quantityHundredths: 200, unitPriceCents: 7500, vatRate: 21 },
    ]);
    expect(totals.subtotalCents).toBe(164500);
    expect(totals.vatGroups).toEqual([{ rate: 21, netCents: 164500, vatCents: 34545 }]);
    expect(totals.vatCents).toBe(34545);
    expect(totals.totalCents).toBe(199045);
  });

  it("splits VAT per rate and orders groups high to low", () => {
    const totals = calculateTotals([
      { quantityHundredths: 100, unitPriceCents: 10000, vatRate: 9 },
      { quantityHundredths: 100, unitPriceCents: 10000, vatRate: 21 },
      { quantityHundredths: 100, unitPriceCents: 5000, vatRate: 0 },
      { quantityHundredths: 100, unitPriceCents: 10000, vatRate: 21 },
    ]);
    expect(totals.subtotalCents).toBe(35000);
    expect(totals.vatGroups).toEqual([
      { rate: 21, netCents: 20000, vatCents: 4200 },
      { rate: 9, netCents: 10000, vatCents: 900 },
      { rate: 0, netCents: 5000, vatCents: 0 },
    ]);
    expect(totals.vatCents).toBe(5100);
    expect(totals.totalCents).toBe(40100);
  });

  it("rounds VAT once per rate group, not per line", () => {
    // Three lines of € 0,03 at 21%: per line VAT would be 0,0063 → 0,01 each (0,03);
    // grouped it is 0,09 × 21% = 0,0189 → 0,02.
    const totals = calculateTotals([
      { quantityHundredths: 100, unitPriceCents: 3, vatRate: 21 },
      { quantityHundredths: 100, unitPriceCents: 3, vatRate: 21 },
      { quantityHundredths: 100, unitPriceCents: 3, vatRate: 21 },
    ]);
    expect(totals.subtotalCents).toBe(9);
    expect(totals.vatCents).toBe(2);
    expect(totals.totalCents).toBe(11);
  });

  it("handles an empty document and zero amounts", () => {
    expect(calculateTotals([])).toEqual({ subtotalCents: 0, vatGroups: [], vatCents: 0, totalCents: 0 });
    const zero = calculateTotals([{ quantityHundredths: 100, unitPriceCents: 0, vatRate: 21 }]);
    expect(zero.totalCents).toBe(0);
    expect(zero.vatGroups[0].vatCents).toBe(0);
  });

  it("rejects invalid VAT rates", () => {
    expect(() => calculateTotals([{ quantityHundredths: 100, unitPriceCents: 100, vatRate: 21.005 }])).toThrow(RangeError);
    expect(() => calculateTotals([{ quantityHundredths: 100, unitPriceCents: 100, vatRate: -5 }])).toThrow(RangeError);
  });

  it("stays exact for many lines with fractional quantities", () => {
    const lines = Array.from({ length: 25 }, (_, i) => ({ quantityHundredths: 150, unitPriceCents: 1999 + i, vatRate: i % 2 ? 21 : 9 }));
    const totals = calculateTotals(lines);
    const expectedSubtotal = lines.reduce((sum, l) => sum + Math.floor((150 * l.unitPriceCents) / 100 + 0.5), 0);
    expect(totals.subtotalCents).toBe(expectedSubtotal);
    expect(totals.vatGroups.map((g) => g.rate)).toEqual([21, 9]);
    expect(totals.totalCents).toBe(totals.subtotalCents + totals.vatCents);
    expect(Number.isSafeInteger(totals.totalCents)).toBe(true);
  });
});
