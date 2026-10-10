import { describe, expect, it } from "vitest";
import type { MolliePayment } from "@/lib/mollie/client";
import {
  describeUnknownPayments,
  isLivePayment,
  isOpenPayment,
  paymentChargeDate,
  paymentForPeriod,
  paymentsAfter,
  placePayments,
  unknownPayments,
} from "@/lib/payments/subscription-payments";

/**
 * Placing Mollie's subscription payments on the service's own calendar, so
 * the lifecycle flows can tell which collection Mollie has already created
 * instead of assuming a lead time the docs do not give. The due date alone
 * places a payment; a live payment without one has an unknown period.
 */
const payment = (overrides: Partial<MolliePayment>): MolliePayment => ({
  id: "tr_x",
  status: "pending",
  amount: { currency: "EUR", value: "12.10" },
  description: "Websitebeheer & hosting",
  method: "directdebit",
  subscriptionId: "sub_1",
  ...overrides,
});

describe("where a payment lands on the calendar", () => {
  it("uses the direct debit due date and nothing else", () => {
    expect(paymentChargeDate(payment({ details: { dueDate: "2026-12-04" }, createdAt: "2026-12-01T06:00:00+00:00" }))).toBe("2026-12-04");
    expect(paymentChargeDate(payment({ createdAt: "2026-12-01T06:00:00+00:00" }))).toBeUndefined();
    expect(paymentChargeDate(payment({ details: { dueDate: null }, createdAt: "2026-12-01T06:00:00+00:00", paidAt: "2026-12-04T06:00:00+00:00" }))).toBeUndefined();
    expect(paymentChargeDate(payment({ details: { dueDate: "4 dec" } }))).toBeUndefined();
  });

  /* Regression 1: created in November, due in December -- it is December's payment. */
  it("places a payment created in the previous period on the period of its due date", () => {
    const { placed, unknown } = placePayments("2026-09-04", [
      payment({ id: "tr_nov", details: { dueDate: "2026-11-04" }, createdAt: "2026-10-30T06:00:00+00:00" }),
      payment({ id: "tr_dec_early", details: { dueDate: "2026-12-04" }, createdAt: "2026-11-18T06:00:00+00:00" }),
      payment({ id: "tr_late", details: { dueDate: "2026-12-06" } }),
    ]);
    expect(placed.map((item) => [item.payment.id, item.periodStart])).toEqual([
      ["tr_nov", "2026-11-04"],
      ["tr_dec_early", "2026-12-04"],
      ["tr_late", "2026-12-04"],
    ]);
    expect(unknown).toEqual([]);
    expect(paymentForPeriod("2026-09-04", [payment({ id: "tr_dec_early", details: { dueDate: "2026-12-04" }, createdAt: "2026-11-18T06:00:00+00:00" })], "2026-11-04")).toBeUndefined();
  });

  /* Regression 2: no due date -- the period is unknown, never guessed from createdAt. */
  it("sets a live payment without a due date aside as unknown", () => {
    const nameless = payment({ id: "tr_nameless", createdAt: "2026-11-18T06:00:00+00:00" });
    const { placed, unknown } = placePayments("2026-09-04", [nameless, payment({ id: "tr_nov", details: { dueDate: "2026-11-04" } })]);
    expect(placed.map((item) => item.payment.id)).toEqual(["tr_nov"]);
    expect(unknown.map((item) => item.id)).toEqual(["tr_nameless"]);
    expect(unknownPayments([nameless])).toHaveLength(1);
    expect(paymentForPeriod("2026-09-04", [nameless], "2026-11-04")).toBeUndefined();
    expect(paymentForPeriod("2026-09-04", [nameless], "2026-12-04")).toBeUndefined();
    // The creation day appears in the description, for the log, and nowhere else.
    expect(describeUnknownPayments([nameless])).toContain("tr_nameless (pending, EUR 12.10, aangemaakt 2026-11-18)");
  });

  it("ignores payments that will never move money, with or without a due date", () => {
    const list = [
      payment({ id: "tr_failed", status: "failed", details: { dueDate: "2026-12-04" } }),
      payment({ id: "tr_canceled", status: "canceled" }),
      payment({ id: "tr_expired", status: "expired", details: { dueDate: "2026-12-04" } }),
    ];
    expect(placePayments("2026-09-04", list)).toEqual({ placed: [], unknown: [] });
    expect(unknownPayments(list)).toEqual([]);
    expect(isLivePayment({ status: "paid" })).toBe(true);
    expect(isOpenPayment({ status: "paid" })).toBe(false);
    expect(isOpenPayment({ status: "open" })).toBe(true);
  });

  it("finds the payments for periods after the last day", () => {
    const list = [
      payment({ id: "tr_nov", details: { dueDate: "2026-11-04" } }),
      payment({ id: "tr_dec", details: { dueDate: "2026-12-04" } }),
      payment({ id: "tr_jan", status: "open", details: { dueDate: "2027-01-04" } }),
    ];
    // A last day of 24 November or 3 December: December's collection is already one too many.
    expect(paymentsAfter("2026-09-04", list, "2026-11-24").map((item) => item.payment.id)).toEqual(["tr_dec", "tr_jan"]);
    expect(paymentsAfter("2026-09-04", list, "2026-12-03").map((item) => item.payment.id)).toEqual(["tr_dec", "tr_jan"]);
    expect(paymentsAfter("2026-09-04", list, "2027-01-03").map((item) => item.payment.id)).toEqual(["tr_jan"]);
    expect(paymentsAfter("2026-09-04", list, "2027-01-04")).toEqual([]);
  });
});
