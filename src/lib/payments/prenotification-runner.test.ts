import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Invoice } from "@/lib/admin/invoices/types";
import { calculateTotals } from "@/lib/money";
import type { BillingPeriod } from "@/lib/payments/billing-period";
import { invoiceFixture, recurringFixture } from "@/lib/payments/fixtures";
import type { ServiceSchedule } from "@/lib/payments/prenotification";
import {
  runPrenotifications,
  stalePendingMs,
  type ClaimKey,
  type InvoiceMailer,
  type PdfRenderer,
  type PrenotificationStore,
} from "@/lib/payments/prenotification-runner";
import type { RecurringService } from "@/lib/payments/types";

/**
 * The daily pass, against an in-memory store that enforces the two unique
 * keys the schema has: one invoice per (service, period), and one
 * announcement per (invoice, collection date, amount). A duplicate that
 * Postgres would refuse is refused here too.
 */
type Claim = { id: string; key: string; status: "pending" | "sent" | "failed"; claimedAt: string; messageId?: string; error?: string };

function makeStore(
  schedules: ServiceSchedule[],
  options: {
    contact?: { contactName: string; email: string } | undefined;
    raceWindow?: boolean;
    existingInvoices?: Invoice[];
  } = {},
) {
  const contact = "contact" in options ? options.contact : { contactName: "A. Alfa", email: "a@example.com" };
  const invoices = new Map<string, Invoice>((options.existingInvoices ?? []).map((invoice) => [invoice.id, invoice]));
  const claims: Claim[] = [];
  const numbersIssued: string[] = [];
  const tick = async () => {
    if (options.raceWindow) await new Promise((resolve) => setTimeout(resolve, 0));
  };

  const services = new Map<string, RecurringService>(
    schedules.map((entry) => [entry.service.id, entry.service as RecurringService]),
  );

  const periodKey = (serviceId: string, start: string) => `${serviceId}|${start}`;
  const claimKey = (key: ClaimKey) => `${key.invoiceId}|${key.debitOn}|${key.amountCents}`;

  const store: PrenotificationStore = {
    async listSchedules() {
      return schedules;
    },

    /* The unique index on (recurring_service_id, billing_period_start). */
    async ensureInvoice(service, period: BillingPeriod) {
      const existing = [...invoices.values()].find(
        (invoice) => invoice.recurringServiceId === service.id && invoice.billingPeriodStart === period.start,
      );
      if (existing) return existing;

      await tick();

      const raced = [...invoices.values()].find(
        (invoice) => invoice.recurringServiceId === service.id && invoice.billingPeriodStart === period.start,
      );
      if (raced) return raced;

      // One definitive number per invoice, from one sequence.
      const number = `YM-F-2026-${String(numbersIssued.length + 1).padStart(6, "0")}`;
      numbersIssued.push(number);
      const invoice = invoiceFixture({
        id: `inv-${periodKey(service.id, period.start)}`,
        number: { value: number, provisional: false },
        netCents: service.amountCents,
        recurringServiceId: service.id,
        billingPeriodStart: period.start,
        billingPeriodEnd: period.end,
        issueDate: "2026-09-28",
        dueDate: period.start,
        status: "sent",
      });
      invoices.set(invoice.id, invoice);
      return invoice;
    },

    async listUnsentInvoices() {
      return [...invoices.values()]
        // The real query says `.neq("status", "paid")`; so does this.
        .filter((invoice) => !invoice.sentAt && invoice.status !== "paid" && invoice.recurringServiceId)
        .flatMap((invoice) => {
          const service = services.get(invoice.recurringServiceId!);
          return service ? [{ invoice, service }] : [];
        });
    },

    async customerContact() {
      return contact;
    },

    async claim(key) {
      const id = claimKey(key);
      const before = claims.find((row) => row.key === id);
      if (before) return { claimed: false as const, existing: before };

      await tick();

      const raced = claims.find((row) => row.key === id);
      if (raced) return { claimed: false as const, existing: raced };

      const row: Claim = { id: `pre-${claims.length + 1}`, key: id, status: "pending", claimedAt: new Date().toISOString() };
      claims.push(row);
      return { claimed: true as const, id: row.id };
    },

    async markSent({ claimId, invoiceId, recipientEmail, sentAt, messageId }) {
      const row = claims.find((item) => item.id === claimId);
      if (row) {
        row.status = "sent";
        row.messageId = messageId;
      }
      const invoice = invoices.get(invoiceId);
      if (invoice) invoices.set(invoiceId, { ...invoice, sentAt, recipientEmail });
    },

    async markFailed(id, reason) {
      const row = claims.find((item) => item.id === id);
      if (row) {
        row.status = "failed";
        row.error = reason;
      }
    },
  };

  return { store, invoices, claims, numbersIssued };
}

function collecting(overrides: Parameters<typeof recurringFixture>[0] = {}, billed: string[] = ["2026-09-12"]): ServiceSchedule {
  return {
    service: recurringFixture({
      status: "active",
      startsOn: "2026-09-12",
      mollie: { subscriptionId: "sub_1" },
      ...overrides,
    }),
    billedPeriodStarts: billed,
  };
}

// Collection on 12 October, so the window opens on 28 September.
const dueDay = "2026-09-28";

let mail: InvoiceMailer;
let render: PdfRenderer;
let sent: Parameters<InvoiceMailer>[0][];
let rendered: Invoice[];

beforeEach(() => {
  sent = [];
  rendered = [];
  render = vi.fn(async (invoice) => {
    rendered.push(invoice);
    return new Uint8Array([1, 2, 3]);
  });
  mail = vi.fn(async (input) => {
    sent.push(input);
    return { sent: true as const, sentAt: "2026-09-28T07:00:00.000Z", messageId: "re_1" };
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    throw new Error("A test tried to reach the network");
  });
});

describe("fourteen days before a collection", () => {
  it("makes the invoice and mails it with the PDF", async () => {
    const { store, invoices, claims } = makeStore([collecting()]);
    const summary = await runPrenotifications(store, render, mail, dueDay);

    expect(summary).toMatchObject({ invoicesCreated: 1, announced: 1, failed: 0 });
    expect(invoices.size).toBe(1);

    const invoice = [...invoices.values()][0]!;
    expect(invoice.number.value).toBe("YM-F-2026-000001");
    expect(invoice.number.provisional).toBe(false);
    expect(invoice.billingPeriodStart).toBe("2026-10-12");
    expect(invoice.billingPeriodEnd).toBe("2026-11-11");
    expect(invoice.sentAt).toBe("2026-09-28T07:00:00.000Z");

    expect(rendered).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      serviceName: "Websitebeheer",
      debitOn: "2026-10-12",
      recipientEmail: "a@example.com",
      contactName: "A. Alfa",
    });
    expect(sent[0]?.pdf).toBeInstanceOf(Uint8Array);
    expect(claims[0]).toMatchObject({ status: "sent", messageId: "re_1" });
  });

  it("says nothing fifteen days before", async () => {
    const { store, invoices } = makeStore([collecting()]);
    const summary = await runPrenotifications(store, render, mail, "2026-09-27");

    expect(summary).toMatchObject({ invoicesCreated: 0, announced: 0 });
    expect(invoices.size).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("still sends after a missed run, once", async () => {
    const { store, invoices } = makeStore([collecting()]);
    await runPrenotifications(store, render, mail, "2026-09-29");
    await runPrenotifications(store, render, mail, "2026-09-30");

    expect(sent).toHaveLength(1);
    expect(invoices.size).toBe(1);
  });

  /* The figures in the mail come from the invoice's own lines. */
  it("bills the gross amount the subscription collects", async () => {
    const { store, invoices } = makeStore([collecting()]);
    await runPrenotifications(store, render, mail, dueDay);

    const invoice = [...invoices.values()][0]!;
    const totals = calculateTotals(invoice.lines);
    expect(totals.subtotalCents).toBe(2500);
    expect(totals.vatCents).toBe(525);
    expect(totals.totalCents).toBe(3025);
  });
});

describe("exactly one invoice per period", () => {
  it("issues one number however often the same day is run", async () => {
    const { store, invoices, claims, numbersIssued } = makeStore([collecting()]);
    for (let i = 0; i < 20; i += 1) await runPrenotifications(store, render, mail, dueDay);

    expect(invoices.size).toBe(1);
    expect(numbersIssued).toEqual(["YM-F-2026-000001"]);
    expect(claims).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  /* Not a retry: these overlap, so both decide before either has committed. */
  it("issues one invoice, one number and one mail across twenty parallel runs", async () => {
    const { store, invoices, claims, numbersIssued } = makeStore([collecting()], { raceWindow: true });
    await Promise.all(Array.from({ length: 20 }, () => runPrenotifications(store, render, mail, dueDay)));

    expect(invoices.size).toBe(1);
    expect(numbersIssued).toHaveLength(1);
    expect(claims).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("bills the next month separately", async () => {
    const { store, invoices, numbersIssued } = makeStore([collecting()]);
    await runPrenotifications(store, render, mail, dueDay);

    const later = makeStore([collecting({}, ["2026-09-12", "2026-10-12"])], {
      existingInvoices: [...invoices.values()],
    });
    await runPrenotifications(later.store, render, mail, "2026-10-29");

    expect(later.invoices.size).toBe(2);
    expect(sent).toHaveLength(2);
    expect(sent[1]?.debitOn).toBe("2026-11-12");
    expect(numbersIssued.concat(later.numbersIssued)).toHaveLength(2);
  });
});

describe("the first term", () => {
  const paidFirstTerm = invoiceFixture({
    id: "inv-first",
    number: { value: "YM-F-2026-000009", provisional: false },
    netCents: 2500,
    recurringServiceId: "svc-1",
    billingPeriodStart: "2026-09-12",
    billingPeriodEnd: "2026-10-11",
    issueDate: "2026-09-12",
    dueDate: "2026-09-12",
    status: "paid",
  });

  /*
    The customer paid it themselves during activation, and the webhook mailed
    it there. It is not a SEPA pre-notification and must never be turned into
    one by a later run.
  */
  it("is never announced by the daily pass", async () => {
    const { store, claims } = makeStore([collecting()], { existingInvoices: [paidFirstTerm] });

    const summary = await runPrenotifications(store, render, mail, "2026-09-13");

    expect(summary.announced).toBe(0);
    expect(sent).toHaveLength(0);
    expect(claims).toEqual([]);
  });

  it("is left alone even when the activation mail never went out", async () => {
    // sent_at still null, because the mail failed there; still not ours.
    const { store, invoices } = makeStore([collecting()], { existingInvoices: [paidFirstTerm] });

    // Across the whole run-up, including the day the next period is due.
    for (const day of ["2026-09-13", "2026-09-20", "2026-09-28", "2026-09-29"]) {
      await runPrenotifications(store, render, mail, day);
    }

    // Whatever else went out, the paid first term never did.
    expect(sent.map((input) => input.invoice.id)).not.toContain("inv-first");
    expect(rendered.map((invoice) => invoice.id)).not.toContain("inv-first");
    expect(invoices.get("inv-first")?.sentAt).toBeUndefined();
  });

  /* The second period is an ordinary announcement, fourteen days out. */
  it("does not stop the next period from being announced", async () => {
    const { store, invoices, claims } = makeStore([collecting({}, ["2026-09-12"])], {
      existingInvoices: [paidFirstTerm],
    });

    const summary = await runPrenotifications(store, render, mail, dueDay);

    expect(summary).toMatchObject({ invoicesCreated: 1, announced: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.debitOn).toBe("2026-10-12");
    expect(claims).toHaveLength(1);
    // The paid first term was not touched.
    expect(invoices.get("inv-first")?.sentAt).toBeUndefined();
  });
});

describe("who is left alone", () => {
  it("skips a paused, cancelled or unmandated service", async () => {
    for (const overrides of [{ status: "paused" } as const, { status: "canceled" } as const, { mollie: {} }]) {
      const { store, invoices } = makeStore([collecting(overrides)]);
      const summary = await runPrenotifications(store, render, mail, dueDay);
      expect(summary).toMatchObject({ invoicesCreated: 0, announced: 0, problems: [] });
      expect(invoices.size).toBe(0);
    }
    expect(sent).toHaveLength(0);
  });

  it("reports a missing anchor instead of guessing a date", async () => {
    const { store } = makeStore([collecting({ startsOn: undefined })]);
    const summary = await runPrenotifications(store, render, mail, dueDay);

    expect(summary.announced).toBe(0);
    expect(summary.problems).toEqual([{ serviceId: "svc-1", reason: "Geen startdatum; incassodatum niet te bepalen." }]);
  });

  it("reports a customer without a usable address and mails nothing", async () => {
    for (const contact of [undefined, { contactName: "A", email: "" }, { contactName: "A", email: "nope" }]) {
      const { store, claims } = makeStore([collecting()], { contact });
      const summary = await runPrenotifications(store, render, mail, dueDay);
      // The invoice is still made -- the work was done and is billable.
      expect(summary.invoicesCreated).toBe(1);
      expect(summary.announced).toBe(0);
      expect(summary.problems[0]?.reason).toBe("Klant heeft geen bruikbaar e-mailadres.");
      expect(claims).toHaveLength(0);
    }
    expect(sent).toHaveLength(0);
  });
});

describe("when sending fails", () => {
  it("leaves the invoice unsent and retries it on the next run", async () => {
    const failing: InvoiceMailer = vi.fn(async () => ({ sent: false as const, reason: "Resend was onbereikbaar" }));
    const { store, invoices, claims, numbersIssued } = makeStore([collecting()]);

    const first = await runPrenotifications(store, render, failing, dueDay);
    expect(first).toMatchObject({ announced: 0, failed: 1 });
    expect(claims[0]).toMatchObject({ status: "failed", error: "Resend was onbereikbaar" });
    // Not marked as sent, because it was not.
    expect([...invoices.values()][0]?.sentAt).toBeUndefined();

    const second = await runPrenotifications(store, render, mail, "2026-09-29");
    expect(second.announced).toBe(1);
    // The same invoice and the same number; nothing was reissued.
    expect(invoices.size).toBe(1);
    expect(numbersIssued).toEqual(["YM-F-2026-000001"]);
    expect(sent).toHaveLength(1);
    expect(claims).toHaveLength(1);
  });

  it("treats a renderer that throws as a failed send, not a sent invoice", async () => {
    const broken: PdfRenderer = vi.fn(async () => {
      throw new Error("PDF kapot");
    });
    const { store, invoices, claims } = makeStore([collecting()]);

    const summary = await runPrenotifications(store, broken, mail, dueDay);

    expect(summary.failed).toBe(1);
    expect(sent).toHaveLength(0);
    expect([...invoices.values()][0]?.sentAt).toBeUndefined();
    expect(claims[0]?.status).toBe("failed");
  });

  /* A run that died mid-flight must not cost the customer their invoice. */
  it("picks up a claim left pending by a crashed run, but not a fresh one", async () => {
    const { store, claims } = makeStore([collecting()]);
    await runPrenotifications(store, render, vi.fn(async () => ({ sent: false as const, reason: "x" })), dueDay);
    claims[0]!.status = "pending";

    const fresh = await runPrenotifications(store, render, mail, dueDay);
    expect(fresh.announced).toBe(0);

    claims[0]!.claimedAt = new Date(Date.now() - stalePendingMs - 1000).toISOString();
    const later = await runPrenotifications(store, render, mail, dueDay);
    expect(later.announced).toBe(1);
    expect(sent).toHaveLength(1);
  });
});
