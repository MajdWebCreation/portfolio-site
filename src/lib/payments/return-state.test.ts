import { describe, expect, it } from "vitest";
import { paymentReturnState, type ReturnAttempt } from "@/lib/payments/return-state";

/*
  The return page is the one screen a customer sees straight after paying, and
  the provider sends everyone here -- including the one who cancelled. So the
  rule is asymmetric on purpose: confirming a payment takes proof, saying
  nothing is known takes none, and calling something failed takes proof too.

  Times are ISO strings, ordered the way the rows themselves are.
*/
const attempt = (status: ReturnAttempt["status"], at = "2026-09-14T18:11:05.000Z"): ReturnAttempt => ({ status, at });

describe("an invoice that is paid", () => {
  it("confirms the payment", () => {
    expect(paymentReturnState({ invoiceStatus: "paid", attempts: [attempt("paid")] })).toBe("paid");
  });

  /* A settled invoice stays settled, whatever a later failed retry says. */
  it("keeps confirming it after a later failed attempt", () => {
    const attempts = [attempt("paid", "2026-09-14T18:11:05.000Z"), attempt("failed", "2026-09-14T19:00:00.000Z")];
    expect(paymentReturnState({ invoiceStatus: "paid", attempts })).toBe("paid");
  });
});

describe("an outcome that is not final yet", () => {
  /*
    The race the whole page exists for: the browser comes back before the
    webhook has written anything. Nothing recorded is not a failed payment.
  */
  it("reports processing when the redirect beat the webhook", () => {
    expect(paymentReturnState({ invoiceStatus: "sent", attempts: [] })).toBe("processing");
  });

  it("reports processing while an attempt is still running", () => {
    for (const status of ["open", "pending"] as const) {
      expect(paymentReturnState({ invoiceStatus: "sent", attempts: [attempt(status)] })).toBe("processing");
    }
  });

  /*
    A payment row that says paid while the invoice does not is the webhook
    partway through, or a part payment. Neither is a settled debt, so the page
    may not congratulate anyone yet.
  */
  it("does not confirm on a payment row alone", () => {
    expect(paymentReturnState({ invoiceStatus: "sent", attempts: [attempt("paid")] })).toBe("processing");
  });

  /* An older failure that a running attempt has overtaken is not the answer. */
  it("prefers a running attempt over an earlier failure", () => {
    const attempts = [attempt("failed", "2026-09-14T18:00:00.000Z"), attempt("open", "2026-09-14T18:30:00.000Z")];
    expect(paymentReturnState({ invoiceStatus: "sent", attempts })).toBe("processing");
  });

  /* An overdue invoice with nothing recorded is still only "not yet". */
  it("says nothing final about an overdue invoice without attempts", () => {
    expect(paymentReturnState({ invoiceStatus: "overdue", attempts: [] })).toBe("processing");
  });
});

describe("an attempt that demonstrably ended badly", () => {
  it("reports a failure for each of the three terminal outcomes", () => {
    for (const status of ["failed", "canceled", "expired"] as const) {
      expect(paymentReturnState({ invoiceStatus: "sent", attempts: [attempt(status)] })).toBe("failed");
    }
  });

  it("judges by the most recent attempt, not the first", () => {
    const attempts = [attempt("canceled", "2026-09-14T18:00:00.000Z"), attempt("failed", "2026-09-14T18:30:00.000Z")];
    expect(paymentReturnState({ invoiceStatus: "sent", attempts })).toBe("failed");
  });

  /* Cancelled first, paid after: the invoice says paid and that is the answer. */
  it("is overruled by a payment that came good afterwards", () => {
    const attempts = [attempt("canceled", "2026-09-14T18:00:00.000Z"), attempt("paid", "2026-09-14T18:30:00.000Z")];
    expect(paymentReturnState({ invoiceStatus: "paid", attempts })).toBe("paid");
  });
});

describe("an invoice the hint does not resolve to", () => {
  it("knows nothing, and says nothing about a payment", () => {
    expect(paymentReturnState({ attempts: [] })).toBe("unknown");
    // Not even attempts could make it claim something about an unknown invoice.
    expect(paymentReturnState({ attempts: [attempt("paid")] })).toBe("unknown");
  });
});
