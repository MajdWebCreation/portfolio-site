import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/admin/documents/validation";
import { calculateTotals } from "@/lib/money";
import { collectionReadyDays, reminderFeeCents } from "@/lib/payments/collection-policy";
import { invoiceCollectionView, type CollectionEvent } from "@/lib/payments/collection-state";
import { customerFinancials } from "@/lib/payments/customer-status";
import { invoiceFixture, paymentFixture } from "@/lib/payments/fixtures";

/*
  The one decision function, on its own.

  Both the daily job and the invoice screen ask this what happens next, so
  everything the ladder does -- and every reason it stops -- is pinned down
  here, without a database, a clock or a mail provider.
*/
const due = "2026-10-01";
const invoice = invoiceFixture({ dueDate: due, status: "sent", sentAt: "2026-09-17T09:00:00.000Z" });

/** The calendar day `n` days after the due date. */
const day = (n: number) => addDays(due, n);

function sentEvent(stage: CollectionEvent["stage"], n: number): CollectionEvent {
  return {
    id: `evt-${stage}`,
    invoiceId: invoice.id,
    customerId: "cust-1",
    stage,
    eligibleOn: day(n),
    daysOverdue: n,
    recipient: "a@example.com",
    subject: "Herinnering",
    status: "sent",
    claimedAt: `${day(n)}T08:00:00.000Z`,
    sentAt: `${day(n)}T08:00:01.000Z`,
    createdAt: `${day(n)}T08:00:00.000Z`,
  };
}

function view(overrides: Partial<Parameters<typeof invoiceCollectionView>[0]> = {}) {
  return invoiceCollectionView({
    invoice,
    payments: [],
    events: [],
    todayKey: day(1),
    ...overrides,
  });
}

describe("the ladder, day by day", () => {
  it("sends nothing on the due date itself", () => {
    const result = view({ todayKey: due });

    expect(result.daysOverdue).toBe(0);
    expect(result.dueStage).toBeUndefined();
    expect(result.blocked).toBe("not_due");
    expect(result.nextStep).toEqual({ stage: "first_reminder", on: day(1) });
  });

  it("makes the first reminder due on day 1", () => {
    const result = view({ todayKey: day(1) });

    expect(result.dueStage).toBe("first_reminder");
    expect(result.blocked).toBeUndefined();
    expect(result.nextStep).toEqual({ stage: "second_reminder", on: day(7) });
  });

  it("asks for nothing more once the first reminder went out", () => {
    const result = view({ todayKey: day(1), events: [sentEvent("first_reminder", 1)] });

    expect(result.dueStage).toBeUndefined();
    expect(result.nextStep).toEqual({ stage: "second_reminder", on: day(7) });
    expect(result.automation).toBe("running");
  });

  it("waits until day 7 for the second reminder", () => {
    const events = [sentEvent("first_reminder", 1)];

    expect(view({ todayKey: day(6), events }).dueStage).toBeUndefined();
    expect(view({ todayKey: day(7), events }).dueStage).toBe("second_reminder");
  });

  it("waits until day 14 for the final notice", () => {
    const events = [sentEvent("first_reminder", 1), sentEvent("second_reminder", 7)];

    expect(view({ todayKey: day(13), events }).dueStage).toBeUndefined();
    expect(view({ todayKey: day(14), events }).dueStage).toBe("final_notice");
  });

  const wholeLadder = [
    sentEvent("first_reminder", 1),
    sentEvent("second_reminder", 7),
    sentEvent("final_notice", 14),
  ];

  it("sends no fourth mail after the final notice", () => {
    for (const n of [15, 21, 40]) {
      const result = view({ todayKey: day(n), events: wholeLadder });
      expect(result.dueStage).toBeUndefined();
      expect(result.blocked).toBe("ladder_complete");
    }
  });

  /*
    Day 21 is where the automation stops and a person takes over. Nothing is
    handed anywhere: this is a reading, and acting on it is a decision only
    YM makes.
  */
  it("becomes ready for collection on day 21, and not before", () => {
    expect(view({ todayKey: day(20), events: wholeLadder }).collectionReady).toBe(false);

    const ready = view({ todayKey: day(21), events: wholeLadder });
    expect(ready.collectionReady).toBe(true);
    expect(ready.collectionReadyOn).toBe(day(collectionReadyDays));
    expect(ready.automation).toBe("finished");
    expect(ready.dueStage).toBeUndefined();
  });

  /*
    An invoice whose reminders were paused for a month climbs the ladder a
    step a day when it resumes. Opening with a final notice to someone who was
    never reminded is not a ladder.
  */
  it("starts at the friendly one even when it resumes late", () => {
    const result = view({ todayKey: day(40) });

    expect(result.dueStage).toBe("first_reminder");
    expect(result.collectionReady).toBe(false);
  });
});

describe("what stops the automation", () => {
  const paidInFull = [paymentFixture({ amountCents: calculateTotals(invoice.lines).totalCents })];

  it("stops on a paid invoice", () => {
    expect(view({ todayKey: day(3), invoice: { ...invoice, status: "paid" } }).blocked).toBe("paid");
  });

  it("stops on a cancelled invoice", () => {
    expect(view({ todayKey: day(3), invoice: { ...invoice, status: "cancelled" } }).blocked).toBe("cancelled");
  });

  it("stops on a draft", () => {
    expect(view({ todayKey: day(3), invoice: { ...invoice, status: "draft" } }).blocked).toBe("draft");
  });

  it("stops on an invoice that was never sent", () => {
    expect(view({ todayKey: day(3), invoice: { ...invoice, sentAt: undefined } }).blocked).toBe("not_sent");
  });

  it("stops the moment nothing is outstanding, whatever the status says", () => {
    const result = view({ todayKey: day(3), payments: paidInFull });

    expect(result.outstandingCents).toBe(0);
    expect(result.blocked).toBe("settled");
    expect(result.automation).toBe("inactive");
  });

  /* Payment between day 1 and day 7, and between day 7 and day 14. */
  it.each([
    { when: 4, sent: [sentEvent("first_reminder", 1)] },
    { when: 10, sent: [sentEvent("first_reminder", 1), sentEvent("second_reminder", 7)] },
  ])("stops when the customer pays on day $when", ({ when, sent }) => {
    const result = view({ todayKey: day(when), events: sent, payments: paidInFull });

    expect(result.dueStage).toBeUndefined();
    expect(result.blocked).toBe("settled");
    expect(result.collectionReady).toBe(false);
  });

  it.each([
    { state: "paused" as const, block: "paused" },
    { state: "disputed" as const, block: "disputed" },
    { state: "payment_plan" as const, block: "payment_plan" },
    { state: "handed_over" as const, block: "handed_over" },
  ])("stops while a human set it to $state", ({ state, block }) => {
    const result = view({ todayKey: day(9), state });

    expect(result.blocked).toBe(block);
    expect(result.dueStage).toBeUndefined();
    expect(result.automation).toBe("paused");
  });

  /* A collection that is on its way is not a customer who has not paid. */
  it("waits while a payment is still running", () => {
    const result = view({ todayKey: day(3), payments: [paymentFixture({ status: "pending", paidAt: undefined })] });

    expect(result.blocked).toBe("payment_in_flight");
  });

  it("never lets a paused invoice become ready for collection", () => {
    const result = view({
      todayKey: day(30),
      state: "paused",
      events: [sentEvent("first_reminder", 1), sentEvent("second_reminder", 7), sentEvent("final_notice", 14)],
    });

    expect(result.collectionReady).toBe(false);
  });
});

/*
  A direct debit and a bank transfer end at the same ladder; only the moment
  it starts differs, because a SEPA charge takes days to report and chasing
  someone whose money is already moving is wrong.
*/
describe("an invoice collected by direct debit", () => {
  it("is left alone while the collection is still on its way", () => {
    const result = view({ todayKey: day(1), directDebit: true });

    expect(result.blocked).toBe("direct_debit_pending");
  });

  it("enters the ordinary ladder the moment the collection fails", () => {
    const failed = [paymentFixture({ status: "failed", paidAt: undefined })];
    const result = view({ todayKey: day(1), directDebit: true, payments: failed });

    expect(result.blocked).toBeUndefined();
    expect(result.dueStage).toBe("first_reminder");
  });

  it("is chased anyway once the grace window has passed", () => {
    const result = view({ todayKey: day(5), directDebit: true });

    expect(result.blocked).toBeUndefined();
    expect(result.dueStage).toBe("first_reminder");
  });

  /* Same engine, same stages, same dates as a plain website invoice. */
  it("climbs the identical ladder as any other invoice", () => {
    const failed = [paymentFixture({ status: "failed", paidAt: undefined })];
    const events = [sentEvent("first_reminder", 1), sentEvent("second_reminder", 7)];

    expect(view({ todayKey: day(14), directDebit: true, payments: failed, events }).dueStage).toBe("final_notice");
    expect(view({ todayKey: day(14), events }).dueStage).toBe("final_notice");
  });
});

/*
  The EUR 20 is copy on one mail and nothing else. There is no column that
  could hold it and no arithmetic that could pick it up, and this is the test
  that says so out loud.
*/
describe("the announced reminder fee", () => {
  const overdue = invoiceFixture({ dueDate: due, status: "sent", sentAt: "2026-09-17T09:00:00.000Z" });
  const total = calculateTotals(overdue.lines).totalCents;

  it("is never part of what the invoice asks for", () => {
    const result = view({ todayKey: day(9), events: [sentEvent("first_reminder", 1), sentEvent("second_reminder", 7)] });

    expect(result.outstandingCents).toBe(total);
    expect(result.outstandingCents).not.toBe(total + reminderFeeCents);
  });

  it("is never part of what the customer owes", () => {
    const financials = customerFinancials([overdue], [], day(9));

    expect(financials.outstandingCents).toBe(total);
    expect(financials.overdueCents).toBe(total);
  });

  it("leaves an invoice settled by its own total, not its total plus a fee", () => {
    const result = view({ todayKey: day(9), payments: [paymentFixture({ amountCents: total })] });

    expect(result.outstandingCents).toBe(0);
    expect(result.blocked).toBe("settled");
  });
});
