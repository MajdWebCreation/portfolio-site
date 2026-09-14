import { beforeEach, describe, expect, it, vi } from "vitest";
import { addDays } from "@/lib/admin/documents/validation";
import { calculateTotals } from "@/lib/money";
import { reminderFeeCents } from "@/lib/payments/collection-policy";
import { createFakeDb } from "@/lib/payments/fixtures";

/*
  The whole thing, end to end: the cron route, the store against a database,
  the real runner, the real mail builders and the real communication log --
  with only the provider and the payment link replaced.

  This is where the two promises that span the system are checked: every
  reminder that goes out lands on the customer's record, and the announced
  fee exists nowhere but in one sentence of one mail.
*/
const deliverEmail = vi.fn();
const reminderPayLink = vi.fn();

let db: ReturnType<typeof createFakeDb>;

vi.mock("@/lib/payments/admin-client", () => ({
  paymentsAdminClient: () => db,
  hasPaymentsAdminAccess: () => true,
}));
vi.mock("@/lib/admin/communications/provider", () => ({
  deliverEmail: (...args: unknown[]) => deliverEmail(...args),
}));
vi.mock("@/lib/payments/pay-link", () => ({
  reminderPayLink: (...args: unknown[]) => reminderPayLink(...args),
}));

const { POST: runCron } = await import("@/app/api/cron/payment-reminders/route");

const due = "2026-10-01";
const day = (n: number) => addDays(due, n);

const snapshot = {
  customer_id: "cust-1",
  customer_company_name: "Alfa BV",
  customer_contact_name: "A. Alfa",
  customer_email: "a@example.com",
  customer_street: "Straat 1",
  customer_postal_code: "1011 AA",
  customer_city: "Amsterdam",
  customer_country: "Nederland",
  customer_kvk_number: null,
  customer_vat_number: null,
};

function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    number_value: "YM-F-2026-000001",
    number_provisional: false,
    status: "sent",
    ...snapshot,
    project_id: null,
    recurring_service_id: null,
    billing_period_start: null,
    billing_period_end: null,
    issue_date: "2026-09-17",
    due_date: due,
    payment_reference: "YM-F-2026-000001",
    notes: "",
    quote_id: null,
    sent_at: "2026-09-17T09:00:00.000Z",
    recipient_email: "a@example.com",
    created_at: "2026-09-17T09:00:00.000Z",
    updated_at: "2026-09-17T09:00:00.000Z",
    invoice_lines: [
      { id: "l1", position: 0, description: "Website", quantity_hundredths: 100, unit_price_cents: 150000, vat_rate: 21 },
    ],
    ...overrides,
  };
}

const customerRow = { id: "cust-1", contact_name: "A. Alfa", email: "a@example.com" };

async function run(todayKey: string) {
  vi.setSystemTime(new Date(`${todayKey}T08:00:00+02:00`));
  const response = await runCron(
    new Request("https://ymcreations.com/api/cron/payment-reminders", {
      method: "POST",
      headers: { authorization: "Bearer test-secret" },
    }),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { sent: number; skipped: number; collectionReady: string[] };
}

const events = () => db.rows("invoice_collection_events");
const comms = () => db.rows("customer_communications");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  process.env.CRON_SECRET = "test-secret";
  db = createFakeDb({ invoices: [invoiceRow()], customers: [customerRow] });
  deliverEmail.mockResolvedValue({ sent: true, sentAt: "2026-10-02T06:00:00.000Z", messageId: "resend-1" });
  reminderPayLink.mockResolvedValue("https://payment-link.mollie.com/payment/pl_1");
});

describe("an ordinary website invoice", () => {
  it("gets one reminder on day 1, recorded twice: as an event and as a communication", async () => {
    const summary = await run(day(1));

    expect(summary.sent).toBe(1);
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({
      invoice_id: "inv-1",
      customer_id: "cust-1",
      stage: "first_reminder",
      days_overdue: 1,
      status: "sent",
      recipient: "a@example.com",
      subject: "Herinnering voor je openstaande factuur",
    });

    expect(comms()).toHaveLength(1);
    expect(comms()[0]).toMatchObject({
      customer_id: "cust-1",
      category: "payment_reminder_first",
      invoice_id: "inv-1",
      recipient: "a@example.com",
      subject: "Herinnering voor je openstaande factuur",
      status: "sent",
    });
  });

  /* The event points at the communication, so the two can never be read as
     two different sends. */
  it("links the reminder event to the communication it produced", async () => {
    await run(day(1));

    expect(events()[0].communication_id).toBe(comms()[0].id);
  });

  it("does nothing at all on a second run of the same day", async () => {
    await run(day(1));
    const second = await run(day(1));

    expect(second.sent).toBe(0);
    expect(events()).toHaveLength(1);
    expect(comms()).toHaveLength(1);
    expect(deliverEmail).toHaveBeenCalledTimes(1);
  });

  it("walks the whole ladder and stops after the final notice", async () => {
    for (const n of [1, 2, 7, 8, 14, 15, 21, 30]) await run(day(n));

    expect(events()).toHaveLength(3);
    expect(events().map((row) => row.stage)).toEqual(["first_reminder", "second_reminder", "final_notice"]);
    expect(comms().map((row) => row.category)).toEqual([
      "payment_reminder_first",
      "payment_reminder_second",
      "payment_final_notice",
    ]);
  });

  it("reports collection-ready on day 21 and hands nothing over", async () => {
    for (const n of [1, 7, 14]) await run(day(n));
    const summary = await run(day(21));

    expect(summary.collectionReady).toEqual(["inv-1"]);
    expect(summary.sent).toBe(0);
    expect(events()).toHaveLength(3);
    /* Nothing anywhere records a hand-over: that is a decision for a person. */
    expect(db.rows("invoice_collections")).toHaveLength(0);
  });
});

describe("a monthly invoice whose direct debit failed", () => {
  beforeEach(() => {
    db = createFakeDb({
      invoices: [invoiceRow({ recurring_service_id: "svc-1", billing_period_start: "2026-10-01", billing_period_end: "2026-10-31" })],
      customers: [customerRow],
      recurring_services: [{ id: "svc-1", customer_id: "cust-1", status: "active" }],
      payments: [
        {
          id: "pay-1",
          invoice_id: "inv-1",
          customer_id: "cust-1",
          amount_cents: 181500,
          currency: "EUR",
          status: "failed",
          source: "mollie",
          provider_payment_id: "tr_1",
          method: "directdebit",
          paid_at: null,
          description: "Maandtermijn",
          created_at: "2026-10-01T06:00:00.000Z",
          updated_at: "2026-10-01T06:00:00.000Z",
        },
      ],
    });
  });

  /* Same engine, same stages, same categories as any other invoice. */
  it("enters the ordinary ladder on day 1", async () => {
    const summary = await run(day(1));

    expect(summary.sent).toBe(1);
    expect(events()[0]).toMatchObject({ stage: "first_reminder", status: "sent" });
    expect(comms()[0]).toMatchObject({
      category: "payment_reminder_first",
      invoice_id: "inv-1",
      recurring_service_id: "svc-1",
    });
  });

  it("is left alone while the collection is still running", async () => {
    db.rows("payments")[0].status = "pending";

    const summary = await run(day(1));

    expect(summary.sent).toBe(0);
    expect(events()).toHaveLength(0);
    expect(comms()).toHaveLength(0);
  });
});

describe("a send the provider refuses", () => {
  it("records no communication and retries the same stage tomorrow", async () => {
    deliverEmail.mockResolvedValueOnce({ sent: false, reason: "Invalid recipient", failure: "rejected" });

    await run(day(1));
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({ status: "failed", error: "Invalid recipient" });
    expect(comms()).toHaveLength(0);

    await run(day(2));
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({ stage: "first_reminder", status: "sent" });
    expect(comms()).toHaveLength(1);
  });
});

describe("invoices the run must not touch", () => {
  it.each([
    { what: "een concept", patch: { status: "draft" } },
    { what: "een geannuleerde factuur", patch: { status: "cancelled" } },
    { what: "een betaalde factuur", patch: { status: "paid" } },
    { what: "een factuur die nooit verstuurd is", patch: { sent_at: null } },
  ])("sends nothing for $what", async ({ patch }) => {
    db = createFakeDb({ invoices: [invoiceRow(patch)], customers: [customerRow] });

    await run(day(9));

    expect(events()).toHaveLength(0);
    expect(comms()).toHaveLength(0);
  });

  it.each(["paused", "disputed", "payment_plan", "handed_over"])("sends nothing while %s", async (state) => {
    db = createFakeDb({
      invoices: [invoiceRow()],
      customers: [customerRow],
      invoice_collections: [{ invoice_id: "inv-1", state, note: "" }],
    });

    await run(day(9));

    expect(events()).toHaveLength(0);
    expect(comms()).toHaveLength(0);
  });
});

/*
  The promise the general terms do not yet carry. It is one sentence in one
  mail and nothing else: not on the invoice, not in the balance, not a payment,
  and not in the amount the button asks for.
*/
describe("the announced reminder fee", () => {
  it("appears in the second reminder and in nothing else the system stores", async () => {
    await run(day(1));
    await run(day(7));

    const total = calculateTotals([{ quantityHundredths: 100, unitPriceCents: 150000, vatRate: 21 }]).totalCents;

    const second = comms().find((row) => row.category === "payment_reminder_second")!;
    expect(String(second.body_text)).toContain("herinneringskosten");

    // Not on the invoice, and not in any payment.
    expect(db.rows("invoices")[0].invoice_lines).toHaveLength(1);
    expect(db.rows("payments")).toHaveLength(0);
    // The amount the customer is asked for is the invoice's own total.
    expect(String(second.body_text)).toContain(new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
    }).format(total / 100));
    // And the ladder never records a cent of it anywhere.
    for (const row of events()) {
      expect(JSON.stringify(row)).not.toContain(String(reminderFeeCents));
    }
  });
});

describe("two customers", () => {
  it("never files one customer's reminder under the other", async () => {
    db = createFakeDb({
      invoices: [
        invoiceRow(),
        invoiceRow({
          id: "inv-2",
          number_value: "YM-F-2026-000002",
          customer_id: "cust-2",
          customer_company_name: "Beta BV",
          customer_contact_name: "B. Beta",
          customer_email: "b@example.com",
          recipient_email: "b@example.com",
        }),
      ],
      customers: [customerRow, { id: "cust-2", contact_name: "B. Beta", email: "b@example.com" }],
    });

    await run(day(1));

    expect(events().map((row) => [row.invoice_id, row.customer_id, row.recipient])).toEqual([
      ["inv-1", "cust-1", "a@example.com"],
      ["inv-2", "cust-2", "b@example.com"],
    ]);
    expect(comms().map((row) => [row.invoice_id, row.customer_id, row.recipient])).toEqual([
      ["inv-1", "cust-1", "a@example.com"],
      ["inv-2", "cust-2", "b@example.com"],
    ]);
  });
});
