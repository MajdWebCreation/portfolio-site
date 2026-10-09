import { describe, expect, it } from "vitest";
import {
  invalidRecipientReason,
  missingCustomerReason,
  recipientFromCustomer,
  resolveCustomerRecipient,
} from "@/lib/admin/communications/recipient";
import type { CommunicationClient } from "@/lib/admin/communications/log";
import { createFakeDb } from "@/lib/payments/fixtures";

/*
  The one place an address for a customer mail comes from: the customer
  record, read now, with no fallback to anything a document or an earlier
  send remembers.
*/
const row = { id: "cust-1", contact_name: "A. Alfa", email: "a@example.com" };

describe("a recipient out of the customer record", () => {
  it("carries the record's address and contact, trimmed", () => {
    const result = recipientFromCustomer({ ...row, email: "  a@example.com ", contact_name: " A. Alfa " });

    expect(result).toEqual({ ok: true, recipient: { customerId: "cust-1", email: "a@example.com", contactName: "A. Alfa" } });
  });

  it.each([[""], ["   "], ["geen-adres"], ["a@b"], [null]])("refuses %j as an address", (email) => {
    expect(recipientFromCustomer({ ...row, email })).toEqual({ ok: false, reason: invalidRecipientReason });
  });

  it("refuses a customer that is not there", () => {
    expect(recipientFromCustomer(undefined)).toEqual({ ok: false, reason: missingCustomerReason });
    expect(recipientFromCustomer(null)).toEqual({ ok: false, reason: missingCustomerReason });
  });
});

describe("resolving a customer's recipient", () => {
  it("reads the customer as stored now", async () => {
    const db = createFakeDb({ customers: [row, { ...row, id: "cust-2", email: "b@example.com" }] });
    db.rows("customers")[0].email = "new@example.com";

    const result = await resolveCustomerRecipient(db as unknown as CommunicationClient, "cust-1");

    expect(result.ok && result.recipient.email).toBe("new@example.com");
  });

  it("turns a failed read into a reason, not an exception", async () => {
    const broken = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "permission denied" } }) }) }),
      }),
    } as unknown as CommunicationClient;

    const result = await resolveCustomerRecipient(broken, "cust-1");

    expect(result).toEqual({ ok: false, reason: "De klantgegevens konden niet worden geladen: permission denied" });
  });
});
