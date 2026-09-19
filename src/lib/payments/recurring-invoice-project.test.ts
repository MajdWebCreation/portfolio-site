import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createFinalizationRpc } from "@/lib/admin/invoices/storage-fixture";
import { createFakeDb, recurringFixture } from "@/lib/payments/fixtures";

/* The renderer is a megabyte of PDF machinery and decides nothing here. */
vi.mock("@/lib/admin/pdf/to-buffer", () => ({
  renderInvoicePdf: async () => Buffer.from("%PDF-1.7 term\n"),
  renderQuotePdf: async () => Buffer.from("pdf"),
  documentFileName: (value: string) => `${value}.pdf`,
}));

const { ensureRecurringInvoice } = await import("@/lib/payments/recurring-invoice");

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

  /*
    The stored procedures this path uses. Numbering and issuing are simulated
    faithfully enough to matter -- one number per invoice, the artifact and
    `issued_at` written together -- because this flow now issues a document,
    not just a row.
  */
  let sequence = 9;
  const finalization = createFinalizationRpc(
    () => base.rows("invoices"),
    () => `YM-F-2026-${String(sequence++).padStart(6, "0")}`,
  );
  return Object.assign(base, {
    rpc: vi.fn(async (name: string, args?: Record<string, unknown>) =>
      name === "save_invoice_lines" ? { data: null, error: null } : finalization(name, args ?? {}),
    ),
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

  /*
    A term is a document like any other: one number, one stored PDF, and the
    payment reference following that number. The mails that go out afterwards
    attach this file rather than rendering their own.
  */
  it("is issued with exactly one stored PDF", async () => {
    const db = fakeDb();

    const invoice = await ensureRecurringInvoice(db as never, recurringFixture(), period, "2026-09-20");

    expect(invoice.number.value).toBe("YM-F-2026-000009");
    expect(invoice.paymentReference).toBe("YM-F-2026-000009");
    const term = Buffer.from("%PDF-1.7 term\n");
    expect(invoice.document?.path).toBe(`2026/YM-F-2026-000009-${createHash("sha256").update(term).digest("hex")}.pdf`);
    expect(db.bucket.uploads).toHaveLength(1);
    expect(db.bucket.files.get(invoice.document!.path)).toEqual(term);
  });

  it("does not make a second PDF when it is asked again", async () => {
    const db = fakeDb();
    const service = recurringFixture();

    await ensureRecurringInvoice(db as never, service, period, "2026-09-20");
    await ensureRecurringInvoice(db as never, service, period, "2026-09-20");

    expect(db.bucket.uploads).toHaveLength(1);
  });
});
