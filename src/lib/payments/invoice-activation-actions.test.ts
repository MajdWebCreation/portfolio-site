import { beforeEach, describe, expect, it, vi } from "vitest";
import { addDays } from "@/lib/admin/documents/validation";
import { toDateKey } from "@/lib/admin/format";
import { createFakeDb } from "@/lib/payments/fixtures";

/*
  Recording, from the invoice, that its payment switches a monthly service on.
  The link lives on the service, so the send flow and a webhook hours later
  both read the same fact instead of a state the page happened to hold.
*/
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let db: ReturnType<typeof createFakeDb>;
vi.mock("@/lib/admin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/db")>()),
  adminDb: async () => db,
}));

const { attachRecurringToInvoice, detachRecurringFromInvoice } = await import("@/lib/payments/actions");

const invoice = (overrides: Record<string, unknown> = {}) => ({
  id: "inv-1",
  customer_id: "cust-1",
  project_id: "proj-1",
  issued_at: null,
  number_value: "FAC-CONCEPT-1",
  status: "draft",
  ...overrides,
});

const service = (overrides: Record<string, unknown> = {}) => ({
  id: "svc-1",
  customer_id: "cust-1",
  name: "Websitebeheer",
  description: "",
  amount_cents: 2500,
  currency: "EUR",
  vat_rate: 21,
  billing_interval: "monthly",
  starts_on: null,
  status: "draft",
  project_id: null,
  activation_invoice_id: null,
  mollie_subscription_id: null,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
  ...overrides,
});

/*
  A collection is announced fourteen calendar days ahead and the invoice mail
  is that announcement, so the first date is counted from today rather than
  written as a fixed one that would age out of range.
*/
const days = (count: number) => addDays(toDateKey(new Date()), count);
const firstDebit = days(21);
const input = { name: "Websitebeheer", amountCents: 2500, vatRate: 21, startsOn: firstDebit };

beforeEach(() => {
  db = createFakeDb({ invoices: [invoice()], recurring_services: [] });
});

describe("linking a new monthly service to an invoice", () => {
  it("creates the service and points it at this invoice", async () => {
    const result = await attachRecurringToInvoice("inv-1", input);

    expect(result.ok).toBe(true);
    const [row] = db.rows("recurring_services");
    expect(row).toMatchObject({
      customer_id: "cust-1",
      name: "Websitebeheer",
      amount_cents: 2500,
      vat_rate: 21,
      billing_interval: "monthly",
      starts_on: firstDebit,
      activation_invoice_id: "inv-1",
      // Filed under the invoice's own project unless told otherwise.
      project_id: "proj-1",
      // Never active by hand: a payment and a mandate make it collect.
      status: "draft",
    });
  });

  it("files the service under the project the admin chose", async () => {
    await attachRecurringToInvoice("inv-1", { ...input, projectId: "proj-2" });
    expect(db.rows("recurring_services")[0].project_id).toBe("proj-2");
  });
});

describe("linking a service the customer already has", () => {
  /* The requirement: a second invoice must not create a second copy. */
  it("reuses the existing service instead of creating another", async () => {
    db = createFakeDb({ invoices: [invoice()], recurring_services: [service()] });

    const result = await attachRecurringToInvoice("inv-1", { ...input, serviceId: "svc-1" });

    expect(result).toEqual({ ok: true, value: "svc-1" });
    expect(db.rows("recurring_services")).toHaveLength(1);
    expect(db.rows("recurring_services")[0]).toMatchObject({
      activation_invoice_id: "inv-1",
      starts_on: firstDebit,
    });
  });

  it("refuses a service of another customer", async () => {
    db = createFakeDb({ invoices: [invoice()], recurring_services: [service({ customer_id: "cust-2" })] });

    const result = await attachRecurringToInvoice("inv-1", { ...input, serviceId: "svc-1" });

    expect(result).toEqual({ ok: false, error: "Deze dienst hoort bij een andere klant." });
  });

  it("refuses a service that already collects", async () => {
    db = createFakeDb({ invoices: [invoice()], recurring_services: [service({ mollie_subscription_id: "sub_1" })] });

    const result = await attachRecurringToInvoice("inv-1", { ...input, serviceId: "svc-1" });

    expect(result.ok).toBe(false);
  });
});

describe("what it refuses", () => {
  /*
    A sent invoice has already told the customer what paying it authorises.
    Changing that afterwards would leave two different promises standing.
  */
  it("refuses an invoice that has been sent", async () => {
    db = createFakeDb({
      invoices: [invoice({ issued_at: "2026-09-13T10:00:00.000Z", number_value: "YM-F-2026-000001" })],
      recurring_services: [],
    });

    const result = await attachRecurringToInvoice("inv-1", input);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("YM-F-2026-000001");
    expect(db.rows("recurring_services")).toHaveLength(0);
  });

  it("refuses an amount of nothing", async () => {
    expect(await attachRecurringToInvoice("inv-1", { ...input, amountCents: 0 })).toEqual({
      ok: false,
      error: "Vul een maandbedrag hoger dan nul in.",
    });
  });

  it("refuses a first collection date that is not a date", async () => {
    expect(await attachRecurringToInvoice("inv-1", { ...input, startsOn: "binnenkort" })).toEqual({
      ok: false,
      error: "Kies een geldige datum voor de eerste incasso.",
    });
  });

  /*
    Thirteen days leaves no room for the fourteen days' notice, so it is
    refused rather than warned about; fourteen is exactly enough.
  */
  it("refuses a first collection thirteen days away", async () => {
    const result = await attachRecurringToInvoice("inv-1", { ...input, startsOn: days(13) });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("minstens 14 dagen");
    expect(db.rows("recurring_services")).toHaveLength(0);
  });

  it("accepts a first collection fourteen days away", async () => {
    const result = await attachRecurringToInvoice("inv-1", { ...input, startsOn: days(14) });

    expect(result.ok).toBe(true);
    expect(db.rows("recurring_services")[0].starts_on).toBe(days(14));
  });

  it("refuses a first collection in the past", async () => {
    const result = await attachRecurringToInvoice("inv-1", { ...input, startsOn: days(-1) });

    expect(result.ok).toBe(false);
    expect(db.rows("recurring_services")).toHaveLength(0);
  });

  it("refuses a VAT rate that does not exist", async () => {
    expect(await attachRecurringToInvoice("inv-1", { ...input, vatRate: 13 })).toEqual({
      ok: false,
      error: "Kies een geldig btw-percentage.",
    });
  });
});

describe("unlinking", () => {
  it("leaves the service but stops this invoice activating it", async () => {
    db = createFakeDb({ invoices: [invoice()], recurring_services: [service({ activation_invoice_id: "inv-1" })] });

    const result = await detachRecurringFromInvoice("inv-1");

    expect(result.ok).toBe(true);
    expect(db.rows("recurring_services")).toHaveLength(1);
    expect(db.rows("recurring_services")[0].activation_invoice_id).toBeNull();
  });
});
