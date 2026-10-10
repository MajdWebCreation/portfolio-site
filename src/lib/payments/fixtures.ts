import {
  recipientFromCustomer,
  type CustomerContactRow,
  type CustomerRecipient,
} from "@/lib/admin/communications/recipient";
import { fakeInvoiceStorage, fixtureDocumentPath, fixturePdfBytes, fixturePdfSha256 } from "@/lib/admin/invoices/storage-fixture";
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

/**
 * The `customers` row behind `testCustomer`, as the database holds it now.
 * Seed it into a fake database for any flow that mails the customer: the
 * recipient is read from here, never from the document's copy.
 */
export function customerRowFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: testCustomer.customerId,
    company_name: testCustomer.companyName,
    contact_name: testCustomer.contactName,
    email: testCustomer.email,
    ...overrides,
  };
}

/** A resolved recipient for `testCustomer`, through the real resolver. */
export function recipientFixture(overrides: Partial<CustomerContactRow> = {}): CustomerRecipient {
  const result = recipientFromCustomer({
    id: testCustomer.customerId,
    contact_name: testCustomer.contactName,
    email: testCustomer.email,
    ...overrides,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.recipient;
}

/**
 * One line of exactly `netCents` excluding VAT, at 21%.
 *
 * Definitive by default -- numbered, issued, with a stored document, and
 * sent -- because that is the state most of the payment side only ever sees.
 * A concept is built by overriding the number, the status, `finalizingAt`,
 * `issuedAt` and `document` together, the way the database's own constraints
 * require them to agree.
 */
export function invoiceFixture(overrides: Partial<Invoice> & { netCents?: number } = {}): Invoice {
  const { netCents = 10000, ...rest } = overrides;
  return {
    id: "inv-1",
    number: { value: "YM-F-2026-000001", provisional: false },
    status: "sent" as InvoiceStatus,
    finalizingAt: "2026-09-01T09:00:00.000Z",
    issuedAt: "2026-09-01T09:00:00.000Z",
    document: {
      path: fixtureDocumentPath,
      sha256: fixturePdfSha256,
      bytes: fixturePdfBytes.byteLength,
      generatedAt: "2026-09-01T09:00:00.000Z",
    },
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
  /* One reminder stage per invoice: the index that makes the daily run safe
     to repeat. A test that would send twice fails here, as it would in
     Postgres. */
  { table: "invoice_collection_events", columns: ["invoice_id", "stage"] },
  { table: "invoice_collections", columns: ["invoice_id"] },
  /* The direct debit activation links: one row per Mollie link and payment,
     and at most one payable link per customer. */
  { table: "mandate_activations", columns: ["provider", "provider_payment_link_id"] },
  {
    table: "mandate_activations",
    columns: ["provider", "provider_payment_id"],
    where: (row) => row.provider_payment_id != null,
  },
  {
    table: "mandate_activations",
    columns: ["customer_id"],
    where: (row) => row.paid_at == null && row.archived_at == null,
  },
  /* One price change in flight per service. */
  {
    table: "recurring_price_changes",
    columns: ["recurring_service_id"],
    where: (row) => row.applied_at == null && row.canceled_at == null,
  },
  /* One credit note per cancellation credit, one Mollie refund in flight
     per credit note, one row per Mollie refund: the indexes that make a
     double click harmless. */
  { table: "credit_notes", columns: ["recurring_service_id"], where: (row) => row.source === "cancellation_credit" },
  {
    table: "refunds",
    columns: ["credit_note_id"],
    where: (row) => row.method === "mollie" && row.provider_refund_id == null && row.status === "pending",
  },
  { table: "refunds", columns: ["provider", "provider_refund_id"], where: (row) => row.provider_refund_id != null },
  { table: "refunds", columns: ["idempotency_key"] },
];

export class UniqueViolation extends Error {
  readonly code = "23505";
  constructor(table: string) {
    super(`duplicate key value violates unique constraint on ${table}`);
  }
}

export type FakeRpc = (name: string, args: Record<string, unknown>, db: { rows: (name: string) => Row[] }) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;

/**
 * A row-level trigger, as a test supplies it: called with the row as it
 * would be after an insert or update, and with the table's other rows; an
 * error refuses the write, the way `raise exception` does.
 */
export type FakeTrigger = (table: string, next: Row, db: { rows: (name: string) => Row[] }) => { code?: string; message: string } | null;

export function createFakeDb(seed: Record<string, Row[]> = {}, options: { rpc?: FakeRpc; trigger?: FakeTrigger } = {}) {
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

  /*
    Embedded resources, the way PostgREST resolves `invoice_lines ( ... )` in
    a select: the child rows of each parent, under the relation's name. Only
    the relations the admin readers use.
  */
  const embeds: Record<string, Record<string, string>> = {
    invoices: { invoice_lines: "invoice_id", credit_notes: "invoice_id" },
    credit_notes: { credit_note_lines: "credit_note_id" },
    quotes: { quote_lines: "quote_id" },
  };

  function builder(name: string) {
    const filters: ((row: Row) => boolean)[] = [];
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row = {};
    let inserted: Row | undefined;
    let embedded: string[] = [];

    const api = {
      select(columns?: string) {
        embedded = columns ? [...columns.matchAll(/(\w+)\s*\(/g)].map((match) => match[1]!).filter((relation) => embeds[name]?.[relation]) : [];
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return api;
      },
      in(column: string, values: unknown[]) {
        filters.push((row) => values.includes(row[column]));
        return api;
      },
      not(column: string, operator: string, value: unknown) {
        filters.push((row) => (operator === "is" ? (row[column] ?? null) !== value : row[column] !== value));
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
      /* Date keys and ISO timestamps compare as strings, as they do in SQL. */
      lt(column: string, value: string) {
        filters.push((row) => row[column] != null && String(row[column]) < value);
        return api;
      },
      lte(column: string, value: string) {
        filters.push((row) => row[column] != null && String(row[column]) <= value);
        return api;
      },
      gt(column: string, value: string) {
        filters.push((row) => row[column] != null && String(row[column]) > value);
        return api;
      },
      gte(column: string, value: string) {
        filters.push((row) => row[column] != null && String(row[column]) >= value);
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
      /* One row per conflict column, the way the real upsert behaves. */
      upsert(row: Row, options?: { onConflict?: string }) {
        const key = options?.onConflict;
        const existing = key ? table(name).find((candidate) => candidate[key] === row[key]) : undefined;
        if (existing) {
          Object.assign(existing, row, { updated_at: "2026-09-01T00:00:00.000Z" });
          mode = "update";
          payload = {};
          inserted = existing;
          return api;
        }
        return api.insert(row);
      },
      delete() {
        mode = "delete";
        return api;
      },
      run(): { data: Row[]; error: { code?: string; message: string } | null } {
        const reads = { rows: (table_name: string) => table(table_name) };
        if (mode === "insert") {
          try {
            assertUnique(name, payload);
          } catch (error) {
            return { data: [], error: { code: "23505", message: (error as Error).message } };
          }
          const refused = options.trigger?.(name, payload, reads);
          if (refused) return { data: [], error: refused };
          table(name).push(payload);
          inserted = payload;
          return { data: [payload], error: null };
        }
        const matched = table(name).filter((row) => filters.every((test) => test(row)));
        if (mode === "update") {
          for (const row of matched) {
            const refused = options.trigger?.(name, { ...row, ...payload }, reads);
            if (refused) return { data: [], error: refused };
          }
          for (const row of matched) Object.assign(row, payload);
        }
        if (mode === "delete") {
          const rows = table(name);
          for (const row of matched) rows.splice(rows.indexOf(row), 1);
        }
        /* Copies, as Postgres returns: a row read earlier must not change
           under its reader when someone else writes, or a compare-and-swap
           would compare against what it is about to overwrite. */
        /* A row seeded with its children inline keeps them; otherwise the child table is consulted. */
        const withEmbeds = (row: Row): Row => ({
          ...row,
          ...Object.fromEntries(
            embedded
              .filter((relation) => row[relation] === undefined)
              .map((relation) => [relation, table(relation).filter((child) => child[embeds[name]![relation]!] === row.id).map((child) => ({ ...child }))]),
          ),
        });
        return { data: matched.map(withEmbeds), error: null };
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

  /*
    Storage rides along with the database, because the code that issues an
    invoice uses one client for both: the row and the PDF are two halves of
    one document, and a test that has only one half cannot follow it.
  */
  const bucket = fakeInvoiceStorage();

  const handle = {
    from: (name: string) => builder(name),
    rows: (name: string) => table(name),
    all: tables,
    storage: bucket.storage,
    bucket,
    /* Database functions, when a test supplies them; see credit-notes/test-support.ts. */
    rpc: async (name: string, args: Record<string, unknown> = {}) =>
      options.rpc ? options.rpc(name, args, { rows: (table_name: string) => table(table_name) }) : { data: null, error: { message: `rpc ${name} not provided` } },
  };
  return handle;
}
