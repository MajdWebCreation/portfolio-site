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
  /* The agreement chain: one first revision per service, one successor per
     revision, one sequence number per position. */
  { table: "recurring_service_agreements", columns: ["recurring_service_id"], where: (row) => row.supersedes_id == null },
  { table: "recurring_service_agreements", columns: ["supersedes_id"], where: (row) => row.supersedes_id != null },
  { table: "recurring_service_agreements", columns: ["recurring_service_id", "sequence"] },
];

/**
 * The row-level rules the schema states in triggers and checks, mirrored
 * for the tables whose flows are tested here. Each returns an error the way
 * `raise exception` does, or mutates the row the way a BEFORE trigger does.
 */
function schemaRules(
  name: string,
  mode: "insert" | "update" | "delete",
  next: Row,
  rows: (table: string) => Row[],
  /** On an update: the columns being written. */
  payload: Row = {},
): { code?: string; message: string } | null {
  if (name === "recurring_services") {
    if (mode === "delete") {
      /* A used service is never removed; a draft that went nowhere may be. */
      const used =
        next.mollie_subscription_id != null ||
        next.cancellation_requested_at != null ||
        !["draft", "awaiting_mandate"].includes(String(next.status)) ||
        rows("invoices").some((row) => row.recurring_service_id === next.id) ||
        rows("recurring_price_changes").some((row) => row.recurring_service_id === next.id) ||
        rows("debit_prenotifications").some((row) => row.recurring_service_id === next.id);
      return used ? { code: "23514", message: `Dienst ${next.id} heeft financiële of contractuele historie en wordt niet verwijderd.` } : null;
    }
    if (mode === "update" && next.cancellation_contractual_ends_on != null && next.ends_on !== next.cancellation_contractual_ends_on && next.cancellation_deviation_source_kind == null) {
      return { code: "23514", message: 'new row violates check constraint "recurring_services_deviation_has_source"' };
    }
    return null;
  }
  if (name !== "recurring_service_agreements") return null;
  if (mode === "delete") {
    /* Only the cascade that follows the service itself being removed. */
    if (!rows("recurring_services").some((row) => row.id === next.recurring_service_id)) return null;
    return { code: "23514", message: `Een vastgelegde afsprakenversie wordt niet verwijderd; de historie van dienst ${next.recurring_service_id} blijft.` };
  }
  if ((next.terms_edition == null) !== (next.terms_published_on == null)) {
    return { code: "23514", message: 'new row violates check constraint "recurring_service_agreements_terms_set_complete"' };
  }
  if (mode === "update") {
    /* Only the offer reference clearing, as the foreign key does when the offer goes. */
    const keys = Object.keys(payload);
    if (keys.length === 1 && keys[0] === "source_quote_id" && payload.source_quote_id == null) return null;
    return { code: "23514", message: "Een vastgelegde afsprakenversie wordt niet gewijzigd; leg een nieuwe versie vast." };
  }
  const deviates = next.notice_months != null || next.minimum_term_months != null || next.proration_rule != null || (next.special_terms ?? "") !== "";
  if (next.source_kind === "standard_terms" && deviates) {
    return { code: "23514", message: 'new row violates check constraint "recurring_service_agreements_deviation_has_source"' };
  }
  if (next.source_kind !== "standard_terms" && next.accepted_on == null) {
    return { code: "23514", message: 'new row violates check constraint "recurring_service_agreements_source_accepted"' };
  }
  if (next.source_quote_id != null && next.source_kind !== "accepted_offer") {
    return { code: "23514", message: 'new row violates check constraint "recurring_service_agreements_quote_only_for_offer"' };
  }
  if (next.accepted_on != null && String(next.accepted_on) > String(next.effective_from)) {
    return { code: "23514", message: 'new row violates check constraint "recurring_service_agreements_accepted_before_effective"' };
  }
  const chain = rows("recurring_service_agreements");
  if (next.supersedes_id == null) {
    if (chain.some((row) => row.recurring_service_id === next.recurring_service_id)) {
      return { code: "23514", message: "Deze dienst heeft al afspraken vastgelegd; een nieuwe versie moet de huidige opvolgen." };
    }
    next.sequence = 1;
    return null;
  }
  const predecessor = chain.find((row) => row.id === next.supersedes_id);
  if (!predecessor) return { code: "23503", message: "De afsprakenversie die wordt opgevolgd bestaat niet." };
  if (predecessor.recurring_service_id !== next.recurring_service_id) {
    return { code: "23514", message: "De afsprakenversie die wordt opgevolgd hoort bij een andere dienst." };
  }
  if (String(next.effective_from) < String(predecessor.effective_from)) {
    return { code: "23514", message: `De ingangsdatum (${next.effective_from}) ligt vóór die van de vorige versie (${predecessor.effective_from}).` };
  }
  next.sequence = Number(predecessor.sequence) + 1;
  return null;
}

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
          const ruled = schemaRules(name, "insert", payload, reads.rows);
          if (ruled) return { data: [], error: ruled };
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
            const ruled = schemaRules(name, "update", { ...row, ...payload }, reads.rows, payload);
            if (ruled) return { data: [], error: ruled };
            const refused = options.trigger?.(name, { ...row, ...payload }, reads);
            if (refused) return { data: [], error: refused };
          }
          for (const row of matched) Object.assign(row, payload);
        }
        if (mode === "delete") {
          for (const row of matched) {
            const ruled = schemaRules(name, "delete", row, reads.rows);
            if (ruled) return { data: [], error: ruled };
          }
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

/**
 * `create_recurring_service` as the fake database runs it: the service and
 * its first revision in one go, and neither when the second is refused --
 * the transaction the SQL function has, mirrored by taking the service back
 * out. Composable with other fakes through `rpc` on `createFakeDb`.
 */
export function createRecurringServiceRpc(): FakeRpc {
  return async (name, args, db) => {
    if (name !== "create_recurring_service") return { data: null, error: { message: `rpc ${name} not provided` } };
    if (!db.rows("customers").some((row) => row.id === args.p_customer_id)) {
      return { data: null, error: { code: "23503", message: 'insert or update on table "recurring_services" violates foreign key constraint "recurring_services_customer_id_fkey"' } };
    }
    const services = db.rows("recurring_services");
    const id = `recurring_services-${services.length + 1}`;
    const service: Row = {
      id,
      customer_id: args.p_customer_id,
      name: args.p_name,
      description: args.p_description,
      amount_cents: args.p_amount_cents,
      vat_rate: args.p_vat_rate,
      billing_interval: "monthly",
      starts_on: args.p_starts_on ?? null,
      status: args.p_status,
      mollie_subscription_id: null,
      ends_on: null,
      cancellation_requested_at: null,
      created_at: "2026-10-10T10:00:00.000Z",
      updated_at: "2026-10-10T10:00:00.000Z",
    };
    services.push(service);
    const revision: Row = {
      id: `recurring_service_agreements-${db.rows("recurring_service_agreements").length + 1}`,
      recurring_service_id: id,
      customer_id: args.p_customer_id,
      sequence: 0,
      supersedes_id: null,
      effective_from: args.p_effective_from,
      source_kind: "standard_terms",
      source_quote_id: null,
      source_label: args.p_terms_edition == null ? null : `Algemene Voorwaarden B2B ${args.p_terms_edition}`,
      accepted_on: null,
      notice_months: null,
      minimum_term_months: null,
      proration_rule: null,
      special_terms: "",
      terms_edition: args.p_terms_edition ?? null,
      terms_published_on: args.p_terms_published_on ?? null,
      note: args.p_note,
      created_by: args.p_created_by ?? null,
      created_at: "2026-10-10T10:00:00.000Z",
    };
    const refused =
      revision.source_label == null
        ? { code: "23502", message: 'null value in column "source_label" of relation "recurring_service_agreements" violates not-null constraint' }
        : schemaRules("recurring_service_agreements", "insert", revision, db.rows);
    if (refused) {
      services.splice(services.indexOf(service), 1);
      return { data: null, error: refused };
    }
    db.rows("recurring_service_agreements").push(revision);
    return { data: id, error: null };
  };
}
