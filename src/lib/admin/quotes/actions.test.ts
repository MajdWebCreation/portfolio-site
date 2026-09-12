import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerSnapshot, DocumentLine } from "@/lib/admin/documents/types";

/*
  saveQuote with the database stubbed out. What is under test is the row this
  layer builds -- in particular that the project is stored as a reference and
  as nothing else -- and how it reports a reference the database refused.
*/
const insertSingle = vi.fn();
const updateSingle = vi.fn();
type Row = Record<string, unknown>;
const inserted: Row[] = [];
const insert = vi.fn((row: Row) => {
  inserted.push(row);
  return { select: () => ({ single: insertSingle }) };
});
const update = vi.fn(() => ({ eq: () => ({ select: () => ({ single: updateSingle }) }) }));
const from = vi.fn(() => ({ insert, update }));
const rpc = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/db")>()),
  adminDb: async () => ({ from, rpc }),
}));

const { saveQuote } = await import("@/lib/admin/quotes/actions");

const customer: CustomerSnapshot = {
  customerId: "cust-1",
  companyName: "Alfa BV",
  contactName: "A",
  email: "a@example.com",
  street: "Straat 1",
  postalCode: "1011 AA",
  city: "Amsterdam",
  country: "Nederland",
};

const line: DocumentLine = { id: "l1", description: "Werk", quantityHundredths: 100, unitPriceCents: 10000, vatRate: 21 };

const valid = {
  status: "draft",
  customer,
  issueDate: "2026-09-01",
  validUntil: "2026-10-01",
  subject: "Website",
  intro: "",
  lines: [line],
  notes: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  inserted.length = 0;
  insertSingle.mockResolvedValue({ data: { id: "quote-1" }, error: null });
  updateSingle.mockResolvedValue({ data: { id: "quote-1" }, error: null });
  rpc.mockResolvedValue({ error: null });
});

describe("saveQuote and its project", () => {
  /* Backwards compatibility: a quote without a project is a whole quote. */
  it("stores no project when none was chosen", async () => {
    const result = await saveQuote(null, valid, "OFF-CONCEPT-1");
    expect(result).toEqual({ ok: true, value: "quote-1" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ project_id: null }));
  });

  it("stores the chosen project as a plain reference", async () => {
    await saveQuote(null, { ...valid, projectId: "proj-1" }, "OFF-CONCEPT-1");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ project_id: "proj-1" }));
  });

  it("copies nothing else about the project onto the quote", async () => {
    await saveQuote(null, { ...valid, projectId: "proj-1" }, "OFF-CONCEPT-1");
    const [row] = inserted;
    expect(Object.keys(row).filter((key) => key.startsWith("project_"))).toEqual(["project_id"]);
  });

  it("keeps the project on an update", async () => {
    await saveQuote("quote-1", { ...valid, projectId: "proj-1" }, "YM-O-2026-000001");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ project_id: "proj-1" }));
  });

  /* The composite key on (project_id, customer_id) is what raises this. */
  it("explains a project the database refused", async () => {
    insertSingle.mockResolvedValue({ data: null, error: { code: "23503", message: "violates foreign key constraint" } });
    const result = await saveQuote(null, { ...valid, projectId: "project-of-another-customer" }, "OFF-CONCEPT-1");
    expect(result).toEqual({ ok: false, error: "Het gekozen project bestaat niet meer of hoort niet bij deze klant." });
  });

  it("reports other database errors unchanged", async () => {
    insertSingle.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied" } });
    const result = await saveQuote(null, valid, "OFF-CONCEPT-1");
    expect(result).toEqual({ ok: false, error: "permission denied" });
  });

  it("still refuses invalid input before it reaches the database", async () => {
    const result = await saveQuote(null, { ...valid, projectId: "proj-1", subject: "  " }, "OFF-CONCEPT-1");
    expect(result).toEqual({ ok: false, error: "Vul een onderwerp in." });
    expect(from).not.toHaveBeenCalled();
  });
});
