import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/lib/payments/fixtures";
import { resetRateLimits } from "@/lib/payments/rate-limit";
import { createPaymentReturnToken } from "@/lib/payments/return-token";
import { returnView } from "@/lib/payments/return-polling";

/*
  The check the page repeats while it waits, driven the way the page drives it.

  The case that matters is the ordinary one: the browser gets back before the
  webhook does, so the first call says "not yet" and a later call says "paid"
  -- without the customer doing anything, and without the first call ever
  having been allowed to say thank you.
*/
let db: ReturnType<typeof createFakeDb>;

vi.mock("@/lib/payments/admin-client", () => ({
  paymentsAdminClient: () => db,
  hasPaymentsAdminAccess: () => true,
}));

const secret = "test-payment-return-secret-value";
process.env.PAYMENT_RETURN_SECRET = secret;

const { checkPaymentReturnState } = await import("@/lib/payments/return-actions");

const invoiceId = "dd847d57-3cb1-4160-b848-2a43a53ac40f";

/** The invoice as it stands, plus whatever the webhook has written so far. */
function seed(invoiceStatus: string, payments: Record<string, unknown>[] = []) {
  return createFakeDb({
    invoices: [{ id: invoiceId, number_value: "YM-F-2026-000001", status: invoiceStatus }],
    payments,
  });
}

const paidPayment = {
  id: "pay-1",
  invoice_id: invoiceId,
  status: "paid",
  paid_at: "2026-09-14T18:11:05.000Z",
  updated_at: "2026-09-14T18:11:05.000Z",
};

beforeEach(() => {
  resetRateLimits();
  process.env.PAYMENT_RETURN_SECRET = secret;
  db = seed("sent");
});

afterEach(() => {
  process.env.PAYMENT_RETURN_SECRET = secret;
});

describe("the redirect arriving before the webhook", () => {
  it("answers 'not yet', which the page renders as the loader", async () => {
    const token = createPaymentReturnToken(invoiceId);

    const first = await checkPaymentReturnState(token);

    expect(first).toBe("processing");
    expect(returnView(first)).toBe("loading");
  });

  /*
    The webhook lands between two checks. The customer refreshes nothing; the
    next answer is simply different.
  */
  it("answers 'paid' on a later check, once the webhook has settled it", async () => {
    const token = createPaymentReturnToken(invoiceId);

    expect(returnView(await checkPaymentReturnState(token))).toBe("loading");

    // What the webhook does: record the payment, mark the invoice paid.
    db = seed("paid", [paidPayment]);

    const second = await checkPaymentReturnState(token);
    expect(second).toBe("paid");
    expect(returnView(second)).toBe("thanks");
  });

  /* A payment recorded while the invoice is not settled is still not a yes. */
  it("does not thank anyone on a payment row the invoice has not caught up with", async () => {
    db = seed("sent", [paidPayment]);

    expect(returnView(await checkPaymentReturnState(createPaymentReturnToken(invoiceId)))).toBe("loading");
  });
});

describe("an invoice that was already settled", () => {
  it("says so on the very first check", async () => {
    db = seed("paid", [paidPayment]);

    expect(returnView(await checkPaymentReturnState(createPaymentReturnToken(invoiceId)))).toBe("thanks");
  });
});

describe("a payment that ended badly", () => {
  it("never reports success for a failed, cancelled or expired attempt", async () => {
    for (const status of ["failed", "canceled", "expired"] as const) {
      resetRateLimits();
      db = seed("sent", [
        { id: "pay-1", invoice_id: invoiceId, status, paid_at: null, updated_at: "2026-09-14T18:11:05.000Z" },
      ]);

      const answer = await checkPaymentReturnState(createPaymentReturnToken(invoiceId));
      expect(answer).toBe("failed");
      expect(returnView(answer)).not.toBe("thanks");
    }
  });
});

describe("a token the check cannot verify", () => {
  it("never reports success, and reaches no database", async () => {
    const from = vi.spyOn(db, "from");
    const expired = createPaymentReturnToken(invoiceId, new Date(Date.now() - 400 * 24 * 3600 * 1000));

    for (const token of [undefined, "", "YM-F-2026-000001", invoiceId, expired, "a".repeat(600)]) {
      const answer = await checkPaymentReturnState(token);
      expect(answer).toBe("unknown");
      expect(returnView(answer)).not.toBe("thanks");
    }

    expect(from).not.toHaveBeenCalled();
  });
});

describe("the ceiling on how often it may be asked", () => {
  /*
    A limiter protects the endpoint, but it may never invent bad news: past
    the ceiling the answer is "not yet", which keeps the loader up.
  */
  it("answers 'not yet' rather than anything alarming when a caller is too fast", async () => {
    const token = createPaymentReturnToken(invoiceId);
    db = seed("paid", [paidPayment]);

    for (let call = 0; call < 121; call += 1) await checkPaymentReturnState(token);

    const answer = await checkPaymentReturnState(token);
    expect(answer).toBe("processing");
    expect(returnView(answer)).toBe("loading");
  });
});
