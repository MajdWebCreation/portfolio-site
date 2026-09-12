import { describe, expect, it } from "vitest";
import { centsFromMollie, mollieAmount, paymentStatusFromMollie } from "@/lib/mollie/client";

/**
 * The conversion between our integer cents and Mollie's decimal strings, and
 * between their payment states and ours. Pure functions; no request is made.
 */
describe("amounts across the provider boundary", () => {
  it("writes cents as the decimal string Mollie expects", () => {
    expect(mollieAmount(1050)).toEqual({ currency: "EUR", value: "10.50" });
    expect(mollieAmount(2500)).toEqual({ currency: "EUR", value: "25.00" });
    expect(mollieAmount(5)).toEqual({ currency: "EUR", value: "0.05" });
    expect(mollieAmount(123456)).toEqual({ currency: "EUR", value: "1234.56" });
  });

  it("reads them back without losing a cent", () => {
    for (const cents of [1, 5, 99, 1050, 2500, 121_00, 999_999]) {
      expect(centsFromMollie(mollieAmount(cents).value)).toBe(cents);
    }
  });

  it("copes with a value that has no decimals", () => {
    expect(centsFromMollie("25")).toBe(2500);
  });
});

describe("payment states", () => {
  it("treats only 'paid' as money arrived", () => {
    expect(paymentStatusFromMollie("paid")).toBe("paid");
    // Authorized is money promised, not moved, so it may not settle anything.
    expect(paymentStatusFromMollie("authorized")).toBe("pending");
    expect(paymentStatusFromMollie("pending")).toBe("pending");
    expect(paymentStatusFromMollie("open")).toBe("open");
  });

  it("keeps the three ways an attempt can end apart", () => {
    expect(paymentStatusFromMollie("failed")).toBe("failed");
    expect(paymentStatusFromMollie("canceled")).toBe("canceled");
    expect(paymentStatusFromMollie("expired")).toBe("expired");
  });
});
