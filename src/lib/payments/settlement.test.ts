import { describe, expect, it } from "vitest";
import { calculateTotals } from "@/lib/money";
import { invoiceFixture, paymentFixture } from "@/lib/payments/fixtures";
import { settleInvoice } from "@/lib/payments/settlement";

const total = calculateTotals(invoiceFixture().lines).totalCents; // 100,00 + 21% = 121,00

describe("settling an invoice", () => {
  it("owes the whole amount when nothing was paid", () => {
    const result = settleInvoice(total, []);
    expect(result.paidCents).toBe(0);
    expect(result.outstandingCents).toBe(total);
    expect(result.settled).toBe(false);
  });

  it("is settled by a successful payment for the full amount", () => {
    const result = settleInvoice(total, [paymentFixture({ amountCents: total })]);
    expect(result.settled).toBe(true);
    expect(result.outstandingCents).toBe(0);
    expect(result.lastSuccessful?.id).toBe("pay-1");
  });

  it("ignores an attempt that failed", () => {
    const result = settleInvoice(total, [paymentFixture({ status: "failed", amountCents: total })]);
    expect(result.paidCents).toBe(0);
    expect(result.settled).toBe(false);
    expect(result.failedWithoutRecovery).toBe(true);
  });

  /* Several payments already add up, so partial payments need no redesign. */
  it("adds several successful payments together", () => {
    const result = settleInvoice(total, [
      paymentFixture({ id: "a", providerPaymentId: "tr_a", amountCents: 6000, paidAt: "2026-09-02T10:00:00.000Z" }),
      paymentFixture({ id: "b", providerPaymentId: "tr_b", amountCents: 6100, paidAt: "2026-09-03T10:00:00.000Z" }),
    ]);
    expect(result.paidCents).toBe(12100);
    expect(result.settled).toBe(true);
    expect(result.lastSuccessful?.id).toBe("b");
  });

  it("counts a payment recorded by hand the same as one from a provider", () => {
    const result = settleInvoice(total, [
      paymentFixture({ source: "manual_bank_transfer", providerPaymentId: undefined, amountCents: total }),
    ]);
    expect(result.settled).toBe(true);
  });

  /* A later success must not be overwritten by an older failure. */
  it("stops reporting a failure once a later payment succeeded", () => {
    const result = settleInvoice(total, [
      paymentFixture({ id: "a", providerPaymentId: "tr_a", status: "failed", updatedAt: "2026-09-02T10:00:00.000Z" }),
      paymentFixture({ id: "b", providerPaymentId: "tr_b", amountCents: total, paidAt: "2026-09-03T10:00:00.000Z" }),
    ]);
    expect(result.settled).toBe(true);
    expect(result.failedWithoutRecovery).toBe(false);
  });

  it("does not call it a failure while another attempt is still running", () => {
    const result = settleInvoice(total, [
      paymentFixture({ id: "a", providerPaymentId: "tr_a", status: "failed", updatedAt: "2026-09-02T10:00:00.000Z" }),
      paymentFixture({ id: "b", providerPaymentId: "tr_b", status: "open" }),
    ]);
    expect(result.inFlight).toBe(true);
    expect(result.failedWithoutRecovery).toBe(false);
  });
});
