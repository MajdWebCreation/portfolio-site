import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDocumentMailBody, documentDateLabel, documentMailSubject } from "@/lib/admin/documents/email";
import { calculateTotals, formatCents } from "@/lib/money";
import type { Invoice } from "@/lib/admin/invoices/types";
import type { Quote } from "@/lib/admin/quotes/types";
import { fixtureDocumentPath, fixturePdfBytes } from "@/lib/admin/invoices/storage-fixture";
import { createFakeDb } from "@/lib/payments/fixtures";
import { invoiceFixture, testCustomer } from "@/lib/payments/fixtures";

/** A definitive invoice that has not gone out yet: what `send` now accepts. */
const issuedInvoice = (overrides: Parameters<typeof invoiceFixture>[0] = {}) =>
  invoiceFixture({ status: "issued", sentAt: undefined, recipientEmail: undefined, ...overrides });

/*
  Sending a real document, with the database, the renderer, the payment
  provider and the mailer replaced -- but with the mail flow itself, the
  central helper and the log writer all real.

  What is under test is what ends up on the customer's record: one row per
  send, filed under the right customer, the right category and the right
  document. The provider decides whether anything is written at all.
*/
const deliverEmail = vi.fn();
const invoicePayLink = vi.fn();

let db: ReturnType<typeof createFakeDb>;
let storedInvoice: Invoice;
let storedQuote: Quote | undefined;
let project: { id: string; name: string } | undefined;
let linkedService: { startsOn?: string } | undefined;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/db")>()),
  adminDb: async () => ({
    from: (table: string) => db.from(table),
    storage: db.storage,
    rpc: async (name: string) =>
      name === "assign_quote_number"
        ? { data: "YM-O-2026-000001", error: null }
        : { data: "YM-F-2026-000001", error: null },
  }),
}));
vi.mock("@/lib/admin/invoices/repository", () => ({ getInvoice: async () => storedInvoice }));
vi.mock("@/lib/admin/quotes/repository", () => ({ getQuote: async () => storedQuote }));
vi.mock("@/lib/admin/projects/repository", () => ({ getProject: async () => project }));
vi.mock("@/lib/admin/pdf/to-buffer", () => ({
  renderInvoicePdf: async () => Buffer.from("pdf"),
  renderQuotePdf: async () => Buffer.from("pdf"),
  documentFileName: (value: string) => `${value}.pdf`,
}));
vi.mock("@/lib/payments/pay-link", () => ({
  invoicePayLink: (...args: unknown[]) => invoicePayLink(...args),
  serviceActivatedBy: async () => linkedService,
}));
vi.mock("@/lib/admin/communications/provider", () => ({
  deliverEmail: (...args: unknown[]) => deliverEmail(...args),
}));

const { sendInvoiceToCustomer, sendQuoteToCustomer } = await import("@/lib/admin/documents/send");

const quoteFixture = (overrides: Partial<Quote> = {}): Quote => ({
  id: "quo-1",
  number: { value: "OFF-CONCEPT-X", provisional: true },
  status: "draft",
  customer: testCustomer,
  issueDate: "2026-09-01",
  validUntil: "2026-10-01",
  subject: "Nieuwe website",
  intro: "",
  lines: [{ id: "l1", description: "Ontwerp", quantityHundredths: 100, unitPriceCents: 150000, vatRate: 21 }],
  notes: "",
  updatedAt: "2026-09-01T10:00:00.000Z",
  ...overrides,
});

const oneoffLink = {
  kind: "link",
  url: "https://payment-link.mollie.com/payment/pl_1",
  decision: { sequence: "oneoff", reason: "no-recurring-service" },
};

const rows = () => db.rows("customer_communications");

beforeEach(() => {
  vi.clearAllMocks();
  db = createFakeDb();
  /* The document this invoice was issued with, already in its bucket. */
  db.bucket.files.set(fixtureDocumentPath, fixturePdfBytes);
  storedInvoice = issuedInvoice();
  storedQuote = quoteFixture();
  project = undefined;
  linkedService = undefined;
  invoicePayLink.mockResolvedValue(oneoffLink);
  deliverEmail.mockResolvedValue({ sent: true, sentAt: "2026-09-14T09:00:00.000Z", messageId: "resend-1" });
});

describe("sending a quote", () => {
  it("files one communication under the quote and its customer", async () => {
    storedQuote = quoteFixture({ projectId: "proj-1" });

    const result = await sendQuoteToCustomer("quo-1");

    expect(result.ok).toBe(true);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({
      customer_id: "cust-1",
      category: "quote_sent",
      quote_id: "quo-1",
      project_id: "proj-1",
      recipient: "a@example.com",
      status: "sent",
      provider_message_id: "resend-1",
    });
  });

  it("names no invoice and no service", async () => {
    await sendQuoteToCustomer("quo-1");

    expect(rows()[0].invoice_id).toBeUndefined();
    expect(rows()[0].recurring_service_id).toBeUndefined();
  });
});

describe("sending an invoice", () => {
  it("files one communication under the invoice and its customer", async () => {
    storedInvoice = issuedInvoice({ projectId: "proj-1", quoteId: "quo-1" });
    project = { id: "proj-1", name: "Website Alfa BV" };

    const result = await sendInvoiceToCustomer("inv-1");

    expect(result.ok).toBe(true);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({
      customer_id: "cust-1",
      category: "invoice_sent",
      invoice_id: "inv-1",
      quote_id: "quo-1",
      project_id: "proj-1",
    });
  });

  /*
    An invoice that also establishes the mandate is a different event from an
    ordinary invoice, and it is the only thing in the log that explains a
    mandate appearing. It names the service it switches on.
  */
  it("files an invoice that starts a monthly service under its own category", async () => {
    /*
      The document was issued with the note on it, which is what makes this
      an activation mail; the payment link agrees, as it must.
    */
    storedInvoice = issuedInvoice({
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
    invoicePayLink.mockResolvedValue({
      ...oneoffLink,
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
    });

    await sendInvoiceToCustomer("inv-1");

    expect(rows()[0]).toMatchObject({
      category: "invoice_activation_sent",
      invoice_id: "inv-1",
      recurring_service_id: "svc-1",
      project_id: "proj-1",
    });
  });

  /* Sending it again is a second mail, so it is a second row. */
  it("adds a separate communication for a second send", async () => {
    deliverEmail
      .mockResolvedValueOnce({ sent: true, sentAt: "2026-09-14T09:00:00.000Z", messageId: "resend-1" })
      .mockResolvedValueOnce({ sent: true, sentAt: "2026-09-14T14:00:00.000Z", messageId: "resend-2" });

    await sendInvoiceToCustomer("inv-1");
    await sendInvoiceToCustomer("inv-1");

    expect(rows()).toHaveLength(2);
    expect(rows().map((row) => row.provider_message_id)).toEqual(["resend-1", "resend-2"]);
    /* The first row is untouched: a log that rewrites itself is not a log. */
    expect(rows()[0].sent_at).toBe("2026-09-14T09:00:00.000Z");
  });

  /*
    The mail is stored exactly as the existing builders produce it. Compared
    against those builders rather than against a copy of the wording, so this
    stays a test that the log records the real mail and never becomes a second
    place the mail's text is written down.
  */
  it("stores the mail as it was actually sent", async () => {
    await sendInvoiceToCustomer("inv-1");

    const content = {
      kind: "invoice" as const,
      number: "YM-F-2026-000001",
      recipientEmail: "a@example.com",
      contactName: testCustomer.contactName,
      issueDateLabel: documentDateLabel(storedInvoice.issueDate),
      deadlineLabel: documentDateLabel(storedInvoice.dueDate),
      totalLabel: formatCents(calculateTotals(storedInvoice.lines).totalCents),
      pdf: new Uint8Array(),
      fileName: "YM-F-2026-000001.pdf",
      payUrl: "https://payment-link.mollie.com/payment/pl_1",
    };
    const expected = buildDocumentMailBody(content);

    expect(rows()[0].subject).toBe(documentMailSubject(content));
    expect(rows()[0].body_text).toBe(expected.text);
    expect(rows()[0].body_html).toBe(expected.html);
  });
});

describe("a send that did not happen", () => {
  it("leaves no communication when the provider refuses the mail", async () => {
    deliverEmail.mockResolvedValue({ sent: false, reason: "Invalid recipient", failure: "rejected" });

    const result = await sendInvoiceToCustomer("inv-1");

    expect(result.ok).toBe(false);
    expect(rows()).toHaveLength(0);
  });

  /* The pay link fails before the mail is built, so nothing is sent either. */
  it("leaves no communication when the invoice never got as far as the mailer", async () => {
    invoicePayLink.mockResolvedValue({ kind: "failed", reason: "Mollie 503" });

    await sendInvoiceToCustomer("inv-1");

    expect(deliverEmail).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(0);
  });

  it("still reports the send as failed to the admin", async () => {
    deliverEmail.mockResolvedValue({ sent: false, reason: "Invalid recipient", failure: "rejected" });

    const result = await sendInvoiceToCustomer("inv-1");

    expect(result).toEqual({ ok: false, error: "Versturen mislukt: Invalid recipient" });
  });
});

/*
  The customer on a communication and the customer on the document it names
  are always the same customer, because both come from the one document being
  sent. The database says so as well -- the composite foreign keys in the
  migration have no row to point at otherwise -- but nothing in the flow even
  offers it the chance.
*/
describe("two customers", () => {
  it("never files one customer's mail under another customer", async () => {
    const beta = {
      ...testCustomer,
      customerId: "cust-2",
      companyName: "Beta BV",
      contactName: "B. Beta",
      email: "b@example.com",
    };

    await sendInvoiceToCustomer("inv-1");
    storedInvoice = invoiceFixture({ id: "inv-2", number: { value: "FAC-CONCEPT-Y", provisional: true }, customer: beta });
    await sendInvoiceToCustomer("inv-2");

    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toMatchObject({ customer_id: "cust-1", invoice_id: "inv-1", recipient: "a@example.com" });
    expect(rows()[1]).toMatchObject({ customer_id: "cust-2", invoice_id: "inv-2", recipient: "b@example.com" });
  });
});
