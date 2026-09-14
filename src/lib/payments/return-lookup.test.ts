import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/lib/payments/fixtures";
import { createPaymentReturnToken } from "@/lib/payments/return-token";

/*
  Turning the `state` token in the return URL into one of four words.

  The claim being tested here is not only that the right word comes out. It is
  that a visitor who did not receive a valid token causes no query at all: the
  token is verified before an invoice id exists to look anything up with,
  which is what stops this page answering "does invoice N exist?".
*/
let db: ReturnType<typeof createFakeDb>;
let hasAccess = true;

vi.mock("@/lib/payments/admin-client", () => ({
  paymentsAdminClient: () => db,
  hasPaymentsAdminAccess: () => hasAccess,
}));

const secret = "test-payment-return-secret-value";
process.env.PAYMENT_RETURN_SECRET = secret;

const { readPaymentReturnState } = await import("@/lib/payments/return-lookup");

const invoiceId = "dd847d57-3cb1-4160-b848-2a43a53ac40f";
const sentInvoice = { id: invoiceId, number_value: "YM-F-2026-000001", status: "sent" };

function seed(invoice: Record<string, unknown> | null, payments: Record<string, unknown>[] = []) {
  return createFakeDb({ invoices: invoice ? [invoice] : [], payments });
}

beforeEach(() => {
  process.env.PAYMENT_RETURN_SECRET = secret;
  hasAccess = true;
  db = seed(sentInvoice);
});

afterEach(() => {
  process.env.PAYMENT_RETURN_SECRET = secret;
});

describe("a state that is not a token of ours", () => {
  /*
    The enumeration guard. None of these may reach the database -- not even to
    ask whether a row exists -- so `from` is spied on rather than the result
    being inspected.
  */
  it("causes no invoice query whatsoever", async () => {
    const token = createPaymentReturnToken(invoiceId);
    const raw = Buffer.from(token, "base64url");
    const tampered = Buffer.from(raw);
    tampered[20] ^= 0x01;

    const from = vi.spyOn(db, "from");

    for (const state of [
      undefined,
      "",
      "YM-F-2026-000001", // the identifier this token replaced
      "dd847d57-3cb1-4160-b848-2a43a53ac40f", // the invoice id itself
      "../../etc/passwd",
      tampered.toString("base64url"),
      token.slice(0, -4),
      "a".repeat(600),
    ]) {
      expect(await readPaymentReturnState(state)).toBe("unknown");
    }

    expect(from).not.toHaveBeenCalled();
  });

  it("causes no query for a token signed with a different secret", async () => {
    process.env.PAYMENT_RETURN_SECRET = "a-completely-different-secret";
    const foreign = createPaymentReturnToken(invoiceId);
    process.env.PAYMENT_RETURN_SECRET = secret;

    const from = vi.spyOn(db, "from");

    expect(await readPaymentReturnState(foreign)).toBe("unknown");
    expect(from).not.toHaveBeenCalled();
  });

  it("causes no query for an expired token", async () => {
    const old = new Date(Date.now() - 400 * 24 * 3600 * 1000);
    const from = vi.spyOn(db, "from");

    expect(await readPaymentReturnState(createPaymentReturnToken(invoiceId, old))).toBe("unknown");
    expect(from).not.toHaveBeenCalled();
  });
});

describe("a valid token", () => {
  it("knows nothing when it names an invoice that is not there", async () => {
    db = seed(null);
    expect(await readPaymentReturnState(createPaymentReturnToken(invoiceId))).toBe("unknown");
  });

  /* Without the system key nothing can be read, which is not a failed payment. */
  it("knows nothing when the read is not configured", async () => {
    hasAccess = false;
    expect(await readPaymentReturnState(createPaymentReturnToken(invoiceId))).toBe("unknown");
  });

  it("confirms a paid invoice", async () => {
    db = seed({ ...sentInvoice, status: "paid" }, [
      { id: "pay-1", invoice_id: invoiceId, status: "paid", paid_at: "2026-09-14T18:11:05.000Z", updated_at: "2026-09-14T18:11:05.000Z" },
    ]);
    expect(await readPaymentReturnState(createPaymentReturnToken(invoiceId))).toBe("paid");
  });

  /* The redirect arriving before the webhook: the ordinary case. */
  it("reports processing when no payment has been recorded yet", async () => {
    expect(await readPaymentReturnState(createPaymentReturnToken(invoiceId))).toBe("processing");
  });

  it("reports a failure when the last attempt ended badly", async () => {
    db = seed(sentInvoice, [
      { id: "pay-1", invoice_id: invoiceId, status: "canceled", paid_at: null, updated_at: "2026-09-14T18:11:05.000Z" },
    ]);
    expect(await readPaymentReturnState(createPaymentReturnToken(invoiceId))).toBe("failed");
  });

  /* Another invoice's failed attempt must not colour this one's answer. */
  it("only looks at the payments of this invoice", async () => {
    db = seed(sentInvoice, [
      { id: "pay-2", invoice_id: "inv-other", status: "failed", paid_at: null, updated_at: "2026-09-14T18:11:05.000Z" },
    ]);
    expect(await readPaymentReturnState(createPaymentReturnToken(invoiceId))).toBe("processing");
  });

  it("falls back to knowing nothing when the database cannot be read", async () => {
    db = { from: () => { throw new Error("connection refused"); } } as unknown as ReturnType<typeof createFakeDb>;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await readPaymentReturnState(createPaymentReturnToken(invoiceId))).toBe("unknown");

    logged.mockRestore();
  });
});
