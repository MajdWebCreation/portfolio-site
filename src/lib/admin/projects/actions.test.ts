import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  The server actions with the database and the cache stubbed out, so what is
  under test is what this layer decides: which input it refuses before a query
  is sent, which row it builds, and which database error it turns into a
  sentence an admin can act on.
*/
const insertSingle = vi.fn();
const updateMaybeSingle = vi.fn();
const insert = vi.fn(() => ({ select: () => ({ single: insertSingle }) }));
const update = vi.fn(() => ({ eq: () => ({ select: () => ({ maybeSingle: updateMaybeSingle }) }) }));
const from = vi.fn(() => ({ insert, update }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/db")>()),
  adminDb: async () => ({ from }),
}));

const { createProject, updateProject } = await import("@/lib/admin/projects/actions");

const valid = { customerId: "cust-1", name: "  Nieuwe webshop  ", status: "planned", notes: "" };

beforeEach(() => {
  vi.clearAllMocks();
  insertSingle.mockResolvedValue({ data: { id: "proj-1" }, error: null });
  updateMaybeSingle.mockResolvedValue({ data: { customer_id: "cust-1" }, error: null });
});

describe("createProject", () => {
  it("stores the project and reports its id", async () => {
    const result = await createProject(valid);
    expect(result).toEqual({ ok: true, value: "proj-1" });
    expect(from).toHaveBeenCalledWith("projects");
  });

  it("trims the name and stores empty optional fields as null", async () => {
    await createProject({ ...valid, startDate: "", deadline: "" });
    expect(insert).toHaveBeenCalledWith({
      customer_id: "cust-1",
      name: "Nieuwe webshop",
      status: "planned",
      start_date: null,
      deadline: null,
      notes: "",
    });
  });

  /* Both dates are independently optional, all the way to the row. */
  it("stores each date on its own", async () => {
    await createProject({ ...valid, startDate: "2026-09-01" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ start_date: "2026-09-01", deadline: null }));

    await createProject({ ...valid, deadline: "2026-12-01" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ start_date: null, deadline: "2026-12-01" }));

    await createProject({ ...valid, startDate: "2026-09-01", deadline: "2026-12-01" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ start_date: "2026-09-01", deadline: "2026-12-01" }));
  });

  /* A project no longer names a quote; documents name the project. */
  it("never writes a quote", async () => {
    await createProject(valid);
    expect(insert).toHaveBeenCalledWith(expect.not.objectContaining({ quote_id: expect.anything() }));
  });

  it("refuses invalid input before it reaches the database", async () => {
    const noCustomer = await createProject({ ...valid, customerId: "" });
    expect(noCustomer).toEqual({ ok: false, error: "Kies een klant." });

    const badDates = await createProject({ ...valid, startDate: "2026-12-01", deadline: "2026-09-01" });
    expect(badDates).toEqual({ ok: false, error: "De deadline ligt vóór de startdatum." });

    expect(from).not.toHaveBeenCalled();
  });

  it("explains a rejected reference instead of repeating the constraint error", async () => {
    insertSingle.mockResolvedValue({ data: null, error: { code: "23503", message: "violates foreign key constraint" } });
    const result = await createProject({ ...valid, customerId: "gone" });
    expect(result).toEqual({ ok: false, error: "Deze klant bestaat niet meer." });
  });

  it("reports any other database error", async () => {
    insertSingle.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied" } });
    const result = await createProject(valid);
    expect(result).toEqual({ ok: false, error: "permission denied" });
  });
});

describe("updateProject", () => {
  it("saves the editable fields", async () => {
    const result = await updateProject("proj-1", { name: "Fase 2", status: "active", notes: "Live in oktober" });
    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({
      name: "Fase 2",
      status: "active",
      start_date: null,
      deadline: null,
      notes: "Live in oktober",
    });
  });

  /* A project stays with the customer it was made for. */
  it("never writes a customer", async () => {
    await updateProject("proj-1", { name: "Fase 2", status: "active", notes: "" });
    expect(update).toHaveBeenCalledWith(expect.not.objectContaining({ customer_id: expect.anything() }));
  });

  it("applies the same rules as creating one", async () => {
    const result = await updateProject("proj-1", { name: "   ", status: "active", notes: "" });
    expect(result).toEqual({ ok: false, error: "Vul een projectnaam in." });
    expect(from).not.toHaveBeenCalled();
  });

  it("says so when the project is gone", async () => {
    updateMaybeSingle.mockResolvedValue({ data: null, error: null });
    const result = await updateProject("proj-1", { name: "Fase 2", status: "active", notes: "" });
    expect(result).toEqual({ ok: false, error: "Dit project bestaat niet (meer)." });
  });
});
