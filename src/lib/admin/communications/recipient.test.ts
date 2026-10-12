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
    const result = recipientFromCustomer({ ...row, email: "  a@example.com ", contact_name: " A. Alfa " }, "general");

    expect(result).toEqual({ ok: true, recipient: { customerId: "cust-1", email: "a@example.com", contactName: "A. Alfa" } });
  });

  it.each([[""], ["   "], ["geen-adres"], ["a@b"], [null]])("refuses %j as an address", (email) => {
    expect(recipientFromCustomer({ ...row, email }, "financial")).toEqual({ ok: false, reason: invalidRecipientReason });
  });

  it("refuses a customer that is not there", () => {
    expect(recipientFromCustomer(undefined, "general")).toEqual({ ok: false, reason: missingCustomerReason });
    expect(recipientFromCustomer(null, "financial")).toEqual({ ok: false, reason: missingCustomerReason });
  });
});

describe("the billing address", () => {
  const withBilling = { ...row, billing_email: " finance@example.com " };

  it("receives financial mail when the customer set one", () => {
    expect(recipientFromCustomer(withBilling, "financial")).toEqual({
      ok: true,
      recipient: { customerId: "cust-1", email: "finance@example.com", contactName: "A. Alfa" },
    });
  });

  it("falls back to the contact address when empty or unusable", () => {
    for (const billing_email of [null, undefined, "", "   ", "geen-adres"]) {
      const result = recipientFromCustomer({ ...row, billing_email }, "financial");
      expect(result.ok && result.recipient.email, String(billing_email)).toBe("a@example.com");
    }
  });

  it("never receives general mail", () => {
    expect(recipientFromCustomer(withBilling, "general")).toEqual({
      ok: true,
      recipient: { customerId: "cust-1", email: "a@example.com", contactName: "A. Alfa" },
    });
  });
});

describe("resolving a customer's recipient", () => {
  it("reads the customer as stored now", async () => {
    const db = createFakeDb({ customers: [row, { ...row, id: "cust-2", email: "b@example.com" }] });
    db.rows("customers")[0].email = "new@example.com";

    const result = await resolveCustomerRecipient(db as unknown as CommunicationClient, "cust-1", "general");

    expect(result.ok && result.recipient.email).toBe("new@example.com");
  });

  it("turns a failed read into a reason, not an exception", async () => {
    const broken = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "permission denied" } }) }) }),
      }),
    } as unknown as CommunicationClient;

    const result = await resolveCustomerRecipient(broken, "cust-1", "financial");

    expect(result).toEqual({ ok: false, reason: "De klantgegevens konden niet worden geladen: permission denied" });
  });
});

describe("which mail is financial", () => {
  /*
    Pinned per caller, from the source: financial mail may go to the billing
    address, everything else to the contact. A new caller has to choose, and
    shows up here.
  */
  it("is decided at every call site, the way this list says", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = join(process.cwd(), "src");
    const walk = (directory: string): string[] =>
      readdirSync(directory).flatMap((entry) => {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) return walk(path);
        return /\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) && !entry.includes("fixtures") ? [path] : [];
      });
    const found: string[] = [];
    for (const path of walk(root)) {
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(/(?:resolveCustomerRecipient|recipientFromCustomer|readCustomerRecipient)\([^;]*?"(financial|general)"\)/g)) {
        found.push(`${path.replace(root, "src")}: ${match[1]}`);
      }
    }
    expect(found.sort()).toEqual(
      [
        "src/app/admin/(shell)/betalingen/creditnotas/[id]/page.tsx: financial",
        "src/app/admin/(shell)/facturen/[id]/page.tsx: financial",
        "src/app/admin/(shell)/offertes/[id]/page.tsx: general",
        "src/lib/admin/credit-notes/actions.ts: financial",
        "src/lib/admin/documents/send.ts: financial",
        "src/lib/admin/documents/send.ts: general",
        "src/lib/admin/invoices/finalize.ts: financial",
        "src/lib/payments/actions.ts: financial",
        "src/lib/payments/actions.ts: financial",
        "src/lib/payments/actions.ts: financial",
        "src/lib/payments/prenotification-store.ts: financial",
        "src/lib/payments/reminder-store.ts: financial",
      ].sort(),
    );
  });
});
