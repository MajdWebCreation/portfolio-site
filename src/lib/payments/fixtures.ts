import type { Invoice, InvoiceStatus } from "@/lib/admin/invoices/types";
import type { CustomerSnapshot } from "@/lib/admin/documents/types";
import type { Payment, PaymentStatus, RecurringService } from "@/lib/payments/types";

/**
 * Builders for tests and local reasoning, in the same place the other admin
 * modules keep theirs. Nothing here is used by the running application.
 */
export const testCustomer: CustomerSnapshot = {
  customerId: "cust-1",
  companyName: "Alfa BV",
  contactName: "A. Alfa",
  email: "a@example.com",
  street: "Straat 1",
  postalCode: "1011 AA",
  city: "Amsterdam",
  country: "Nederland",
};

/** One line of exactly `netCents` excluding VAT, at 21%. */
export function invoiceFixture(overrides: Partial<Invoice> & { netCents?: number } = {}): Invoice {
  const { netCents = 10000, ...rest } = overrides;
  return {
    id: "inv-1",
    number: { value: "YM-F-2026-000001", provisional: false },
    status: "sent" as InvoiceStatus,
    customer: testCustomer,
    issueDate: "2026-09-01",
    dueDate: "2026-09-15",
    paymentReference: "YM-F-2026-000001",
    lines: [{ id: "l1", description: "Werk", quantityHundredths: 100, unitPriceCents: netCents, vatRate: 21 }],
    notes: "",
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...rest,
  };
}

export function paymentFixture(overrides: Partial<Payment> = {}): Payment {
  const status = (overrides.status ?? "paid") as PaymentStatus;
  return {
    id: "pay-1",
    invoiceId: "inv-1",
    customerId: "cust-1",
    amountCents: 12100,
    currency: "EUR",
    status,
    source: "mollie",
    providerPaymentId: "tr_1",
    description: "Factuur",
    createdAt: "2026-09-02T10:00:00.000Z",
    updatedAt: "2026-09-02T10:00:00.000Z",
    ...(status === "paid" ? { paidAt: "2026-09-02T10:00:00.000Z" } : {}),
    ...overrides,
  };
}

export function recurringFixture(overrides: Partial<RecurringService> = {}): RecurringService {
  return {
    id: "svc-1",
    customerId: "cust-1",
    name: "Websitebeheer",
    description: "",
    amountCents: 2500,
    currency: "EUR",
    vatRate: 21,
    interval: "monthly",
    status: "awaiting_mandate",
    mollie: {},
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

/**
 * A tiny in-memory stand-in for the Supabase query builder, covering exactly
 * the chains the payment modules use. It also enforces the unique keys the
 * real schema has, so a test that would break in Postgres breaks here too.
 */
type Row = Record<string, unknown>;
type Unique = { table: string; columns: string[]; where?: (row: Row) => boolean };

const uniques: Unique[] = [
  { table: "customer_payment_providers", columns: ["customer_id", "provider"] },
  { table: "customer_payment_providers", columns: ["provider", "provider_customer_id"] },
  { table: "payments", columns: ["source", "provider_payment_id"], where: (row) => row.provider_payment_id != null },
  { table: "invoice_payment_links", columns: ["invoice_id", "customer_id"] },
  { table: "invoice_payment_links", columns: ["provider", "provider_payment_link_id"] },
  {
    table: "invoices",
    columns: ["recurring_service_id", "billing_period_start"],
    where: (row) => row.recurring_service_id != null,
  },
];

export class UniqueViolation extends Error {
  readonly code = "23505";
  constructor(table: string) {
    super(`duplicate key value violates unique constraint on ${table}`);
  }
}

export function createFakeDb(seed: Record<string, Row[]> = {}) {
  const tables = new Map<string, Row[]>(Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
  const table = (name: string) => {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name)!;
  };

  function assertUnique(name: string, row: Row) {
    for (const rule of uniques) {
      if (rule.table !== name) continue;
      if (rule.where && !rule.where(row)) continue;
      const clash = table(name).some(
        (existing) => (!rule.where || rule.where(existing)) && rule.columns.every((column) => existing[column] === row[column]),
      );
      if (clash) throw new UniqueViolation(name);
    }
  }

  function builder(name: string) {
    const filters: ((row: Row) => boolean)[] = [];
    let mode: "select" | "insert" | "update" = "select";
    let payload: Row = {};
    let inserted: Row | undefined;

    const api = {
      select() {
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return api;
      },
      neq(column: string, value: unknown) {
        filters.push((row) => row[column] !== value);
        return api;
      },
      is(column: string, value: null) {
        filters.push((row) => (row[column] ?? null) === value);
        return api;
      },
      order() {
        return api;
      },
      insert(row: Row) {
        mode = "insert";
        payload = { id: `${name}-${table(name).length + 1}`, created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z", ...row };
        return api;
      },
      update(row: Row) {
        mode = "update";
        payload = row;
        return api;
      },
      run(): { data: Row[]; error: { code?: string; message: string } | null } {
        if (mode === "insert") {
          try {
            assertUnique(name, payload);
          } catch (error) {
            return { data: [], error: { code: "23505", message: (error as Error).message } };
          }
          table(name).push(payload);
          inserted = payload;
          return { data: [payload], error: null };
        }
        const matched = table(name).filter((row) => filters.every((test) => test(row)));
        if (mode === "update") {
          for (const row of matched) Object.assign(row, payload);
        }
        return { data: matched, error: null };
      },
      async maybeSingle() {
        const { data, error } = api.run();
        return { data: data[0] ?? null, error };
      },
      async single() {
        const { data, error } = api.run();
        return { data: data[0] ?? null, error: error ?? (data[0] ? null : { message: "no rows" }) };
      },
      then(resolve: (value: { data: Row[]; error: unknown }) => unknown) {
        const result = api.run();
        return Promise.resolve(resolve({ data: mode === "insert" && inserted ? [inserted] : result.data, error: result.error }));
      },
    };
    return api;
  }

  return {
    from: (name: string) => builder(name),
    rows: (name: string) => table(name),
    all: tables,
  };
}
