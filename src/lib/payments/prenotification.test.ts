import { describe, expect, it } from "vitest";
import { recurringFixture } from "@/lib/payments/fixtures";
import {
  isAnnounceable,
  nextDebitSchedule,
  prenotificationDays,
  prenotificationState,
  recurringOverview,
  type ServiceSchedule,
} from "@/lib/payments/prenotification";
import type { DebitPrenotification } from "@/lib/payments/types";

/**
 * The calendar. Every date here has to come out of the service's own anchor
 * and the periods its invoices already cover, because that is the one source
 * the rest of the system uses.
 */
function collecting(overrides: Parameters<typeof recurringFixture>[0] = {}, billed: string[] = []): ServiceSchedule {
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

describe("when the next collection falls", () => {
  it("is the period after the last one billed", () => {
    const schedule = nextDebitSchedule(collecting({}, ["2026-09-12"]));
    expect(schedule).toMatchObject({ debitOn: "2026-10-12" });
  });

  it("walks on with each month that has been billed", () => {
    const schedule = nextDebitSchedule(collecting({}, ["2026-09-12", "2026-10-12", "2026-11-12"]));
    expect(schedule).toMatchObject({ debitOn: "2026-12-12" });
  });

  /*
    A service switched on by a one-off project invoice has billed no term yet,
    so the first collection is the start date itself -- not a month later.
  */
  it("collects on the start date when nothing has been billed yet", () => {
    expect(nextDebitSchedule(collecting({}, []))).toMatchObject({ debitOn: "2026-09-12" });
  });

  it("names the period the collection pays for", () => {
    const schedule = nextDebitSchedule(collecting({}, ["2026-09-12"]));
    expect(schedule).toMatchObject({ period: { start: "2026-10-12", end: "2026-11-11" } });
  });

  /* Month lengths, leap years and an anchor the next month does not have. */
  it("clamps an anchor of the 31st to the end of a shorter month", () => {
    expect(nextDebitSchedule(collecting({ startsOn: "2026-01-31" }, ["2026-01-31"]))).toMatchObject({
      debitOn: "2026-02-28",
    });
    expect(nextDebitSchedule(collecting({ startsOn: "2028-01-31" }, ["2028-01-31"]))).toMatchObject({
      debitOn: "2028-02-29",
    });
  });

  it("returns to the anchor day after a clamped month", () => {
    expect(nextDebitSchedule(collecting({ startsOn: "2026-01-31" }, ["2026-01-31", "2026-02-28"]))).toMatchObject({
      debitOn: "2026-03-31",
    });
  });

  it("crosses a year boundary", () => {
    expect(nextDebitSchedule(collecting({ startsOn: "2026-12-15" }, ["2026-12-15"]))).toMatchObject({
      debitOn: "2027-01-15",
    });
  });
});

describe("when there is nothing to collect", () => {
  it("says so for a paused or cancelled service", () => {
    expect(nextDebitSchedule(collecting({ status: "paused" }))).toEqual({ reason: "not_active" });
    expect(nextDebitSchedule(collecting({ status: "canceled" }))).toEqual({ reason: "not_active" });
    expect(nextDebitSchedule(collecting({ status: "awaiting_mandate" }))).toEqual({ reason: "not_active" });
  });

  it("says so when there is no subscription at the provider", () => {
    expect(nextDebitSchedule(collecting({ mollie: {} }))).toEqual({ reason: "no_subscription" });
  });

  /* A broken record, not a date to guess at. */
  it("refuses to invent a date without an anchor", () => {
    expect(nextDebitSchedule(collecting({ startsOn: undefined }))).toEqual({ reason: "missing_anchor" });
  });
});

describe("the fourteen day rule", () => {
  const schedule = nextDebitSchedule(collecting({}, ["2026-09-12"]));
  if ("reason" in schedule) throw new Error("expected a schedule");

  it("announces from exactly fourteen calendar days before", () => {
    expect(prenotificationDays).toBe(14);
    expect(schedule.debitOn).toBe("2026-10-12");
    expect(schedule.announceFrom).toBe("2026-09-28");
  });

  it("is not due fifteen days before", () => {
    expect(isAnnounceable(schedule, "2026-09-27")).toBe(false);
  });

  it("is due on the fourteenth day", () => {
    expect(isAnnounceable(schedule, "2026-09-28")).toBe(true);
  });

  /* A cron that did not run for a day still sends, once. */
  it("is still due thirteen days before, after a missed run", () => {
    expect(isAnnounceable(schedule, "2026-09-29")).toBe(true);
    expect(isAnnounceable(schedule, "2026-10-11")).toBe(true);
  });

  it("stops announcing once the collection day has arrived", () => {
    expect(isAnnounceable(schedule, "2026-10-12")).toBe(false);
    expect(isAnnounceable(schedule, "2026-10-13")).toBe(false);
  });

  /* Counting days, not months: February shortens nothing. */
  it("counts calendar days across a month boundary", () => {
    const february = nextDebitSchedule(collecting({ startsOn: "2026-01-31" }, ["2026-01-31"]));
    if ("reason" in february) throw new Error("expected a schedule");
    expect(february.debitOn).toBe("2026-02-28");
    expect(february.announceFrom).toBe("2026-02-14");
  });

  it("counts calendar days across a leap day", () => {
    const march = nextDebitSchedule(collecting({ startsOn: "2028-02-29" }, ["2028-02-29"]));
    if ("reason" in march) throw new Error("expected a schedule");
    expect(march.debitOn).toBe("2028-03-29");
    expect(march.announceFrom).toBe("2028-03-15");
  });
});

describe("what the admin sees", () => {
  const entry = collecting({}, ["2026-09-12"]);

  function record(overrides: Partial<DebitPrenotification> = {}): DebitPrenotification {
    return {
      id: "pre-1",
      recurringServiceId: "svc-1",
      customerId: "cust-1",
      invoiceId: "inv-oct",
      billingPeriodStart: "2026-10-12",
      billingPeriodEnd: "2026-11-11",
      scheduledDebitOn: "2026-10-12",
      amountCents: 3025,
      recipientEmail: "a@example.com",
      status: "sent",
      sentAt: "2026-09-28T07:00:00.000Z",
      createdAt: "2026-09-28T07:00:00.000Z",
      ...overrides,
    };
  }

  it("is not needed long before the collection", () => {
    expect(recurringOverview(entry, [], "2026-09-20").state).toBe("not_needed");
  });

  it("is due once the window opens", () => {
    expect(recurringOverview(entry, [], "2026-09-28").state).toBe("due");
  });

  it("reads as sent once it went out", () => {
    const overview = recurringOverview(entry, [record()], "2026-09-28");
    expect(overview.state).toBe("sent");
    expect(overview.record?.id).toBe("pre-1");
    expect(overview.amountCents).toBe(3025);
  });

  it("reads as failed when sending did not work", () => {
    expect(recurringOverview(entry, [record({ status: "failed", sentAt: undefined })], "2026-09-28").state).toBe(
      "failed",
    );
  });

  /*
    Materiality: an announcement is only good for the collection it describes.
    A changed amount or a moved date means nothing has been announced yet.
  */
  it("becomes due again when the amount changed after an earlier announcement", () => {
    const dearer = collecting({ amountCents: 5000 }, ["2026-09-12"]);
    expect(recurringOverview(dearer, [record()], "2026-09-28").state).toBe("due");
  });

  it("becomes due again when the collection date moved", () => {
    const moved = record({ scheduledDebitOn: "2026-10-20", billingPeriodStart: "2026-10-20" });
    expect(recurringOverview(entry, [moved], "2026-09-28").state).toBe("due");
  });

  it("ignores an announcement belonging to another service", () => {
    expect(recurringOverview(entry, [record({ recurringServiceId: "svc-other" })], "2026-09-28").state).toBe("due");
  });

  it("reports a service whose anchor is missing instead of a date", () => {
    const broken = recurringOverview(collecting({ startsOn: undefined }), [], "2026-09-28");
    expect(broken).toMatchObject({ reason: "missing_anchor", state: "not_needed" });
    expect(broken.debitOn).toBeUndefined();
  });
});

describe("state without a schedule", () => {
  it("prefers what happened over what is due", () => {
    const schedule = { debitOn: "2026-10-12", announceFrom: "2026-09-28", period: { start: "2026-10-12", end: "2026-11-11" } };
    expect(prenotificationState(schedule, "2026-09-28", { status: "sent" })).toBe("sent");
    expect(prenotificationState(schedule, "2026-09-28", { status: "failed" })).toBe("failed");
    expect(prenotificationState(schedule, "2026-09-28", { status: "pending" })).toBe("due");
  });
});
