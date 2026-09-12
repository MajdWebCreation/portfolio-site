import { describe, expect, it } from "vitest";
import { calculateTotals } from "@/lib/money";
import { customerFinancials } from "@/lib/payments/customer-status";
import { invoiceFixture, paymentFixture } from "@/lib/payments/fixtures";

const today = "2026-09-20";
const total = calculateTotals(invoiceFixture().lines).totalCents; // 121,00

describe("customer payment status", () => {
  it("is up to date with nothing outstanding", () => {
    expect(customerFinancials([], [], today).status).toBe("up_to_date");
  });

  it("ignores drafts and cancelled invoices: neither is a claim", () => {
    const result = customerFinancials(
      [invoiceFixture({ id: "a", status: "draft" }), invoiceFixture({ id: "b", status: "cancelled" })],
      [],
      today,
    );
    expect(result.status).toBe("up_to_date");
    expect(result.outstandingCents).toBe(0);
  });

  it("is open while an unpaid invoice is not yet due", () => {
    const result = customerFinancials([invoiceFixture({ dueDate: "2026-09-30" })], [], today);
    expect(result.status).toBe("open");
    expect(result.outstandingCents).toBe(total);
    expect(result.overdueCents).toBe(0);
    expect(result.openInvoiceCount).toBe(1);
  });

  it("is overdue once the due date has passed", () => {
    const result = customerFinancials([invoiceFixture({ dueDate: "2026-09-15" })], [], today);
    expect(result.status).toBe("overdue");
    expect(result.overdueCents).toBe(total);
  });

  it("reports a failed attempt ahead of plain lateness", () => {
    const result = customerFinancials(
      [invoiceFixture({ dueDate: "2026-09-15" })],
      [paymentFixture({ status: "failed" })],
      today,
    );
    expect(result.status).toBe("payment_failed");
  });

  /* The acceptance case: money arriving moves the customer to "Bij". */
  it("turns up to date when the payment succeeds", () => {
    const invoices = [invoiceFixture({ dueDate: "2026-09-15" })];
    expect(customerFinancials(invoices, [], today).status).toBe("overdue");

    const paid = customerFinancials(invoices, [paymentFixture({ amountCents: total })], today);
    expect(paid.status).toBe("up_to_date");
    expect(paid.outstandingCents).toBe(0);
    expect(paid.lastSuccessfulPayment?.id).toBe("pay-1");
  });

  it("adds up several invoices of the same customer", () => {
    const result = customerFinancials(
      [
        invoiceFixture({ id: "a", dueDate: "2026-09-10" }),
        invoiceFixture({ id: "b", dueDate: "2026-09-30" }),
        invoiceFixture({ id: "c", status: "paid" }),
      ],
      [paymentFixture({ id: "p", invoiceId: "c", amountCents: total })],
      today,
    );
    expect(result.outstandingCents).toBe(total * 2);
    expect(result.overdueCents).toBe(total);
    expect(result.openInvoiceCount).toBe(2);
    expect(result.status).toBe("overdue");
  });

  /* An invoice settled outside this administration still owes nothing. */
  it("trusts a paid invoice even when no payment row exists", () => {
    const result = customerFinancials([invoiceFixture({ status: "paid", dueDate: "2026-01-01" })], [], today);
    expect(result.status).toBe("up_to_date");
    expect(result.outstandingCents).toBe(0);
  });

  it("keeps a partly paid invoice open for the remainder", () => {
    const result = customerFinancials(
      [invoiceFixture({ dueDate: "2026-09-30" })],
      [paymentFixture({ amountCents: 5000 })],
      today,
    );
    expect(result.status).toBe("open");
    expect(result.outstandingCents).toBe(total - 5000);
  });
});
