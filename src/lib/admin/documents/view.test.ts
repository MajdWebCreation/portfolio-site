import { describe, expect, it } from "vitest";
import { recipientFromCustomer } from "@/lib/admin/communications/recipient";
import { sendTarget } from "@/lib/admin/documents/view";
import type { Quote } from "@/lib/admin/quotes/types";
import { invoiceFixture, testCustomer } from "@/lib/payments/fixtures";

/*
  TEST 3: what the send panel shows. A concept written while the customer had
  old@example.com, reopened after the customer was changed: the page resolves
  the recipient from the customer record, and the panel names that address --
  not the copy on the document.
*/
const before = { ...testCustomer, email: "old@example.com" };

const quote = (overrides: Partial<Quote> = {}): Quote => ({
  id: "quo-1",
  number: { value: "OFF-CONCEPT-X", provisional: true },
  status: "draft",
  customer: before,
  issueDate: "2026-09-01",
  validUntil: "2026-10-01",
  subject: "Nieuwe website",
  intro: "",
  lines: [],
  notes: "",
  updatedAt: "2026-09-01T10:00:00.000Z",
  ...overrides,
});

const onRecord = (email: string, id = testCustomer.customerId) =>
  recipientFromCustomer({ id, contact_name: testCustomer.contactName, email });

describe("the send panel's recipient", () => {
  it("names the address the customer has now for a reopened concept quote", () => {
    expect(sendTarget({ kind: "quote", quote: quote() }, onRecord("new@example.com"))).toEqual({
      recipient: "new@example.com",
      blocked: null,
    });
  });

  it("names the address the customer has now for an issued invoice", () => {
    const invoice = invoiceFixture({ status: "issued", sentAt: undefined, customer: before });

    expect(sendTarget({ kind: "invoice", invoice }, onRecord("new@example.com")).recipient).toBe("new@example.com");
  });

  it("blocks with the reason when the customer has no usable address, naming no other", () => {
    expect(sendTarget({ kind: "quote", quote: quote() }, onRecord(""))).toEqual({
      recipient: "",
      blocked: "Deze klant heeft geen geldig e-mailadres. Voeg eerst een e-mailadres toe bij de klantgegevens.",
    });
  });

  it("asks for a save while the form holds a customer the server does not", () => {
    const switched = quote({ customer: { ...before, customerId: "cust-2" } });

    expect(sendTarget({ kind: "quote", quote: switched }, onRecord("new@example.com"))).toEqual({
      recipient: "",
      blocked: "Sla de offerte eerst op.",
    });
  });

  it("asks for a save before a new quote exists", () => {
    expect(sendTarget({ kind: "quote", quote: quote({ id: "" }) }, onRecord("new@example.com")).blocked).toBe(
      "Sla de offerte eerst op.",
    );
  });
});
