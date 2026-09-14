import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { reminderSteps } from "@/lib/payments/collection-policy";
import { collectionStateOrder } from "@/lib/payments/collection-state";

/*
  What the reminder tables guarantee, checked against the SQL that creates
  them. These are the properties no amount of application code can provide:
  idempotency, who may write, and the fact that there is nowhere to put a fee
  even if somebody later tried.
*/
const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260914212751_payment_reminders.sql"),
  "utf8",
);

describe("idempotency", () => {
  /* The property the whole daily job rests on. */
  it("allows one row per stage per invoice, in the database", () => {
    expect(migration).toContain(
      "create unique index invoice_collection_events_stage_unique\n  on public.invoice_collection_events (invoice_id, stage);",
    );
  });

  it("knows exactly the stages the application can send", () => {
    const list = migration.slice(migration.indexOf("check (stage in ("));
    const allowed = [...list.slice(0, list.indexOf("))")).matchAll(/'([a-z_]+)'/g)].map(([, value]) => value);
    expect(allowed).toEqual(reminderSteps.map((step) => step.stage));
  });

  it("knows exactly the states an admin can set", () => {
    const list = migration.slice(migration.indexOf("check (state in ("));
    const allowed = [...list.slice(0, list.indexOf("))")).matchAll(/'([a-z_]+)'/g)].map(([, value]) => value);
    expect(allowed.sort()).toEqual([...collectionStateOrder].sort());
  });

  /* A row that says "sent" has a moment it was sent, and only then. */
  it("cannot record a send without a send time", () => {
    expect(migration).toContain("check ((status = 'sent') = (sent_at is not null))");
  });
});

describe("who may write", () => {
  it("closes both tables to anon and forces row level security", () => {
    for (const table of ["invoice_collection_events", "invoice_collections"]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`alter table public.${table} force row level security`);
      expect(migration).toContain(`revoke all on table public.${table} from anon, authenticated`);
      expect(migration).toContain(`create policy ${table}_admin_all on public.${table}`);
    }
    expect(migration).toContain("using (private.is_admin()) with check (private.is_admin())");
  });

  /* The events are a log of what happened; an admin reads and the job writes. */
  it("lets nobody edit or delete a reminder that went out", () => {
    expect(migration).toContain("grant select, insert on table public.invoice_collection_events to authenticated");
    expect(migration).not.toMatch(/grant[^;]*update[^;]*invoice_collection_events/);
    expect(migration).not.toMatch(/grant[^;]*delete[^;]*invoice_collection_events/);
  });

  /* A hold is a decision, so an admin may change and withdraw it. */
  it("lets an admin change what they decided", () => {
    expect(migration).toContain(
      "grant select, insert, update, delete on table public.invoice_collections to authenticated",
    );
  });
});

describe("one customer's reminder", () => {
  it("can never point at another customer's invoice", () => {
    expect(migration).toContain(
      "foreign key (invoice_id, customer_id) references public.invoices (id, customer_id)",
    );
  });

  /* A hold carries no customer at all, so there is nothing to disagree with. */
  it("keeps the customer off the hold entirely", () => {
    const table = migration.slice(migration.indexOf("create table public.invoice_collections"));
    expect(table.slice(0, table.indexOf(");"))).not.toContain("customer_id");
  });
});

describe("the announced fee", () => {
  /*
    Structural, not a promise: there is no column in either table that could
    hold an amount, so no later code can quietly start charging one without a
    migration that somebody has to read.
  */
  it("has nowhere to live in the schema", () => {
    for (const word of ["amount_cents", "fee", "cost_cents", "interest"]) {
      expect(migration).not.toContain(word);
    }
  });

  it("is not added to the invoice either", () => {
    // The migration touches invoices only as the target of a reference.
    expect(migration).not.toMatch(/alter table public\.invoices/);
  });
});

describe("the invoice itself", () => {
  /*
    No new status, no new column. Which invoices are chased follows from the
    statuses that already exist, so there is no second invoice status system
    to keep in step with the first.
  */
  it("gains no collection column and no new status", () => {
    expect(migration).not.toContain("alter table public.invoices");
    expect(migration).not.toContain("collection_ready");
  });
});
