import { beforeEach, describe, expect, it, vi } from "vitest";
import { invalidRecipientReason } from "@/lib/admin/communications/recipient";
import { fixtureDocumentPath, fixturePdfBytes } from "@/lib/admin/invoices/storage-fixture";
import { createFakeDb, invoiceFixture, recipientFixture, recurringFixture } from "@/lib/payments/fixtures";
import type { InvoiceMailer } from "@/lib/payments/prenotification-runner";

/*
  The mail flows that carry no document of the admin's own making: the direct
  debit activation link and the daily pre-notification run.

  Both write to the log through the same helper the admin flows use, with
  the elevated client instead of an admin's session. What is checked here is
  that each one files its mail under the right customer, the right category
  and the right service -- because these are the flows nobody is watching when
  they run.
*/
const deliverEmail = vi.fn();
const runPrenotifications = vi.fn();
const createPaymentLink = vi.fn();
const getPaymentLink = vi.fn();
const listMandates = vi.fn();

vi.mock("@/lib/mollie/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mollie/client")>()),
  createPaymentLink: (...args: unknown[]) => createPaymentLink(...args),
  getPaymentLink: (...args: unknown[]) => getPaymentLink(...args),
  listMandates: (...args: unknown[]) => listMandates(...args),
}));

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

const { mailMandateActivation } = await import("@/lib/payments/actions");
const { POST: runCron } = await import("@/app/api/cron/debit-prenotifications/route");

const rows = () => db.rows("customer_communications");

beforeEach(() => {
  vi.clearAllMocks();
  db = createFakeDb({
    customers: [{ id: "cust-1", company_name: "Alfa BV", contact_name: "A. Alfa", email: "a@example.com" }],
    customer_payment_providers: [
      { id: "cpp-1", customer_id: "cust-1", provider: "mollie", provider_customer_id: "cst_1", provider_mandate_id: null },
    ],
    recurring_services: [
      { id: "svc-1", customer_id: "cust-1", name: "Websitebeheer", amount_cents: 2500, vat_rate: 21, status: "draft", mollie_subscription_id: null },
    ],
  });
  process.env.MOLLIE_API_KEY = "test_dummy";
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  listMandates.mockResolvedValue([]);
  createPaymentLink.mockResolvedValue({
    id: "pl_act",
    description: "Activeren automatische incasso",
    _links: { paymentLink: { href: "https://payment-links.mollie.com/payment/act" } },
  });
  getPaymentLink.mockResolvedValue({
    id: "pl_act",
    description: "Activeren automatische incasso",
    _links: { paymentLink: { href: "https://payment-links.mollie.com/payment/act" } },
  });
  /* The stored PDF of the term these flows mail; they attach it, never a new one. */
  db.bucket.files.set(fixtureDocumentPath, fixturePdfBytes);
  deliverEmail.mockResolvedValue({ sent: true, sentAt: "2026-09-14T09:00:00.000Z", messageId: "resend-1" });
});

describe("the direct debit activation link", () => {
  const flat = (value: string) => value.replace(/\u00a0/g, " ");

  it("files the mail under the customer, as a direct debit activation", async () => {
    const result = await mailMandateActivation("cust-1");

    expect(result).toEqual({ ok: true, value: "a@example.com" });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({
      customer_id: "cust-1",
      category: "direct_debit_activation",
      recipient: "a@example.com",
      status: "sent",
      provider_message_id: "resend-1",
    });
  });

  /* The cent is not a payment of anything, so nothing may claim it is. */
  it("names no invoice and no quote", async () => {
    await mailMandateActivation("cust-1");

    expect(rows()[0].invoice_id).toBeUndefined();
    expect(rows()[0].quote_id).toBeUndefined();
  });

  it("says what the cent is for, that it is not an invoice payment, and carries the link", async () => {
    await mailMandateActivation("cust-1");

    const { text, html } = deliverEmail.mock.calls[0][0];
    for (const body of [flat(text), flat(html)]) {
      expect(body).toContain("€ 0,01");
      expect(body).toContain("Websitebeheer (€ 30,25 per maand incl. btw)");
      expect(body).toContain("geen betaling van een factuur");
      expect(body).toContain("https://payment-links.mollie.com/payment/act");
    }
  });

  it("writes nothing when the mail is refused", async () => {
    deliverEmail.mockResolvedValue({ sent: false, reason: "Invalid recipient", failure: "rejected" });

    const result = await mailMandateActivation("cust-1");

    expect(result.ok).toBe(false);
    expect(rows()).toHaveLength(0);
  });

  /* The customer as they are now, not as any document copied them. */
  it("goes to the address on record now, greeting the contact on record now", async () => {
    Object.assign(db.rows("customers")[0], { email: "new@example.com", contact_name: "N. Nieuw" });

    const result = await mailMandateActivation("cust-1");

    expect(result).toEqual({ ok: true, value: "new@example.com" });
    expect(deliverEmail.mock.calls[0][0].to).toBe("new@example.com");
    expect(deliverEmail.mock.calls[0][0].text).toContain("Beste N. Nieuw,");
  });

  /* Refused before anything is made at Mollie: no address, no link. */
  it("makes no link and sends nothing when the customer has no usable address", async () => {
    db.rows("customers")[0].email = "geen-adres";

    const result = await mailMandateActivation("cust-1");

    expect(result).toEqual({ ok: false, error: invalidRecipientReason });
    expect(createPaymentLink).not.toHaveBeenCalled();
    expect(deliverEmail).not.toHaveBeenCalled();
  });

  /* Mailing again is a second mail, with the same link -- never a second payable one. */
  it("mails the same link again rather than making a second one", async () => {
    await mailMandateActivation("cust-1");
    await mailMandateActivation("cust-1");

    expect(rows()).toHaveLength(2);
    expect(createPaymentLink).toHaveBeenCalledTimes(1);
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
        recipient: recipientFixture(),
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
