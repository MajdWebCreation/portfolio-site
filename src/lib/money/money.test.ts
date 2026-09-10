import { describe, expect, it } from "vitest";
import {
  centsToInput,
  eurosToCents,
  formatCents,
  formatQuantity,
  parseCents,
  parseQuantityHundredths,
  roundHalfUp,
} from "./money";

describe("roundHalfUp", () => {
  it("rounds half away from zero", () => {
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(1.5)).toBe(2);
    expect(roundHalfUp(2.4999)).toBe(2);
    expect(roundHalfUp(-0.5)).toBe(-1);
  });
  it("rejects non-finite input", () => {
    expect(() => roundHalfUp(Number.NaN)).toThrow(RangeError);
    expect(() => roundHalfUp(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("eurosToCents", () => {
  it("avoids binary float drift", () => {
    expect(eurosToCents(1.1)).toBe(110);
    expect(eurosToCents(0.29)).toBe(29);
    expect(eurosToCents(1495)).toBe(149500);
    expect(eurosToCents(19.995)).toBe(2000);
  });
});

describe("parseCents", () => {
  it("reads Dutch notation", () => {
    expect(parseCents("1.495,00")).toBe(149500);
    expect(parseCents("1495,5")).toBe(149550);
    expect(parseCents("1495")).toBe(149500);
    expect(parseCents("€ 12,50")).toBe(1250);
    expect(parseCents(" 0,05 ")).toBe(5);
  });
  it("reads a plain decimal point with one or two decimals", () => {
    expect(parseCents("12.50")).toBe(1250);
    expect(parseCents("12.5")).toBe(1250);
  });
  it("rejects garbage", () => {
    expect(parseCents("")).toBeNull();
    expect(parseCents("abc")).toBeNull();
    expect(parseCents("1,234")).toBeNull();
    expect(parseCents("1.2.3")).toBeNull();
    expect(parseCents("NaN")).toBeNull();
    expect(parseCents("Infinity")).toBeNull();
  });
  it("round-trips through centsToInput", () => {
    for (const cents of [0, 5, 100, 149500, 1234567]) {
      expect(parseCents(centsToInput(cents))).toBe(cents);
    }
  });
});

describe("formatting", () => {
  it("formats Dutch euro amounts", () => {
    expect(centsToInput(149500)).toBe("1.495,00");
    expect(centsToInput(5)).toBe("0,05");
    expect(centsToInput(-1250)).toBe("-12,50");
    expect(formatCents(123456789)).toBe("€ 1.234.567,89");
    expect(formatCents(0)).toBe("€ 0,00");
  });
});

describe("quantities", () => {
  it("parses to hundredths", () => {
    expect(parseQuantityHundredths("1")).toBe(100);
    expect(parseQuantityHundredths("2,5")).toBe(250);
    expect(parseQuantityHundredths("0.25")).toBe(25);
    expect(parseQuantityHundredths("1,234")).toBeNull();
    expect(parseQuantityHundredths("-1")).toBeNull();
    expect(parseQuantityHundredths("")).toBeNull();
  });
  it("formats without trailing zeros", () => {
    expect(formatQuantity(100)).toBe("1");
    expect(formatQuantity(250)).toBe("2,5");
    expect(formatQuantity(25)).toBe("0,25");
  });
});
