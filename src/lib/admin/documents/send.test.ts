import { beforeEach, describe, expect, it, vi } from "vitest";
import { addDays } from "@/lib/admin/documents/validation";
import { toDateKey } from "@/lib/admin/format";
import { invoiceFixture } from "@/lib/payments/fixtures";

/*
  Sending an invoice, with the database, the PDF renderer, the mailer and the
  payment provider all replaced. What is under test is the order of the steps:
  a pay-by-link that cannot be made must stop the mail, not be swallowed.
*/
const invoice = invoiceFixture({ number: { value: "FAC-CONCEPT-X", provisional: true } });
/* Swapped per test, so one harness serves the plain and the activating case. */
let stored = invoice;
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
  adminDb: async () => ({ from, rpc }),
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
  rpc.mockResolvedValue({ data: "YM-F-2026-000001", error: null });
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
    stored = invoiceFixture({ number: { value: "FAC-CONCEPT-X", provisional: true }, projectId: "proj-1" });
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
    A customer who already authorised us gets an ordinary one-off payment, so
    the mail must not claim they are authorising anything.
  */
  it("says nothing about a monthly service when the payment is an ordinary one-off", async () => {
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
  The betalingskenmerk at the moment the invoice becomes a real document.

  A concept carries an automatic FAC-CONCEPT-… reference. That string may
  never reach a customer: it is what a bank transfer is matched on, and an
  invoice numbered YM-F-2026-000001 that asks for FAC-CONCEPT-OUSHO gives the
  payment two names. What the admin typed themselves is a different matter --
  that is the customer's own purchase order, and it stays.
*/
describe("the betalingskenmerk when an invoice is sent", () => {
  const concept = (paymentReference: string) =>
    invoiceFixture({
      status: "draft",
      number: { value: "FAC-CONCEPT-QLJB5", provisional: true },
      paymentReference,
    });

  /** Every column written to `invoices` during the send, in order. */
  const written = () => update.mock.calls.map(([row]) => row);
  /** The invoice the PDF was rendered from. */
  const rendered = () => renderInvoicePdf.mock.calls[0]![0] as { paymentReference: string; number: { value: string } };
  /** What the mail was told. */
  const mailed = () => sendDocumentMail.mock.calls[0]?.[0] as { number: string; paymentReference?: string };

  it("replaces an automatic concept reference with the definitive number", async () => {
    stored = concept("FAC-CONCEPT-OUSHO");

    const result = await sendInvoiceToCustomer("inv-1");

    expect(result).toEqual({ ok: true, value: "YM-F-2026-000001" });
    expect(from).toHaveBeenCalledWith("invoices");
    expect(written()[0]).toEqual({ payment_reference: "YM-F-2026-000001" });
    // The same value in the document, the mail and the row.
    expect(rendered().paymentReference).toBe("YM-F-2026-000001");
    expect(mailed().paymentReference).toBe("YM-F-2026-000001");
    expect(mailed().number).toBe("YM-F-2026-000001");
  });

  it("gives the number to an invoice whose reference was left empty", async () => {
    stored = concept("");

    await sendInvoiceToCustomer("inv-1");

    expect(written()[0]).toEqual({ payment_reference: "YM-F-2026-000001" });
    expect(rendered().paymentReference).toBe("YM-F-2026-000001");
  });

  it("keeps a reference the admin typed", async () => {
    stored = concept("PO-4417");

    const result = await sendInvoiceToCustomer("inv-1");

    expect(result).toEqual({ ok: true, value: "YM-F-2026-000001" });
    // Nothing about the reference is written, because nothing changes.
    expect(written().some((row) => "payment_reference" in row)).toBe(false);
    expect(rendered().paymentReference).toBe("PO-4417");
    expect(rendered().number.value).toBe("YM-F-2026-000001");
    expect(mailed().paymentReference).toBe("PO-4417");
  });

  /*
    An invoice that has gone out is the document the customer holds. Its
    reference is part of it, the database refuses to move it, and a resend
    hands over the same document again.
  */
  it("leaves an invoice that was already sent exactly as it is", async () => {
    stored = invoiceFixture({
      status: "sent",
      sentAt: "2026-09-18T10:00:00.000Z",
      paymentReference: "FAC-CONCEPT-OUSHO",
    });

    const result = await sendInvoiceToCustomer("inv-1");

    expect(result.ok).toBe(true);
    expect(written().some((row) => "payment_reference" in row)).toBe(false);
    expect(rendered().paymentReference).toBe("FAC-CONCEPT-OUSHO");
  });

  /* Sending again after the reference already followed the number. */
  it("writes nothing the second time", async () => {
    stored = invoiceFixture({
      status: "draft",
      number: { value: "YM-F-2026-000001", provisional: false },
      paymentReference: "YM-F-2026-000001",
    });

    await sendInvoiceToCustomer("inv-1");

    expect(written().some((row) => "payment_reference" in row)).toBe(false);
    expect(rendered().paymentReference).toBe("YM-F-2026-000001");
  });

  /* A reference that cannot be recorded is not one to print and mail. */
  it("does not send when the reference could not be written", async () => {
    stored = concept("FAC-CONCEPT-OUSHO");
    update.mockReturnValueOnce({ eq: async () => ({ error: { message: "rls" } }) });

    const result = await sendInvoiceToCustomer("inv-1");

    expect(result.ok).toBe(false);
    expect(renderInvoicePdf).not.toHaveBeenCalled();
    expect(sendDocumentMail).not.toHaveBeenCalled();
  });

  /*
    Mollie gets no reference field of its own -- a payment link carries a
    description -- but that description must name the definitive invoice, not
    the concept it was a minute ago.
  */
  it("hands the payment link the numbered invoice", async () => {
    stored = concept("FAC-CONCEPT-OUSHO");

    await sendInvoiceToCustomer("inv-1");

    const [forLink] = invoicePayLink.mock.calls[0] as [{ number: { value: string }; paymentReference: string }];
    expect(forLink.number).toEqual({ value: "YM-F-2026-000001", provisional: false });
    expect(forLink.paymentReference).toBe("YM-F-2026-000001");
  });
});
