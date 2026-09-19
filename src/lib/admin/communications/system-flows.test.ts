import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureDocumentPath, fixturePdfBytes } from "@/lib/admin/invoices/storage-fixture";
import { createFakeDb, invoiceFixture, recurringFixture } from "@/lib/payments/fixtures";
import type { InvoiceMailer } from "@/lib/payments/prenotification-runner";

/*
  The three mail flows that carry no admin session or no document of the
  admin's own making: the standalone direct debit link, the monthly term the
  customer already paid (settled by the Mollie webhook), and the daily
  pre-notification run.

  All three write to the log through the same helper the admin flows use, with
  the elevated client instead of an admin's session. What is checked here is
  that each one files its mail under the right customer, the right category
  and the right service -- because these are the flows nobody is watching when
  they run.
*/
const deliverEmail = vi.fn();
const runPrenotifications = vi.fn();

let db: ReturnType<typeof createFakeDb>;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/communications/provider", () => ({
  deliverEmail: (...args: unknown[]) => deliverEmail(...args),
}));
vi.mock("@/lib/admin/pdf/to-buffer", () => ({
  renderInvoicePdf: async () => Buffer.from("pdf"),
  renderQuotePdf: async () => Buffer.from("pdf"),
  documentFileName: (value: string) => `${value}.pdf`,
}));
vi.mock("@/lib/payments/admin-client", () => ({
  paymentsAdminClient: () => db,
  hasPaymentsAdminAccess: () => true,
}));
vi.mock("@/lib/admin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/db")>()),
  adminDb: async () => db,
}));

const service = recurringFixture({ projectId: "proj-1" });
vi.mock("@/lib/payments/repository", () => ({ getRecurringService: async () => service }));

vi.mock("@/lib/payments/prenotification-runner", () => ({
  runPrenotifications: (...args: unknown[]) => runPrenotifications(...args),
}));
vi.mock("@/lib/payments/prenotification-store", () => ({ createPrenotificationStore: () => ({}) }));

const { sendRecurringActivation } = await import("@/lib/payments/actions");
const { createWebhookStore } = await import("@/lib/payments/webhook-store");
const { POST: runCron } = await import("@/app/api/cron/debit-prenotifications/route");

const rows = () => db.rows("customer_communications");

beforeEach(() => {
  vi.clearAllMocks();
  db = createFakeDb({
    customers: [{ id: "cust-1", company_name: "Alfa BV", contact_name: "A. Alfa", email: "a@example.com" }],
  });
  /* The stored PDF of the term these flows mail; they attach it, never a new one. */
  db.bucket.files.set(fixtureDocumentPath, fixturePdfBytes);
  deliverEmail.mockResolvedValue({ sent: true, sentAt: "2026-09-14T09:00:00.000Z", messageId: "resend-1" });
});

describe("the standalone direct debit link", () => {
  it("files the mail under the customer and the service it activates", async () => {
    const result = await sendRecurringActivation("svc-1");

    expect(result.ok).toBe(true);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({
      customer_id: "cust-1",
      category: "direct_debit_activation",
      recurring_service_id: "svc-1",
      project_id: "proj-1",
      recipient: "a@example.com",
      status: "sent",
      provider_message_id: "resend-1",
    });
  });

  /* No document was sent, so nothing may claim one was. */
  it("names no invoice and no quote", async () => {
    await sendRecurringActivation("svc-1");

    expect(rows()[0].invoice_id).toBeUndefined();
    expect(rows()[0].quote_id).toBeUndefined();
  });

  it("writes nothing when the mail is refused", async () => {
    deliverEmail.mockResolvedValue({ sent: false, reason: "Invalid recipient", failure: "rejected" });

    const result = await sendRecurringActivation("svc-1");

    expect(result.ok).toBe(false);
    expect(rows()).toHaveLength(0);
  });

  /* Asking again replaces the link, and is a second mail in the inbox. */
  it("adds a separate communication each time the link is sent", async () => {
    await sendRecurringActivation("svc-1");
    await sendRecurringActivation("svc-1");

    expect(rows()).toHaveLength(2);
  });
});

describe("the monthly term the customer already paid", () => {
  const term = invoiceFixture({
    id: "inv-9",
    number: { value: "YM-F-2026-000009", provisional: false },
    recurringServiceId: "svc-1",
    billingPeriodStart: "2026-10-01",
    billingPeriodEnd: "2026-10-31",
  });

  it("files it as a settled monthly invoice, under its service", async () => {
    const store = createWebhookStore();

    const result = await store.sendSettledInvoice(term, service);

    expect(result).toEqual({ sent: true });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({
      customer_id: "cust-1",
      category: "recurring_invoice_settled",
      invoice_id: "inv-9",
      recurring_service_id: "svc-1",
      /* The invoice was not filed under a project, so the service's is used. */
      project_id: "proj-1",
    });
  });

  it("writes nothing when the mail is refused", async () => {
    deliverEmail.mockResolvedValue({ sent: false, reason: "Invalid recipient", failure: "rejected" });
    const store = createWebhookStore();

    const result = await store.sendSettledInvoice(term, service);

    expect(result).toEqual({ sent: false, reason: "Invalid recipient" });
    expect(rows()).toHaveLength(0);
  });
});

describe("the daily pre-notification run", () => {
  const term = invoiceFixture({
    id: "inv-10",
    number: { value: "YM-F-2026-000010", provisional: false },
    recurringServiceId: "svc-1",
    projectId: "proj-1",
  });

  async function runWithMailer(): Promise<void> {
    process.env.CRON_SECRET = "test-secret";
    runPrenotifications.mockImplementation(async (_store: unknown, _render: unknown, mail: InvoiceMailer) => {
      await mail({
        invoice: term,
        serviceName: "Websitebeheer",
        debitOn: "2026-10-15",
        recipientEmail: "a@example.com",
        contactName: "A. Alfa",
        pdf: new Uint8Array(),
      });
      return { considered: 1, invoicesCreated: 0, announced: 1, skipped: 0, failed: 0, problems: [] };
    });

    const response = await runCron(
      new Request("https://ymcreations.com/api/cron/debit-prenotifications", {
        method: "POST",
        headers: { authorization: "Bearer test-secret" },
      }),
    );
    expect(response.status).toBe(200);
  }

  /*
    This mail is the SEPA pre-notification. `debit_prenotifications` stays the
    record of the announcement; the log is the record that the customer was
    written to, and it says which term it was about.
  */
  it("files the monthly invoice mail as a pre-notification", async () => {
    await runWithMailer();

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({
      customer_id: "cust-1",
      category: "recurring_invoice_prenotification",
      invoice_id: "inv-10",
      recurring_service_id: "svc-1",
      project_id: "proj-1",
      recipient: "a@example.com",
      status: "sent",
    });
  });

  it("writes nothing for a term whose mail was refused", async () => {
    deliverEmail.mockResolvedValue({ sent: false, reason: "Invalid recipient", failure: "rejected" });

    await runWithMailer();

    expect(rows()).toHaveLength(0);
  });
});
