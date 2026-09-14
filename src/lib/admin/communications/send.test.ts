import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/lib/payments/fixtures";
import type { CommunicationClient } from "@/lib/admin/communications/log";

/*
  The one door out, on its own.

  Two rules are being pinned down here, and they are the reason the helper
  exists at all: a mail that went out is always written down, and a mail that
  did not go out is never written down. Everything else -- which flow called
  it, what the body said -- is the caller's business.
*/
const deliverEmail = vi.fn();

vi.mock("@/lib/admin/communications/provider", () => ({
  deliverEmail: (...args: unknown[]) => deliverEmail(...args),
}));

const { sendCustomerEmail } = await import("@/lib/admin/communications/send");

const message = {
  to: "a@example.com",
  subject: "Factuur voor Website Alfa BV",
  html: "<p>Beste A. Alfa</p>",
  text: "Beste A. Alfa",
};

let fake: ReturnType<typeof createFakeDb>;

function context(overrides: Record<string, unknown> = {}) {
  return {
    db: fake as unknown as CommunicationClient,
    customerId: "cust-1",
    category: "invoice_sent" as const,
    ...overrides,
  };
}

const rows = () => fake.rows("customer_communications");

beforeEach(() => {
  vi.clearAllMocks();
  fake = createFakeDb();
  deliverEmail.mockResolvedValue({ sent: true, sentAt: "2026-09-14T09:00:00.000Z", messageId: "resend-1" });
});

describe("a mail that was accepted", () => {
  it("leaves exactly one communication behind", async () => {
    const result = await sendCustomerEmail(message, context());

    expect(result).toMatchObject({ sent: true, sentAt: "2026-09-14T09:00:00.000Z", messageId: "resend-1" });
    expect(rows()).toHaveLength(1);
  });

  /* The id of the row it wrote, so a caller keeping its own record of the
     send can point at the same communication instead of describing it twice. */
  it("reports which communication it wrote", async () => {
    const result = await sendCustomerEmail(message, context());

    expect(result.sent && result.communicationId).toBe(rows()[0].id);
  });

  /* A log that could not be written must not invent an id. */
  it("reports no communication when the log write failed", async () => {
    const broken = {
      from: () => ({
        insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: { message: "nope" } }) }) }),
      }),
    } as unknown as CommunicationClient;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendCustomerEmail(message, context({ db: broken }));

    expect(result.sent).toBe(true);
    expect(result.sent && result.communicationId).toBeUndefined();
    error.mockRestore();
  });

  it("writes down what was sent, to whom, and what the provider called it", async () => {
    await sendCustomerEmail(message, context({ invoiceId: "inv-1", projectId: "proj-1" }));

    expect(rows()[0]).toMatchObject({
      customer_id: "cust-1",
      channel: "email",
      direction: "outbound",
      category: "invoice_sent",
      recipient: "a@example.com",
      subject: "Factuur voor Website Alfa BV",
      body_text: "Beste A. Alfa",
      body_html: "<p>Beste A. Alfa</p>",
      status: "sent",
      provider_message_id: "resend-1",
      sent_at: "2026-09-14T09:00:00.000Z",
      invoice_id: "inv-1",
      project_id: "proj-1",
    });
  });

  /* A link nobody supplied is absent, not an empty string pretending to be one. */
  it("leaves out the links the caller did not give", async () => {
    await sendCustomerEmail(message, context({ invoiceId: "inv-1" }));

    const row = rows()[0];
    expect(row.quote_id).toBeUndefined();
    expect(row.project_id).toBeUndefined();
    expect(row.recurring_service_id).toBeUndefined();
  });

  /*
    Resending the same invoice is a second mail in the customer's inbox, so it
    is a second row here. Nothing is updated in place: a history that collapses
    two sends into one is telling the admin something that did not happen.
  */
  it("adds a second row when the same mail is sent again", async () => {
    deliverEmail.mockResolvedValueOnce({ sent: true, sentAt: "2026-09-14T09:00:00.000Z", messageId: "resend-1" });
    deliverEmail.mockResolvedValueOnce({ sent: true, sentAt: "2026-09-14T11:30:00.000Z", messageId: "resend-2" });

    await sendCustomerEmail(message, context({ invoiceId: "inv-1" }));
    await sendCustomerEmail(message, context({ invoiceId: "inv-1" }));

    expect(rows()).toHaveLength(2);
    expect(rows().map((row) => row.provider_message_id)).toEqual(["resend-1", "resend-2"]);
    expect(rows().map((row) => row.sent_at)).toEqual(["2026-09-14T09:00:00.000Z", "2026-09-14T11:30:00.000Z"]);
  });

  it("carries no provider id when the provider gave none", async () => {
    deliverEmail.mockResolvedValue({ sent: true, sentAt: "2026-09-14T09:00:00.000Z" });

    await sendCustomerEmail(message, context());

    expect(rows()[0].provider_message_id).toBeUndefined();
  });
});

describe("a mail that never left", () => {
  it("writes nothing when the provider refuses it", async () => {
    deliverEmail.mockResolvedValue({ sent: false, reason: "Invalid recipient", failure: "rejected" });

    const result = await sendCustomerEmail(message, context());

    expect(result).toEqual({ sent: false, reason: "Invalid recipient", failure: "rejected" });
    expect(rows()).toHaveLength(0);
  });

  it("writes nothing when the provider call fails outright", async () => {
    deliverEmail.mockResolvedValue({ sent: false, reason: "fetch failed", failure: "error" });

    await sendCustomerEmail(message, context());

    expect(rows()).toHaveLength(0);
  });

  it("writes nothing when the mail is not configured at all", async () => {
    deliverEmail.mockResolvedValue({ sent: false, reason: "Mailconfiguratie ontbreekt", failure: "config" });

    await sendCustomerEmail(message, context());

    expect(rows()).toHaveLength(0);
  });
});

/*
  The customer has the mail by the time the log is written. A database that
  refuses the row is a bookkeeping problem; turning it into a failed send
  would invite the admin to send the same invoice twice.
*/
describe("a log that cannot be written", () => {
  it("does not turn a delivered mail into a failure", async () => {
    const broken = {
      from: () => ({
        insert: () => ({
          select: () => ({ maybeSingle: async () => ({ data: null, error: { message: "permission denied" } }) }),
        }),
      }),
    } as unknown as CommunicationClient;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendCustomerEmail(message, context({ db: broken }));

    expect(result.sent).toBe(true);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("survives a client that throws", async () => {
    const throwing = {
      from: () => {
        throw new Error("connection reset");
      },
    } as unknown as CommunicationClient;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendCustomerEmail(message, context({ db: throwing }));

    expect(result.sent).toBe(true);
    error.mockRestore();
  });
});
