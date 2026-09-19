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
/* The stored invoice, as the guard reads it before touching anything. */
const storedInvoice = vi.fn();
const select = vi.fn(() => ({ eq: () => ({ maybeSingle: storedInvoice }) }));
const from = vi.fn(() => ({ insert, update, select }));
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
  // Still a concept, so an ordinary edit is allowed.
  storedInvoice.mockResolvedValue({ data: { issued_at: null, number_value: "FAC-CONCEPT-X" }, error: null });
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

describe("an invoice that has been made definitive", () => {
  /*
    From the moment it is issued its figures are a fact -- not from the moment
    it is mailed. That is the whole point of issuing first: the admin approves
    a document that then cannot change under them. Correcting it is a credit
    note, which is its own flow; the unsafe edit is blocked rather than
    quietly applied. The database refuses it too -- this is the readable half
    of that rule.
  */
  it("refuses to change its financial data", async () => {
    storedInvoice.mockResolvedValue({
      data: { issued_at: "2026-09-28T07:00:00.000Z", number_value: "YM-F-2026-000001" },
      error: null,
    });

    const result = await saveInvoice("invoice-1", { ...valid, lines: [{ ...line, unitPriceCents: 99900 }] }, "YM-F-2026-000001");

    expect(result).toEqual({
      ok: false,
      error:
        "Factuur YM-F-2026-000001 is al definitief. De gegevens liggen vast; corrigeren kan alleen met een creditfactuur.",
    });
    expect(update).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("still allows a concept to be edited", async () => {
    const result = await saveInvoice("invoice-1", valid, "FAC-CONCEPT-X");

    expect(result).toEqual({ ok: true, value: "invoice-1" });
    expect(update).toHaveBeenCalledTimes(1);
  });

  /*
    `issued` and `sent` are the flow's to give. A dropdown that could set
    either would make an invoice claim to exist without a number behind it,
    so the server refuses them even though the enum knows them.
  */
  it.each(["issued", "sent", "paid", "overdue"])("refuses status %s from the form", async (status) => {
    const result = await saveInvoice("invoice-1", { ...valid, status }, "FAC-CONCEPT-X");

    expect(result).toEqual({ ok: false, error: "Kies een geldige status." });
    expect(from).not.toHaveBeenCalled();
  });

  it("still accepts the two an admin may set by hand", async () => {
    for (const status of ["draft", "cancelled"]) {
      expect(await saveInvoice("invoice-1", { ...valid, status }, "FAC-CONCEPT-X")).toEqual({ ok: true, value: "invoice-1" });
    }
  });

  it("does not look for a stored invoice when creating a new one", async () => {
    await saveInvoice(null, valid, "FAC-CONCEPT-X");
    expect(select).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
