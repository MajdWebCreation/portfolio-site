import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoiceFixture } from "@/lib/payments/fixtures";

/*
  Sending an invoice, with the database, the PDF renderer, the mailer and the
  payment provider all replaced. What is under test is the order of the steps:
  a pay-by-link that cannot be made must stop the mail, not be swallowed.
*/
const invoice = invoiceFixture({ number: { value: "FAC-CONCEPT-X", provisional: true } });

const rpc = vi.fn();
const update = vi.fn(() => ({ eq: async () => ({ error: null }) }));
const from = vi.fn(() => ({ update }));
const sendDocumentMail = vi.fn();
const invoicePayLink = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/db")>()),
  adminDb: async () => ({ from, rpc }),
}));
vi.mock("@/lib/admin/invoices/repository", () => ({ getInvoice: async () => invoice }));
vi.mock("@/lib/admin/quotes/repository", () => ({ getQuote: async () => undefined }));
vi.mock("@/lib/admin/pdf/to-buffer", () => ({
  renderInvoicePdf: async () => Buffer.from("pdf"),
  renderQuotePdf: async () => Buffer.from("pdf"),
  documentFileName: (value: string) => `${value}.pdf`,
}));
vi.mock("@/lib/admin/documents/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/documents/email")>()),
  sendDocumentMail: (...args: unknown[]) => sendDocumentMail(...args),
}));
vi.mock("@/lib/payments/pay-link", () => ({ invoicePayLink: (...args: unknown[]) => invoicePayLink(...args) }));

const { sendInvoiceToCustomer } = await import("@/lib/admin/documents/send");

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: "YM-F-2026-000001", error: null });
  sendDocumentMail.mockResolvedValue({ sent: true, sentAt: "2026-09-12T10:00:00.000Z" });
});

describe("sending an invoice with a payment link", () => {
  it("puts the link in the mail", async () => {
    invoicePayLink.mockResolvedValue({ kind: "link", url: "https://pay.mollie.com/tr_1" });

    const result = await sendInvoiceToCustomer("inv-1");

    expect(result).toEqual({ ok: true, value: "YM-F-2026-000001" });
    expect(sendDocumentMail).toHaveBeenCalledWith(expect.objectContaining({ payUrl: "https://pay.mollie.com/tr_1" }));
  });

  /*
    The requirement: a failing provider must not produce a quiet mail with no
    way to pay. Nothing is sent and nothing is written, so a retry sends it
    properly.
  */
  it("refuses to send when the link could not be made", async () => {
    invoicePayLink.mockResolvedValue({ kind: "failed", reason: "Mollie 503: service unavailable" });

    const result = await sendInvoiceToCustomer("inv-1");

    expect(result).toEqual({
      ok: false,
      error: "De betaallink kon niet worden gemaakt, dus de factuur is niet verstuurd: Mollie 503: service unavailable",
    });
    expect(sendDocumentMail).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("sends without a button when Mollie is not configured at all", async () => {
    invoicePayLink.mockResolvedValue({ kind: "none", reason: "not-configured" });

    const result = await sendInvoiceToCustomer("inv-1");

    expect(result.ok).toBe(true);
    expect(sendDocumentMail).toHaveBeenCalledWith(expect.not.objectContaining({ payUrl: expect.anything() }));
  });

  /* A button beside an active mandate invites paying the same debt twice. */
  it("sends without a button for an invoice collected by direct debit", async () => {
    invoicePayLink.mockResolvedValue({ kind: "none", reason: "direct-debit" });

    const result = await sendInvoiceToCustomer("inv-1");

    expect(result.ok).toBe(true);
    expect(sendDocumentMail).toHaveBeenCalledWith(expect.not.objectContaining({ payUrl: expect.anything() }));
  });
});
