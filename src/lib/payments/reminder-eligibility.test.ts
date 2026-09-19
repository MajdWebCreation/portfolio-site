import { describe, expect, it, vi } from "vitest";

/**
 * Which invoices the reminder job is even allowed to look at.
 *
 * The ladder itself is decided by `invoiceCollectionView`, and that is tested
 * on its own. This is the question before it: an invoice that was made
 * definitive but never mailed must not be chased. The customer has not been
 * asked for anything -- there is no document in their inbox -- so a reminder
 * would be the first they hear of it.
 *
 * Asserted on the query the store actually builds, because that is where the
 * exclusion lives; a document never read cannot be filtered out later.
 */
type Recorded = { method: string; args: unknown[] };

function recordingClient(recorded: Recorded[]) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "in", "not", "eq", "neq", "order", "is"]) {
    builder[method] = (...args: unknown[]) => {
      recorded.push({ method, args });
      return builder;
    };
  }
  // Awaited at the end of the chain: no rows, so nothing else is queried.
  (builder as { then: unknown }).then = (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null });
  return { from: (table: string) => (recorded.push({ method: "from", args: [table] }), builder) };
}

const recorded: Recorded[] = [];
vi.mock("@/lib/payments/admin-client", () => ({ paymentsAdminClient: () => recordingClient(recorded) }));

const { createReminderStore } = await import("@/lib/payments/reminder-store");

describe("the invoices a reminder run considers", () => {
  it("asks only for invoices that were sent, and were actually mailed", async () => {
    recorded.length = 0;

    const candidates = await createReminderStore().listCandidates();

    expect(candidates).toEqual([]);
    expect(recorded).toContainEqual({ method: "from", args: ["invoices"] });
    expect(recorded).toContainEqual({ method: "in", args: ["status", ["sent", "overdue"]] });
    expect(recorded).toContainEqual({ method: "not", args: ["sent_at", "is", null] });

    /*
      Both conditions, not one of them: `issued` is outside the status list
      and an issued invoice has no `sent_at`, so a document that is
      definitive and unsent is excluded twice over.
    */
    const statuses = recorded.find((call) => call.method === "in" && call.args[0] === "status")?.args[1];
    expect(statuses).not.toContain("issued");
    expect(statuses).not.toContain("draft");
  });
});
