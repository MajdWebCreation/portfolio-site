import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/admin/documents/validation";
import { announceableStart, earliestDebitDate, isAnnouncableStart, prenotificationDays } from "@/lib/payments/prenotification";

/*
  YM Creations announces a collection fourteen calendar days in advance, and
  for the first collection the invoice mail is that announcement. So a date
  that cannot be announced in time is not a warning but an impossibility --
  and a customer who pays late must not be collected from on a day that has
  already gone by.
*/
const today = "2026-09-13";

describe("the earliest collection date", () => {
  it("is fourteen calendar days out", () => {
    expect(prenotificationDays).toBe(14);
    expect(earliestDebitDate(today)).toBe("2026-09-27");
    expect(earliestDebitDate(today)).toBe(addDays(today, 14));
  });

  it("accepts exactly fourteen days and refuses thirteen", () => {
    expect(isAnnouncableStart("2026-09-27", today)).toBe(true);
    expect(isAnnouncableStart("2026-09-26", today)).toBe(false);
    expect(isAnnouncableStart("2026-09-12", today)).toBe(false);
  });

  it("counts across a month boundary", () => {
    expect(earliestDebitDate("2026-09-25")).toBe("2026-10-09");
    expect(earliestDebitDate("2026-12-28")).toBe("2027-01-11");
  });
});

describe("moving a start date a late payment has overtaken", () => {
  it("leaves a date that still has the full notice alone", () => {
    expect(announceableStart("2026-10-15", today)).toBe("2026-10-15");
    expect(announceableStart("2026-09-27", today)).toBe("2026-09-27");
  });

  it("moves a date that has passed forward by whole months", () => {
    expect(announceableStart("2026-08-15", today)).toBe("2026-10-15");
  });

  it("moves a date that is too close to announce", () => {
    // 2026-09-20 is only seven days away.
    expect(announceableStart("2026-09-20", today)).toBe("2026-10-20");
  });

  it("keeps the day of the month the customer was told about", () => {
    // The 31st, clamped to the last day of a month that is shorter, exactly as
    // the billing helpers place every other monthly term.
    expect(announceableStart("2026-01-31", today)).toBe("2026-09-30");
    // A short month does not make the anchor creep backwards afterwards.
    expect(announceableStart("2026-01-31", "2026-02-01")).toBe("2026-02-28");
    expect(announceableStart("2026-01-31", "2026-02-20")).toBe("2026-03-31");
  });

  it("always lands on a date that can still be announced", () => {
    for (const start of ["2024-03-05", "2026-09-13", "2026-09-14", "2026-12-31"]) {
      expect(isAnnouncableStart(announceableStart(start, today), today)).toBe(true);
    }
  });
});
