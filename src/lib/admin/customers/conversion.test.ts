import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  "Klant maken" with the database stubbed out. A customer record is what a
  quote needs to exist; making one says the request is worth quoting and
  nothing more. The update that follows the insert must therefore raise a
  new or contacted inquiry to qualified and leave every later stage -- a
  quote out, won -- exactly where it is. Won is never set here.
*/
type Call = { table: string; op: string; args: unknown[] };
const calls: Call[] = [];
const existing = vi.fn();

function chain(table: string, op: string, result: unknown) {
  const record = (args: unknown[]) => calls.push({ table, op, args });
  const node: Record<string, unknown> = {
    eq: (...args: unknown[]) => (record(["eq", ...args]), node),
    in: (...args: unknown[]) => (record(["in", ...args]), node),
    select: (...args: unknown[]) => (record(["select", ...args]), node),
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return node;
}

const from = vi.fn((table: string) => ({
  select: (...args: unknown[]) => {
    calls.push({ table, op: "select", args });
    if (table === "customers") return chain(table, "select", { data: existing(), error: null });
    return chain(table, "select", { data: { id: "inq-1", name: "Anna", email: "anna@example.com", company: null, phone: null }, error: null });
  },
  insert: (row: unknown) => {
    calls.push({ table, op: "insert", args: [row] });
    return chain(table, "insert", { data: { id: "cust-1" }, error: null });
  },
  update: (row: unknown) => {
    calls.push({ table, op: "update", args: [row] });
    return chain(table, "update", { error: null });
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/db")>()),
  adminDb: async () => ({ from }),
}));

const { createCustomerFromInquiry } = await import("@/lib/admin/customers/conversion");

beforeEach(() => {
  calls.length = 0;
  existing.mockReturnValue(null);
});

describe("createCustomerFromInquiry", () => {
  it("creates the customer and raises the inquiry to qualified only from new or contacted, never to quote_sent or won", async () => {
    const result = await createCustomerFromInquiry("inq-1");
    expect(result).toEqual({ ok: true, value: { customerId: "cust-1", created: true } });

    const update = calls.find((call) => call.table === "inquiries" && call.op === "update");
    expect(update?.args[0]).toEqual({ status: "qualified" });
    /* The stage filter is part of the same statement: later stages are untouched. */
    const after = calls.slice(calls.indexOf(update!) + 1);
    expect(after).toContainEqual({ table: "inquiries", op: "update", args: ["eq", "id", "inq-1"] });
    expect(after).toContainEqual({ table: "inquiries", op: "update", args: ["in", "status", ["new", "contacted"]] });
    expect(JSON.stringify(calls)).not.toContain('"won"');
    expect(JSON.stringify(calls)).not.toContain("quote_sent");
  });

  it("does nothing to the inquiry when the customer already exists", async () => {
    existing.mockReturnValue({ id: "cust-9" });
    expect(await createCustomerFromInquiry("inq-1")).toEqual({ ok: true, value: { customerId: "cust-9", created: false } });
    expect(calls.some((call) => call.table === "inquiries" && call.op === "update")).toBe(false);
  });
});
