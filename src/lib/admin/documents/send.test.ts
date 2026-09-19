import { beforeEach, describe, expect, it, vi } from "vitest";
import { addDays } from "@/lib/admin/documents/validation";
import { toDateKey } from "@/lib/admin/format";
import { documentFingerprint, invoiceDocument } from "@/lib/admin/documents/document-payload";
import { sha256Hex } from "@/lib/admin/invoices/artifact";
import { fakeInvoiceStorage, fixtureDocumentPath, fixturePdfBytes } from "@/lib/admin/invoices/storage-fixture";
import { invoiceFixture } from "@/lib/payments/fixtures";

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
const from = vi.fn(() => ({ update }));
const sendDocumentMail = vi.fn();
const invoicePayLink = vi.fn();
/* The monthly service this invoice switches on, when it switches one on. */
let linkedService: { startsOn?: string } | undefined;

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
  serviceActivatedBy: async () => linkedService,
}));

const { sendInvoiceToCustomer } = await import("@/lib/admin/documents/send");

/* What `invoicePayLink` really returns: a URL and the decision behind it. */
const oneoffLink = {
  kind: "link",
  // A Mollie payment link, which stays valid until it is paid; the checkout
  // URL of a Payments-API payment would be dead by the time a mail is opened.
  url: "https://payment-link.mollie.com/payment/pl_1",
  decision: { sequence: "oneoff", reason: "no-recurring-service" },
};

beforeEach(() => {
  vi.clearAllMocks();
  bucket = fakeInvoiceStorage({ [fixtureDocumentPath]: fixturePdfBytes });
  rpc.mockResolvedValue({ data: null, error: null });
  sendDocumentMail.mockResolvedValue({ sent: true, sentAt: "2026-09-12T10:00:00.000Z" });
  invoicePayLink.mockResolvedValue(oneoffLink);
  stored = invoice;
  project = undefined;
  linkedService = undefined;
});

describe("sending an invoice with a payment link", () => {
  it("puts the link in the mail", async () => {
    invoicePayLink.mockResolvedValue(oneoffLink);

    const result = await sendInvoiceToCustomer("inv-1");

    expect(result).toEqual({ ok: true, value: "YM-F-2026-000001" });
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
describe("sending an invoice that switches a monthly service on", () => {
  const firstLink = {
    kind: "link",
    url: "https://payment-link.mollie.com/payment/pl_1",
    decision: {
      sequence: "first",
      reason: "needs-mandate",
      service: {
        id: "svc-1",
        customerId: "cust-1",
        name: "Websitebeheer",
        amountCents: 2500,
        vatRate: 21,
        startsOn: "2026-10-01",
        status: "draft",
        mollie: {},
      },
    },
  };

  beforeEach(() => {
    stored = invoiceFixture({
      status: "issued",
      sentAt: undefined,
      recipientEmail: undefined,
      projectId: "proj-1",
      activationNote: {
        serviceId: "svc-1",
        serviceName: "Websitebeheer",
        monthlyNetCents: 2500,
        monthlyGrossCents: 3025,
        firstDebitOn: "2026-10-01",
      },
    });
    project = { id: "proj-1", name: "Website Alfa BV" };
  });

  it("tells the mail what is being activated, net and gross", async () => {
    invoicePayLink.mockResolvedValue(firstLink);

    await sendInvoiceToCustomer("inv-1");

    expect(sendDocumentMail).toHaveBeenCalledWith(
      expect.objectContaining({
        projectName: "Website Alfa BV",
        activates: {
          serviceName: "Websitebeheer",
          monthlyNetCents: 2500,
          // 25,00 + 21%, through the same VAT code the invoice uses.
          monthlyGrossCents: 3025,
          invoiceNetCents: 10000,
          firstDebitOn: "2026-10-01",
          projectSummary: "Website Alfa BV",
        },
      }),
    );
  });

  /*
    A customer who already authorised us gets an ordinary one-off payment --
    but the document in their hand announces the mandate, because that is what
    it said when it was issued. Sending one while doing the other is the one
    thing that may not happen quietly.
  */
  it("refuses to send when the payment no longer establishes the mandate the document announces", async () => {
    invoicePayLink.mockResolvedValue({
      ...firstLink,
      decision: { ...firstLink.decision, sequence: "oneoff", reason: "mandate-already-given" },
    });

    const result = await sendInvoiceToCustomer("inv-1");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("Annuleer deze factuur");
    expect(sendDocumentMail).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  /* And the other way round: a mandate nobody wrote down. */
  it("refuses to send when the payment would establish a mandate the document does not mention", async () => {
    stored = invoiceFixture({ status: "issued", sentAt: undefined, recipientEmail: undefined, projectId: "proj-1" });
    invoicePayLink.mockResolvedValue(firstLink);

    const result = await sendInvoiceToCustomer("inv-1");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("staat niet op de definitieve factuur");
    expect(sendDocumentMail).not.toHaveBeenCalled();
  });

  it("says nothing about a monthly service on an invoice that was issued without a note", async () => {
    stored = invoiceFixture({ status: "issued", sentAt: undefined, recipientEmail: undefined, projectId: "proj-1" });
    invoicePayLink.mockResolvedValue({
      ...firstLink,
      decision: { ...firstLink.decision, sequence: "oneoff", reason: "mandate-already-given" },
    });

    await sendInvoiceToCustomer("inv-1");

    const [args] = sendDocumentMail.mock.calls[0] as [{ activates?: unknown; projectName?: string }];
    expect(args.activates).toBeUndefined();
    expect(args.projectName).toBe("Website Alfa BV");
  });
});

/*
  The fourteen days are counted from the day the invoice actually goes out.
  This mail is the announcement of the first collection, so a date it could
  not announce in time stops the send instead of going out as a promise that
  cannot be kept.
*/
describe("the first collection date at the moment of sending", () => {
  // The same calendar the server judges by, so the boundary is exact rather
  // than a day out for a test that runs late in the evening.
  const days = (count: number) => addDays(toDateKey(new Date()), count);

  it("refuses to send when the first collection is thirteen days away", async () => {
    linkedService = { startsOn: days(13) };

    const result = await sendInvoiceToCustomer("inv-1");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("minder dan 14 dagen");
    expect(invoicePayLink).not.toHaveBeenCalled();
    expect(sendDocumentMail).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("sends when the first collection is fourteen days away", async () => {
    linkedService = { startsOn: days(14) };

    const result = await sendInvoiceToCustomer("inv-1");

    expect(result).toEqual({ ok: true, value: "YM-F-2026-000001" });
    expect(sendDocumentMail).toHaveBeenCalledTimes(1);
  });

  it("leaves an invoice without a monthly service alone", async () => {
    linkedService = undefined;

    const result = await sendInvoiceToCustomer("inv-1");

    expect(result).toEqual({ ok: true, value: "YM-F-2026-000001" });
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

    expect(result).toEqual({ ok: true, value: "YM-F-2026-000001" });
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
