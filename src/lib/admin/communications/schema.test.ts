import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { communicationCategoryOrder } from "@/lib/admin/communications/types";

/*
  The two guarantees that cannot be tested by calling something.

  One: every customer mail goes out through one door and is registered there.
  A flow that built its own Resend client, or wrote its own row, would be a
  flow that can forget -- so neither is allowed to exist anywhere else in the
  source.

  Two: the table itself. Admins only, no anon, append-only, and a link that
  can never reach across to another customer. Those live in SQL, so they are
  checked against the SQL.
*/
const root = join(process.cwd(), "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

const files = sourceFiles(root).map((path) => ({
  path: path.replace(root, "src"),
  source: readFileSync(path, "utf8"),
}));

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260914202516_customer_communications.sql"),
  "utf8",
);

describe("one door out", () => {
  /*
    The contact route is the exception and stays one: it answers a visitor who
    filled in the form and has no customer record yet, so there is nothing to
    file its mail under. Everything addressed to a customer goes through the
    provider module.
  */
  it("constructs the mail provider in exactly two places", () => {
    const builders = files.filter(({ source }) => source.includes("new Resend("));
    expect(builders.map(({ path }) => path).sort()).toEqual([
      "src/app/api/contact/route.ts",
      "src/lib/admin/communications/provider.ts",
    ]);
  });

  it("reads the mail credentials only in the provider and the contact route", () => {
    const readers = files.filter(({ source }) => source.includes("process.env.RESEND_API_KEY"));
    expect(readers.map(({ path }) => path).sort()).toEqual([
      "src/app/api/contact/route.ts",
      "src/lib/admin/communications/provider.ts",
    ]);
  });

  /*
    No mail flow writes its own communication. The table is named by the
    writer, the reader that maps it back, and the generated database types --
    and by nothing that sends a mail.
  */
  it("writes the log from exactly one module", () => {
    const writers = files.filter(({ source }) => source.includes('from("customer_communications")'));
    expect(writers.map(({ path }) => path).sort()).toEqual([
      "src/lib/admin/communications/log.ts",
      "src/lib/admin/communications/repository.ts",
    ]);
  });

  it("keeps the log off every client component", () => {
    const clientFiles = files.filter(({ source }) => /^\s*["']use client["']/.test(source));
    const offenders = clientFiles.filter(({ source }) => source.includes("communications/log") || source.includes("communications/send"));
    expect(offenders.map(({ path }) => path)).toEqual([]);
  });
});

describe("the table", () => {
  it("is closed to anon and forces row level security", () => {
    expect(migration).toContain("alter table public.customer_communications enable row level security");
    expect(migration).toContain("alter table public.customer_communications force row level security");
    expect(migration).toContain("revoke all on table public.customer_communications from anon, authenticated");
  });

  it("lets admins read and append, and nothing else", () => {
    expect(migration).toContain("grant select, insert on table public.customer_communications to authenticated");
    expect(migration).not.toMatch(/grant[^;]*update[^;]*on table public\.customer_communications/);
    expect(migration).not.toMatch(/grant[^;]*delete[^;]*on table public\.customer_communications/);
    expect(migration).toContain("using (private.is_admin()) with check (private.is_admin())");
  });

  /*
    Customer A's mail can never be filed against customer B's document: each
    link is matched as a pair with the customer, against the same pair on the
    referenced table.
  */
  /*
    A quote is reached by (id, customer_id), and that key was dropped when the
    one-quote-per-project link went. The migration puts it back, or the
    reference below has nothing to point at.
  */
  it("restores the key the quote link needs", () => {
    expect(migration).toContain(
      "alter table public.quotes\n  add constraint quotes_id_customer_unique unique (id, customer_id);",
    );
  });

  it("makes every link a same-customer link", () => {
    for (const [column, table] of [
      ["invoice_id", "invoices"],
      ["quote_id", "quotes"],
      ["project_id", "projects"],
      ["recurring_service_id", "recurring_services"],
    ]) {
      expect(migration).toContain(
        `foreign key (${column}, customer_id) references public.${table} (id, customer_id)`,
      );
    }
  });

  /*
    A delete may clear the link, never the customer the row belongs to. Each
    composite reference names the one column it is allowed to blank, so
    customer_id -- NOT NULL, and the row's whole reason to exist -- is never
    part of it.
  */
  it("never lets a delete blank the customer", () => {
    for (const column of ["invoice_id", "quote_id", "project_id", "recurring_service_id"]) {
      expect(migration).toContain(`on delete set null (${column})`);
    }
    expect(migration).not.toContain("on delete set null (customer_id");
    expect(migration).not.toContain("customer_id uuid not null references public.customers (id) on delete set null");
  });

  /*
    Resend reports acceptance or refusal at send time and nothing after it, so
    those are the only two states. No delivery, open or click tracking, which
    this application does not have and would otherwise be inventing.
  */
  it("only records a status the provider actually reports", () => {
    expect(migration).toContain("check (status in ('sent', 'failed'))");
    expect(migration).toContain("check ((status = 'sent') = (sent_at is not null))");
    const statuses = migration.slice(migration.indexOf("check (status in ("));
    const allowed = [...statuses.slice(0, statuses.indexOf("))")).matchAll(/'([a-z_]+)'/g)].map(([, value]) => value);
    expect(allowed).toEqual(["sent", "failed"]);
  });

  /* The check constraint and the TypeScript union are one list. */
  it("allows exactly the categories the application can write", () => {
    const list = migration.slice(migration.indexOf("category text not null check (category in ("));
    const allowed = [...list.slice(0, list.indexOf("))")).matchAll(/'([a-z_]+)'/g)].map(([, value]) => value);
    expect(allowed.sort()).toEqual([...communicationCategoryOrder].sort());
  });
});
