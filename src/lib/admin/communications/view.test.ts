import { describe, expect, it } from "vitest";
import {
  communicationCounts,
  communicationRows,
  sortCommunications,
} from "@/lib/admin/communications/view";
import { communicationGroup, type CustomerCommunication } from "@/lib/admin/communications/types";

/*
  How the list reads. Two things are worth pinning down: the newest mail is at
  the top whatever order the rows arrive in, and a filter narrows the list
  without ever losing a row into a bucket that is not shown.
*/
function communication(overrides: Partial<CustomerCommunication> & { id: string }): CustomerCommunication {
  return {
    customerId: "cust-1",
    channel: "email",
    direction: "outbound",
    category: "invoice_sent",
    recipient: "a@example.com",
    subject: "Factuur",
    bodyText: "Beste A. Alfa",
    status: "sent",
    createdAt: "2026-09-01T10:00:00.000Z",
    sentAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

const quote = communication({ id: "c1", category: "quote_sent", sentAt: "2026-09-01T09:00:00.000Z", createdAt: "2026-09-01T09:00:00.000Z" });
const invoice = communication({ id: "c2", category: "invoice_sent", sentAt: "2026-09-03T09:00:00.000Z", createdAt: "2026-09-03T09:00:00.000Z" });
const activating = communication({ id: "c3", category: "invoice_activation_sent", sentAt: "2026-09-05T09:00:00.000Z", createdAt: "2026-09-05T09:00:00.000Z" });
const monthly = communication({ id: "c4", category: "recurring_invoice_prenotification", sentAt: "2026-10-01T09:00:00.000Z", createdAt: "2026-10-01T09:00:00.000Z" });
const settled = communication({ id: "c5", category: "recurring_invoice_settled", sentAt: "2026-09-06T09:00:00.000Z", createdAt: "2026-09-06T09:00:00.000Z" });
const mandate = communication({ id: "c6", category: "direct_debit_activation", sentAt: "2026-09-04T09:00:00.000Z", createdAt: "2026-09-04T09:00:00.000Z" });

const all = [invoice, monthly, quote, mandate, settled, activating];

describe("the order of the list", () => {
  it("puts the newest mail first", () => {
    expect(sortCommunications(all).map((row) => row.id)).toEqual(["c4", "c5", "c3", "c6", "c2", "c1"]);
  });

  it("does not depend on the order the rows arrived in", () => {
    const reversed = sortCommunications([...all].reverse()).map((row) => row.id);
    expect(reversed).toEqual(sortCommunications(all).map((row) => row.id));
  });

  /* Two mails in the same second -- an invoice and the link that follows it
     -- keep the order they were written in. */
  it("breaks a tie on the moment the row was written", () => {
    const first = communication({ id: "first", sentAt: "2026-09-10T09:00:00.000Z", createdAt: "2026-09-10T09:00:00.100Z" });
    const second = communication({ id: "second", sentAt: "2026-09-10T09:00:00.000Z", createdAt: "2026-09-10T09:00:00.900Z" });

    expect(sortCommunications([first, second]).map((row) => row.id)).toEqual(["second", "first"]);
  });

  /* A row with no send time still has to land somewhere sensible. */
  it("falls back to the creation moment when a send time is missing", () => {
    const undated = communication({ id: "undated", sentAt: undefined, createdAt: "2026-11-01T09:00:00.000Z" });

    expect(sortCommunications([...all, undated])[0].id).toBe("undated");
  });
});

describe("the filters", () => {
  it("shows everything under Alle, still newest first", () => {
    expect(communicationRows(all, "all").map((row) => row.id)).toEqual(["c4", "c5", "c3", "c6", "c2", "c1"]);
  });

  it("narrows to the quotes", () => {
    expect(communicationRows(all, "quotes").map((row) => row.id)).toEqual(["c1"]);
  });

  /*
    Every mail that carried an invoice PDF is a factuurmail, including the
    monthly term that doubles as the pre-notification and the one-off that
    also authorises the collection.
  */
  it("gathers every mail that carried an invoice under the invoices", () => {
    expect(communicationRows(all, "invoices").map((row) => row.id)).toEqual(["c4", "c5", "c3", "c2"]);
  });

  it("keeps the mandate link under payments", () => {
    expect(communicationRows(all, "payments").map((row) => row.id)).toEqual(["c6"]);
  });

  it("has nothing left over", () => {
    expect(communicationRows(all, "other")).toEqual([]);
  });

  /*
    A newer deployment can write a category this build does not know. It has
    to stay visible: "Overig" is where it lands, and "Alle" still shows it.
  */
  it("puts an unknown category under Overig rather than nowhere", () => {
    const future = communication({ id: "future", category: "sms_reminder" as never });
    const list = [...all, future];

    expect(communicationGroup("sms_reminder")).toBe("other");
    expect(communicationRows(list, "other").map((row) => row.id)).toEqual(["future"]);
    expect(communicationRows(list, "all")).toHaveLength(7);
  });

  it("counts what each filter would show", () => {
    expect(communicationCounts(all)).toEqual({ all: 6, quotes: 1, invoices: 4, payments: 1, other: 0 });
  });
});
