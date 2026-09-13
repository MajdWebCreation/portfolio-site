import { describe, expect, it, vi } from "vitest";
import { createFakeDb, recurringFixture } from "@/lib/payments/fixtures";
import { ensureRecurringInvoice } from "@/lib/payments/recurring-invoice";

/*
  A monthly service belongs to the project it is part of, and every invoice it
  generates has to say so -- otherwise the project page shows the one-off
  invoice that started the service and none of the months that follow.
*/
function fakeDb() {
  const base = createFakeDb({
    customers: [
      {
        id: "cust-1",
        company_name: "Alfa BV",
        contact_name: "A. Alfa",
        email: "a@example.com",
        street: "Straat 1",
        postal_code: "1011 AA",
        city: "Amsterdam",
        country: "Nederland",
        kvk_number: null,
        vat_number: null,
      },
    ],
    invoices: [],
  });

  // The two stored procedures this path uses; neither decides anything the
  // test is about.
  return Object.assign(base, {
    rpc: vi.fn(async (name: string) => (name === "assign_invoice_number" ? { data: "YM-F-2026-000009", error: null } : { data: null, error: null })),
  });
}

const period = { start: "2026-10-01", end: "2026-10-31" };

describe("the invoice a monthly service generates", () => {
  it("inherits the customer and the project of the service", async () => {
    const db = fakeDb();
    const service = recurringFixture({ projectId: "proj-1", startsOn: "2026-10-01" });

    await ensureRecurringInvoice(db as never, service, period, "2026-09-20");

    const [row] = db.rows("invoices");
    expect(row.customer_id).toBe("cust-1");
    expect(row.project_id).toBe("proj-1");
    expect(row.recurring_service_id).toBe("svc-1");
  });

  it("leaves the project empty for a service that belongs to none", async () => {
    const db = fakeDb();

    await ensureRecurringInvoice(db as never, recurringFixture(), period, "2026-09-20");

    expect(db.rows("invoices")[0].project_id).toBeNull();
  });

  /* The unique key on (service, period): one term, one invoice. */
  it("creates one invoice per period however often it is asked", async () => {
    const db = fakeDb();
    const service = recurringFixture({ projectId: "proj-1" });

    await ensureRecurringInvoice(db as never, service, period, "2026-09-20");
    await ensureRecurringInvoice(db as never, service, period, "2026-09-20");

    expect(db.rows("invoices")).toHaveLength(1);
  });
});
