import { beforeEach, describe, expect, it, vi } from "vitest";
import { addDays } from "@/lib/admin/documents/validation";
import { invoiceFixture, paymentFixture } from "@/lib/payments/fixtures";
import type { CollectionEvent } from "@/lib/payments/collection-state";
import {
  runPaymentReminders,
  stalePendingMs,
  type ReminderCandidate,
  type ReminderStore,
} from "@/lib/payments/reminder-runner";

/*
  The daily pass, with the database and the mailer replaced but every decision
  real.

  What is under test is the behaviour a scheduled job has to have: it never
  mails the same stage twice, it retries what failed, and one broken invoice
  costs that invoice its mail and nothing else.
*/
const due = "2026-10-01";
const day = (n: number) => addDays(due, n);

const subjects = { first_reminder: "Herinnering", second_reminder: "Tweede", final_notice: "Aanmaning" } as const;
const subjectFor = (stage: keyof typeof subjects) => subjects[stage];

/** An in-memory store with the unique key the real table has. */
function createStore(candidates: ReminderCandidate[]) {
  const rows: (CollectionEvent & { claimedAtMs: number })[] = [];
  let sequence = 0;

  const store: ReminderStore = {
    listCandidates: async () => candidates,
    claim: async (key) => {
      const existing = rows.find((row) => row.invoiceId === key.invoiceId && row.stage === key.stage);
      if (existing) {
        return { claimed: false as const, existing: { id: existing.id, status: existing.status, claimedAt: existing.claimedAt } };
      }
      const claimedAt = new Date().toISOString();
      const row = {
        id: `evt-${(sequence += 1)}`,
        invoiceId: key.invoiceId,
        customerId: key.customerId,
        stage: key.stage,
        eligibleOn: key.eligibleOn,
        daysOverdue: key.daysOverdue,
        recipient: key.recipientEmail,
        subject: key.subject,
        status: "pending" as const,
        claimedAt,
        claimedAtMs: Date.parse(claimedAt),
        createdAt: claimedAt,
      };
      rows.push(row);
      return { claimed: true as const, id: row.id };
    },
    markSent: async ({ claimId, sentAt, messageId, communicationId }) => {
      const row = rows.find((candidate) => candidate.id === claimId)!;
      Object.assign(row, { status: "sent", sentAt, providerMessageId: messageId, communicationId, error: undefined });
    },
    markFailed: async (id, reason) => {
      const row = rows.find((candidate) => candidate.id === id)!;
      Object.assign(row, { status: "failed", sentAt: undefined, error: reason });
    },
  };

  return { store, rows };
}

function candidate(overrides: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    invoice: invoiceFixture({ dueDate: due, status: "sent", sentAt: "2026-09-17T09:00:00.000Z" }),
    payments: [],
    events: [],
    directDebit: false,
    recipientEmail: "a@example.com",
    contactName: "A. Alfa",
    ...overrides,
  };
}

/** Feeds the events the store has recorded back into the next run's input. */
function replay(rows: ReturnType<typeof createStore>["rows"], base: ReminderCandidate): ReminderCandidate {
  return { ...base, events: rows.filter((row) => row.invoiceId === base.invoice.id) };
}

const mail = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mail.mockResolvedValue({ sent: true, sentAt: "2026-10-02T08:00:00.000Z", messageId: "resend-1", communicationId: "comm-1" });
});

describe("the daily run", () => {
  it("sends nothing on the due date itself", async () => {
    const { store, rows } = createStore([candidate()]);

    const summary = await runPaymentReminders(store, mail, subjectFor, due);

    expect(summary).toMatchObject({ considered: 1, sent: 0, skipped: 1 });
    expect(mail).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
  });

  it("sends exactly one first reminder on day 1", async () => {
    const { store, rows } = createStore([candidate()]);

    const summary = await runPaymentReminders(store, mail, subjectFor, day(1));

    expect(summary).toMatchObject({ considered: 1, sent: 0 + 1, failed: 0 });
    expect(mail).toHaveBeenCalledTimes(1);
    expect(mail.mock.calls[0][0]).toMatchObject({ stage: "first_reminder", daysOverdue: 1, recipientEmail: "a@example.com" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stage: "first_reminder", status: "sent", communicationId: "comm-1" });
  });

  /* The property a scheduled job lives or dies by. */
  it("sends nothing on a second run of the same day", async () => {
    const base = candidate();
    const { store, rows } = createStore([base]);

    await runPaymentReminders(store, mail, subjectFor, day(1));
    // Second run, with the row the first one wrote now in the input.
    (store.listCandidates as unknown as () => Promise<ReminderCandidate[]>) = async () => [replay(rows, base)];
    const second = await runPaymentReminders(store, mail, subjectFor, day(1));

    expect(mail).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ sent: 0, skipped: 1 });
    expect(rows).toHaveLength(1);
  });

  /*
    Two workers at the same moment. Both see no event yet, both claim -- and
    the second claim finds the row the first one made, exactly as the unique
    index makes it do in Postgres.
  */
  it("mails once when two runs overlap", async () => {
    const base = candidate();
    const { store, rows } = createStore([base]);

    await Promise.all([
      runPaymentReminders(store, mail, subjectFor, day(1)),
      runPaymentReminders(store, mail, subjectFor, day(1)),
    ]);

    expect(mail).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
  });

  it("climbs to the second reminder on day 7 and the final notice on day 14", async () => {
    const base = candidate();
    const { store, rows } = createStore([base]);
    const listOf = (c: ReminderCandidate) => {
      (store.listCandidates as unknown as () => Promise<ReminderCandidate[]>) = async () => [c];
    };

    await runPaymentReminders(store, mail, subjectFor, day(1));
    listOf(replay(rows, base));
    await runPaymentReminders(store, mail, subjectFor, day(7));
    listOf(replay(rows, base));
    await runPaymentReminders(store, mail, subjectFor, day(14));

    expect(mail.mock.calls.map(([input]) => input.stage)).toEqual([
      "first_reminder",
      "second_reminder",
      "final_notice",
    ]);
    expect(rows.filter((row) => row.status === "sent")).toHaveLength(3);
  });

  /*
    Day 21: the automation reports that a person has to decide and does
    nothing else. Nothing is handed anywhere, and no fourth mail goes out.
  */
  it("reports collection-ready on day 21 without sending or handing anything over", async () => {
    const base = candidate();
    const { store, rows } = createStore([base]);
    const listOf = (c: ReminderCandidate) => {
      (store.listCandidates as unknown as () => Promise<ReminderCandidate[]>) = async () => [c];
    };

    await runPaymentReminders(store, mail, subjectFor, day(1));
    listOf(replay(rows, base));
    await runPaymentReminders(store, mail, subjectFor, day(7));
    listOf(replay(rows, base));
    await runPaymentReminders(store, mail, subjectFor, day(14));
    listOf(replay(rows, base));
    const summary = await runPaymentReminders(store, mail, subjectFor, day(21));

    expect(summary.collectionReady).toEqual([base.invoice.id]);
    expect(summary.sent).toBe(0);
    expect(mail).toHaveBeenCalledTimes(3);
    expect(rows).toHaveLength(3);
  });
});

describe("a payment that arrives mid-ladder", () => {
  it.each([
    { when: 4, after: "first_reminder" },
    { when: 10, after: "second_reminder" },
  ])("stops everything when the invoice is paid on day $when", async ({ when }) => {
    const base = candidate();
    const { store, rows } = createStore([base]);
    const listOf = (c: ReminderCandidate) => {
      (store.listCandidates as unknown as () => Promise<ReminderCandidate[]>) = async () => [c];
    };

    await runPaymentReminders(store, mail, subjectFor, day(1));
    if (when > 7) {
      listOf(replay(rows, base));
      await runPaymentReminders(store, mail, subjectFor, day(7));
    }

    const sentBefore = mail.mock.calls.length;
    const paid = { ...replay(rows, base), payments: [paymentFixture({ amountCents: 12100 })] };
    listOf(paid);

    for (const n of [when, 14, 21, 30]) {
      await runPaymentReminders(store, mail, subjectFor, day(n));
    }

    expect(mail).toHaveBeenCalledTimes(sentBefore);
    expect(rows).toHaveLength(sentBefore);
  });
});

describe("invoices that must be left alone", () => {
  it.each([
    { what: "een concept", invoice: invoiceFixture({ dueDate: due, status: "draft" }) },
    { what: "een geannuleerde factuur", invoice: invoiceFixture({ dueDate: due, status: "cancelled", sentAt: "2026-09-17T09:00:00.000Z" }) },
    { what: "een betaalde factuur", invoice: invoiceFixture({ dueDate: due, status: "paid", sentAt: "2026-09-17T09:00:00.000Z" }) },
    { what: "een factuur die nooit verstuurd is", invoice: invoiceFixture({ dueDate: due, status: "sent" }) },
  ])("sends nothing for $what", async ({ invoice }) => {
    const { store, rows } = createStore([candidate({ invoice })]);

    await runPaymentReminders(store, mail, subjectFor, day(9));

    expect(mail).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
  });

  it.each(["paused", "disputed", "payment_plan", "handed_over"] as const)("sends nothing while %s", async (state) => {
    const { store, rows } = createStore([candidate({ state })]);

    await runPaymentReminders(store, mail, subjectFor, day(9));

    expect(mail).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
  });

  it("never chases a customer without a usable address", async () => {
    const { store, rows } = createStore([candidate({ recipientEmail: "  " })]);

    const summary = await runPaymentReminders(store, mail, subjectFor, day(1));

    expect(mail).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
    expect(summary.problems[0].reason).toContain("e-mailadres");
  });
});

describe("a send that fails", () => {
  it("leaves the stage marked failed and no second row", async () => {
    mail.mockResolvedValue({ sent: false, reason: "Invalid recipient" });
    const base = candidate();
    const { store, rows } = createStore([base]);

    const summary = await runPaymentReminders(store, mail, subjectFor, day(1));

    expect(summary).toMatchObject({ sent: 0, failed: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stage: "first_reminder", status: "failed", error: "Invalid recipient" });
    expect(rows[0].sentAt).toBeUndefined();
  });

  it("retries the same row tomorrow and produces one successful record", async () => {
    mail.mockResolvedValueOnce({ sent: false, reason: "Invalid recipient" });
    const base = candidate();
    const { store, rows } = createStore([base]);

    await runPaymentReminders(store, mail, subjectFor, day(1));
    (store.listCandidates as unknown as () => Promise<ReminderCandidate[]>) = async () => [replay(rows, base)];
    const second = await runPaymentReminders(store, mail, subjectFor, day(2));

    expect(mail).toHaveBeenCalledTimes(2);
    expect(second).toMatchObject({ sent: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "sent", error: undefined });
  });

  /* A run that died mid-send leaves the row pending; it is not retried at
     once, or two runs minutes apart would both mail. */
  it("leaves a fresh pending claim alone and picks up a stale one", async () => {
    const base = candidate();
    const { store, rows } = createStore([base]);
    await store.claim({
      invoiceId: base.invoice.id,
      customerId: "cust-1",
      stage: "first_reminder",
      eligibleOn: day(1),
      daysOverdue: 1,
      recipientEmail: "a@example.com",
      subject: "Herinnering",
    });

    await runPaymentReminders(store, mail, subjectFor, day(1));
    expect(mail).not.toHaveBeenCalled();

    // The same row, claimed longer ago than a run could plausibly still hold.
    rows[0].claimedAt = new Date(Date.now() - stalePendingMs - 1000).toISOString();
    await runPaymentReminders(store, mail, subjectFor, day(1));

    expect(mail).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
  });

  /* One invoice's problem is one invoice's problem. */
  it("keeps going when a single invoice blows up", async () => {
    const good = candidate();
    const broken = candidate({ invoice: invoiceFixture({ id: "inv-2", dueDate: due, status: "sent", sentAt: "2026-09-17T09:00:00.000Z" }) });
    const { store, rows } = createStore([broken, good]);
    const realClaim = store.claim;
    store.claim = async (key) => {
      if (key.invoiceId === "inv-2") throw new Error("database weg");
      return realClaim(key);
    };

    const summary = await runPaymentReminders(store, mail, subjectFor, day(1));

    expect(summary).toMatchObject({ considered: 2, sent: 1, failed: 1 });
    expect(summary.problems[0]).toEqual({ invoiceId: "inv-2", reason: "database weg" });
    expect(rows.map((row) => row.invoiceId)).toEqual(["inv-1"]);
  });
});

/*
  Two customers in one run. Everything a mail says comes from the invoice
  being chased, so there is no path by which one customer's reminder could
  carry another customer's document or address.
*/
describe("two customers in one run", () => {
  it("never mixes one customer's invoice with another's reminder", async () => {
    const alfa = candidate();
    const beta = candidate({
      invoice: invoiceFixture({
        id: "inv-2",
        number: { value: "YM-F-2026-000002", provisional: false },
        dueDate: due,
        status: "sent",
        sentAt: "2026-09-17T09:00:00.000Z",
        customer: { ...invoiceFixture().customer, customerId: "cust-2", companyName: "Beta BV", email: "b@example.com" },
      }),
      recipientEmail: "b@example.com",
      contactName: "B. Beta",
    });
    const { store, rows } = createStore([alfa, beta]);

    await runPaymentReminders(store, mail, subjectFor, day(1));

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => [row.invoiceId, row.customerId, row.recipient])).toEqual([
      ["inv-1", "cust-1", "a@example.com"],
      ["inv-2", "cust-2", "b@example.com"],
    ]);
    expect(mail.mock.calls.map(([input]) => [input.invoice.id, input.recipientEmail])).toEqual([
      ["inv-1", "a@example.com"],
      ["inv-2", "b@example.com"],
    ]);
  });
});
