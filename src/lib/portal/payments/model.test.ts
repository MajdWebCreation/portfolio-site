import { describe, expect, it } from "vitest";
import { invoicePaymentBlock, needsDirectDebit, paymentContextFromRow, portalDirectDebitState } from "@/lib/portal/payments/model";

const today = "2026-10-12";

describe("the payment context", () => {
  it("reads the admin's direct debit status from dates and states", () => {
    const none = paymentContextFromRow({ mandate_on_record: false, activations: [], direct_debit_invoice_ids: [] });
    expect(none.directDebit).toBe("not_active");

    const open = paymentContextFromRow({
      mandate_on_record: false,
      activations: [{ created_at: "2026-10-10T10:00:00Z", paid_at: null, archived_at: null, mandate_status: null }],
      direct_debit_invoice_ids: [],
    });
    expect(open.directDebit).toBe("link_created");

    const pending = paymentContextFromRow({
      mandate_on_record: false,
      activations: [{ created_at: "2026-10-10T10:00:00Z", paid_at: "2026-10-10T10:05:00Z", archived_at: null, mandate_status: "pending" }],
      direct_debit_invoice_ids: ["i1"],
    });
    expect(pending).toEqual({ directDebit: "mandate_pending", directDebitInvoiceIds: ["i1"] });

    expect(paymentContextFromRow({ mandate_on_record: true, activations: [], direct_debit_invoice_ids: [] }).directDebit).toBe("active");
    expect(() => paymentContextFromRow({ mandate_on_record: false, activations: [{ created_at: "x", paid_at: null, archived_at: null, mandate_status: "bogus" }], direct_debit_invoice_ids: [] })).toThrow();
  });

  it("words it for the customer", () => {
    expect(portalDirectDebitState("link_mailed")).toBe("started");
    expect(portalDirectDebitState("link_created")).toBe("started");
    expect(portalDirectDebitState("mandate_pending")).toBe("awaiting_confirmation");
    expect(portalDirectDebitState("problem")).toBe("problem");
  });
});

describe("the pay button", () => {
  const view = (openCents: number) => ({ openCents, invoice: { id: "i1" } }) as Parameters<typeof invoicePaymentBlock>[0];
  it("appears only when something is open and no direct debit collects the invoice", () => {
    expect(invoicePaymentBlock(view(1000), { directDebitInvoiceIds: [] })).toBeUndefined();
    expect(invoicePaymentBlock(view(0), { directDebitInvoiceIds: [] })).toBe("nothing_due");
    expect(invoicePaymentBlock(view(1000), { directDebitInvoiceIds: ["i1"] })).toBe("direct_debit");
  });
});

describe("the activation button", () => {
  const waiting = { status: "awaiting_mandate" as const, collectsByDirectDebit: false };
  it("is offered while a service waits for a mandate and none is valid or on its way", () => {
    expect(needsDirectDebit([waiting], today)).toBe(true);
    expect(needsDirectDebit([{ status: "active", collectsByDirectDebit: false }], today)).toBe(true);
    expect(needsDirectDebit([{ status: "active", collectsByDirectDebit: true }], today)).toBe(false);
    expect(needsDirectDebit([{ ...waiting, endsOn: "2026-10-01" }], today)).toBe(false);
    expect(needsDirectDebit([{ status: "paused", collectsByDirectDebit: false }], today)).toBe(false);
  });
});
