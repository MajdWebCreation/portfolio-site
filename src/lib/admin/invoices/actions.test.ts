import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerSnapshot, DocumentLine } from "@/lib/admin/documents/types";

/*
  saveInvoice with the database stubbed out. An invoice may name a project
  with or without a quote of its own, which is the whole reason the link moved
  off projects.quote_id; these tests pin the row that carries it.
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

const { saveInvoice } = await import("@/lib/admin/invoices/actions");

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
  dueDate: "2026-09-15",
  paymentReference: "FAC-CONCEPT-1",
  lines: [line],
  notes: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  inserted.length = 0;
  insertSingle.mockResolvedValue({ data: { id: "invoice-1" }, error: null });
  updateSingle.mockResolvedValue({ data: { id: "invoice-1" }, error: null });
  rpc.mockResolvedValue({ error: null });
});

describe("saveInvoice and its project", () => {
  /* Backwards compatibility: an invoice without a project stays valid. */
  it("stores no project when none was chosen", async () => {
    const result = await saveInvoice(null, valid, "FAC-CONCEPT-1");
    expect(result).toEqual({ ok: true, value: "invoice-1" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ project_id: null }));
  });

  /*
    The case the old model could not express: an invoice that never came from
    a quote, filed under a project all the same.
  */
  it("stores a project on an invoice that has no quote", async () => {
    await saveInvoice(null, { ...valid, projectId: "proj-1" }, "FAC-CONCEPT-1");
    const [row] = inserted;
    expect(row.project_id).toBe("proj-1");
    expect(row).not.toHaveProperty("quote_id");
  });

  it("keeps the project on an update", async () => {
    await saveInvoice("invoice-1", { ...valid, projectId: "proj-1" }, "YM-F-2026-000001");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ project_id: "proj-1" }));
  });

  /*
    Either composite key can raise this: the project not being the customer's,
    or the project disagreeing with the quote the invoice follows from.
  */
  it("explains a project the database refused", async () => {
    insertSingle.mockResolvedValue({ data: null, error: { code: "23503", message: "violates foreign key constraint" } });
    const result = await saveInvoice(null, { ...valid, projectId: "proj-of-other" }, "FAC-CONCEPT-1");
    expect(result).toEqual({
      ok: false,
      error: "Het gekozen project bestaat niet meer, hoort niet bij deze klant, of spreekt de gekoppelde offerte tegen.",
    });
  });

  it("reports other database errors unchanged", async () => {
    insertSingle.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied" } });
    const result = await saveInvoice(null, valid, "FAC-CONCEPT-1");
    expect(result).toEqual({ ok: false, error: "permission denied" });
  });

  it("still refuses invalid input before it reaches the database", async () => {
    const result = await saveInvoice(null, { ...valid, projectId: "proj-1", dueDate: "2026-08-01" }, "FAC-CONCEPT-1");
    expect(result).toEqual({ ok: false, error: "De vervaldatum ligt vóór de documentdatum." });
    expect(from).not.toHaveBeenCalled();
  });
});
