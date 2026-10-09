import { beforeEach, describe, expect, it, vi } from "vitest";
import { documentFingerprint, invoiceDocument } from "@/lib/admin/documents/document-payload";
import { sha256Hex } from "@/lib/admin/invoices/artifact";
import { fakeInvoiceStorage, fixtureDocumentPath, fixturePdfBytes } from "@/lib/admin/invoices/storage-fixture";
import { createFakeDb, customerRowFixture, invoiceFixture } from "@/lib/payments/fixtures";

/*
  Sending an invoice, with the database, the PDF renderer, the mailer and the
  payment provider all replaced. What is under test is the order of the steps:
  a pay-by-link that cannot be made must stop the mail, not be swallowed.

  Everything here starts from a document that was already made definitive --
  numbered, issued, not yet sent. That is the only state this action accepts
  now; issuing is `finalizeInvoice`, and sending composes nothing.
*/
const invoice = invoiceFixture({ status: "issued", sentAt: undefined, recipientEmail: undefined });
/* Swapped per test, so one harness serves the plain and the activating case. */
let stored = invoice;
/* The bucket this deployment's PDFs live in, in memory. */
let bucket = fakeInvoiceStorage();
let project: { id: string; name: string } | undefined;

const rpc = vi.fn();
type QueryResult = { error: { message: string } | null };
const update = vi.fn<(row: Record<string, unknown>) => { eq: (...args: string[]) => Promise<QueryResult> }>(() => ({
  eq: async () => ({ error: null }),
}));
/* The customer record the mail is addressed from; swapped per test. */
let customers = createFakeDb({ customers: [customerRowFixture()] });
const from = vi.fn((table: string) => (table === "customers" ? customers.from(table) : { update }));
const sendDocumentMail = vi.fn();
const invoicePayLink = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/db")>()),
  adminDb: async () => ({ from, rpc, storage: bucket.storage }),
}));
vi.mock("@/lib/admin/invoices/repository", () => ({ getInvoice: async () => stored }));
vi.mock("@/lib/admin/projects/repository", () => ({ getProject: async () => project }));
vi.mock("@/lib/admin/quotes/repository", () => ({ getQuote: async () => undefined }));
/* Typed as the flow calls it, so the test can read back the invoice it rendered. */
const renderInvoicePdf = vi.fn<(invoice: unknown, activates?: unknown) => Promise<Buffer>>(async () => Buffer.from("pdf"));
vi.mock("@/lib/admin/pdf/to-buffer", () => ({
  renderInvoicePdf: (invoice: unknown, activates?: unknown) => renderInvoicePdf(invoice, activates),
  renderQuotePdf: async () => Buffer.from("pdf"),
  documentFileName: (value: string) => `${value}.pdf`,
}));
vi.mock("@/lib/admin/documents/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/documents/email")>()),
  sendDocumentMail: (...args: unknown[]) => sendDocumentMail(...args),
}));
vi.mock("@/lib/payments/pay-link", () => ({
  invoicePayLink: (...args: unknown[]) => invoicePayLink(...args),
}));

const { sendInvoiceToCustomer } = await import("@/lib/admin/documents/send");

/* What `invoicePayLink` really returns: a URL, always a one-off payment link. */
const oneoffLink = {
  kind: "link",
  // A Mollie payment link, which stays valid until it is paid; the checkout
  // URL of a Payments-API payment would be dead by the time a mail is opened.
  url: "https://payment-link.mollie.com/payment/pl_1",
};

beforeEach(() => {
  vi.clearAllMocks();
  bucket = fakeInvoiceStorage({ [fixtureDocumentPath]: fixturePdfBytes });
  rpc.mockResolvedValue({ data: null, error: null });
  sendDocumentMail.mockResolvedValue({ sent: true, sentAt: "2026-09-12T10:00:00.000Z" });
  invoicePayLink.mockResolvedValue(oneoffLink);
  stored = invoice;
  project = undefined;
  customers = createFakeDb({ customers: [customerRowFixture()] });
});

describe("sending an invoice with a payment link", () => {
  it("puts the link in the mail", async () => {
    invoicePayLink.mockResolvedValue(oneoffLink);

    const result = await sendInvoiceToCustomer("inv-1");

    expect(result).toEqual({ ok: true, value: { number: "YM-F-2026-000001", recipient: "a@example.com" } });
    const [args] = sendDocumentMail.mock.calls[0] as [{ payUrl?: string }];
    expect(args.payUrl).toBe("https://payment-link.mollie.com/payment/pl_1");
    // Never the short-lived checkout URL of a single payment attempt.
    expect(args.payUrl).not.toContain("pay.mollie.com");
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

/*
  The invoice that also authorises a monthly collection. The send flow reads
  the service off the decision the pay-link made, so the mail and the PDF
  cannot disagree with the payment about what is being switched on.
*/
/*
  An invoice issued before direct debit was split off from invoices may carry
  a frozen note: "paying this invoice also authorises the monthly collection".
  That is no longer what paying does, so such a document is not mailed -- and
  nothing about it reaches Mollie.
*/
describe("an invoice that still promises direct debit", () => {
  beforeEach(() => {
    stored = invoiceFixture({
      status: "issued",
      sentAt: undefined,
      recipientEmail: undefined,
      activationNote: {
        serviceId: "svc-1",
        serviceName: "Websitebeheer",
        monthlyNetCents: 2500,
        monthlyGrossCents: 3025,
        firstDebitOn: "2026-10-01",
      },
    });
  });

  it("is refused before a payment link is made", async () => {
    const result = await sendInvoiceToCustomer("inv-1");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("aparte activatielink");
    expect(invoicePayLink).not.toHaveBeenCalled();
    expect(sendDocumentMail).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("an ordinary invoice", () => {
  it("is filed as an invoice and says nothing about a monthly service", async () => {
    project = { id: "proj-1", name: "Website Alfa BV" };
    stored = invoiceFixture({ status: "issued", sentAt: undefined, recipientEmail: undefined, projectId: "proj-1" });

    await sendInvoiceToCustomer("inv-1");

    const [args] = sendDocumentMail.mock.calls[0] as [{ activates?: unknown; projectName?: string; log: { category: string } }];
    expect(args.activates).toBeUndefined();
    expect(args.log.category).toBe("invoice_sent");
    expect(args.projectName).toBe("Website Alfa BV");
  });
});

/*
  What sending is allowed to change about the document: nothing, and that now
  includes the file. The PDF was rendered once when the invoice was made
  definitive and stored; sending reads those bytes back, checks them against
  the recorded SHA-256 and attaches them.
*/
describe("sending a definitive invoice", () => {
  /** Every column written to `invoices` during the send, in order. */
  const written = () => update.mock.calls.map(([row]) => row);
  /** What the mail was told. */
  const mailed = () =>
    sendDocumentMail.mock.calls[0]?.[0] as { number: string; paymentReference?: string; pdf: Buffer };

  it("issues no number and touches nothing but the send fields", async () => {
    const result = await sendInvoiceToCustomer("inv-1");

    expect(result).toEqual({ ok: true, value: { number: "YM-F-2026-000001", recipient: "a@example.com" } });
    // Neither numbering nor any other RPC is called any more.
    expect(rpc).not.toHaveBeenCalled();
    expect(written()).toEqual([
      { status: "sent", sent_at: "2026-09-12T10:00:00.000Z", recipient_email: "a@example.com" },
    ]);
  });

  /*
    The claim, as an assertion: the attachment is the stored object, byte for
    byte, and no renderer ran to produce it.
  */
  it("attaches the stored file itself and renders nothing", async () => {
    await sendInvoiceToCustomer("inv-1");

    expect(renderInvoicePdf).not.toHaveBeenCalled();
    expect(bucket.downloads).toEqual([fixtureDocumentPath]);
    expect(Buffer.from(mailed().pdf).equals(fixturePdfBytes)).toBe(true);
    expect(sha256Hex(mailed().pdf)).toBe(stored.document!.sha256);
  });

  it("mails the reference the document was issued with", async () => {
    stored = invoiceFixture({ status: "issued", sentAt: undefined, recipientEmail: undefined, paymentReference: "PO-4417" });

    await sendInvoiceToCustomer("inv-1");

    expect(mailed().paymentReference).toBe("PO-4417");
    expect(mailed().number).toBe("YM-F-2026-000001");
    expect(written().some((row) => "payment_reference" in row)).toBe(false);
  });

  /* A concept has no document to send; it has a step to take first. */
  it("refuses a concept outright", async () => {
    stored = invoiceFixture({
      status: "draft",
      number: { value: "FAC-CONCEPT-QLJB5", provisional: true },
      paymentReference: "FAC-CONCEPT-OUSHO",
      finalizingAt: undefined,
      issuedAt: undefined,
      document: undefined,
      sentAt: undefined,
      recipientEmail: undefined,
    });

    const result = await sendInvoiceToCustomer("inv-1");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("Maak hem eerst definitief");
    expect(renderInvoicePdf).not.toHaveBeenCalled();
    expect(invoicePayLink).not.toHaveBeenCalled();
    expect(sendDocumentMail).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  /* Numbered, but the PDF never got stored: finish that, do not send. */
  it("refuses an invoice whose finalization never finished", async () => {
    stored = invoiceFixture({
      status: "draft",
      issuedAt: undefined,
      document: undefined,
      sentAt: undefined,
      recipientEmail: undefined,
    });

    const result = await sendInvoiceToCustomer("inv-1");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("niet afgerond");
    expect(sendDocumentMail).not.toHaveBeenCalled();
  });

  /* No file behind the record: never a freshly rendered stand-in. */
  it("refuses when the stored file is gone", async () => {
    bucket.files.clear();

    const result = await sendInvoiceToCustomer("inv-1");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("niet worden gelezen");
    expect(renderInvoicePdf).not.toHaveBeenCalled();
    expect(sendDocumentMail).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  /* Bytes that no longer hash to what was recorded are not this document. */
  it("refuses when the stored file does not match its checksum", async () => {
    bucket.files.set(fixtureDocumentPath, Buffer.from("%PDF-1.7 something else\n"));

    const result = await sendInvoiceToCustomer("inv-1");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("controlesom");
    expect(sendDocumentMail).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  /*
    The fingerprint the screen rendered is handed back with the request. It
    matching means the row the admin looked at and the row being sent are the
    same; the artifact hash then says the same of the file.
  */
  it("sends when the screen's fingerprint matches the stored document", async () => {
    const result = await sendInvoiceToCustomer("inv-1", documentFingerprint(invoiceDocument(stored)));

    expect(result.ok).toBe(true);
    expect(sendDocumentMail).toHaveBeenCalledTimes(1);
  });

  it("refuses when it does not", async () => {
    const other = invoiceDocument(invoiceFixture({ status: "issued", netCents: 99900 }));

    const result = await sendInvoiceToCustomer("inv-1", documentFingerprint(other));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("andere versie");
    expect(sendDocumentMail).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  /* Resending hands over the same file; nothing is made again. */
  it("resends the identical file", async () => {
    stored = invoiceFixture({ paymentReference: "YM-F-2026-000001" });

    await sendInvoiceToCustomer("inv-1");
    const first = Buffer.from(mailed().pdf);
    sendDocumentMail.mockClear();
    await sendInvoiceToCustomer("inv-1");
    const second = Buffer.from(mailed().pdf);

    expect(first.equals(second)).toBe(true);
    expect(first.equals(fixturePdfBytes)).toBe(true);
    expect(renderInvoicePdf).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
