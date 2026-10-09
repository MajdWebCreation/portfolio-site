import { describe, expect, it } from "vitest";
import { centsFromMollie, mandateState, mollieAmount, paymentStatusFromMollie, type MollieMandate } from "@/lib/mollie/client";

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

/*
  Only a valid mandate makes a customer collectable. Pending is not yet,
  invalid is no longer, and the difference between those and "never" matters
  to what the admin is told.
*/
describe("mandate states", () => {
  const mandate = (id: string, status: MollieMandate["status"]): MollieMandate => ({ id, status, method: "directdebit" });

  it("is none when the customer never authorised anything", () => {
    expect(mandateState([])).toEqual({ state: "none" });
  });

  it("is pending while the only mandate is still being verified", () => {
    expect(mandateState([mandate("mdt_p", "pending")])).toMatchObject({ state: "pending", mandate: { id: "mdt_p" } });
  });

  it("is invalid when every mandate has been revoked or failed", () => {
    expect(mandateState([mandate("mdt_x", "invalid")])).toEqual({ state: "invalid" });
  });

  it("is valid as soon as one valid mandate exists, whatever else there is", () => {
    expect(
      mandateState([mandate("mdt_x", "invalid"), mandate("mdt_p", "pending"), mandate("mdt_ok", "valid")]),
    ).toMatchObject({ state: "valid", mandate: { id: "mdt_ok" } });
  });
});
