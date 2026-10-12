import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
  The rules every portal read function follows, pinned against the
  migration's text; what they do against a real database is proven in
  read-models.integration.test.ts.
*/
const sql = readFileSync("supabase/migrations/20261012120000_portal_read_models.sql", "utf8");

/** Each `create or replace function` with its body, up to the closing `$$;`. */
function functions(source: string): { name: string; signature: string; body: string }[] {
  const parts = source.split("create or replace function ").slice(1);
  return parts.map((part) => {
    const name = part.slice(0, part.indexOf("(")).trim();
    const body = part.slice(0, part.indexOf("$$;") + 3);
    const signature = part.slice(0, part.indexOf(")") + 1);
    return { name, signature, body };
  });
}

const all = functions(sql);
const publicReads = all.filter(({ name }) => name.startsWith("public.portal_"));

/** "uuid, text, uuid" for `public.portal_document(p_customer_id uuid, p_kind text, p_id uuid)`. */
function argumentTypes(signature: string): string {
  const inside = signature.slice(signature.indexOf("(") + 1, signature.lastIndexOf(")"));
  return inside
    .split(",")
    .map((arg) => arg.trim().split(/\s+/).at(-1))
    .join(", ");
}

describe("the portal read migration", () => {
  it("defines the seven bounded reads", () => {
    expect(publicReads.map(({ name }) => name).sort()).toEqual([
      "public.portal_customer",
      "public.portal_document",
      "public.portal_invoice",
      "public.portal_invoices",
      "public.portal_quote",
      "public.portal_quotes",
      "public.portal_services",
    ]);
  });

  it("makes every public read a definer with an empty search path that checks the membership first", () => {
    for (const fn of publicReads) {
      expect(fn.body, fn.name).toContain("security definer");
      expect(fn.body, fn.name).toContain("set search_path = ''");
      expect(fn.body, fn.name).toContain("stable");
      const begin = fn.body.indexOf("begin");
      const firstStatement = fn.body.slice(begin + "begin".length).trim();
      expect(firstStatement.startsWith("perform private.portal_require_customer(p_customer_id);"), fn.name).toBe(true);
    }
  });

  it("lets only authenticated callers execute them", () => {
    for (const fn of publicReads) {
      const types = argumentTypes(fn.signature);
      const name = fn.name.replace(".", "\\.");
      expect(sql, fn.name).toMatch(new RegExp(`revoke all on function ${name}\\(${types}\\)\\s+from public, anon;`));
      expect(sql, fn.name).toMatch(new RegExp(`grant execute on function ${name}\\(${types}\\)\\s+to authenticated;`));
    }
  });

  it("keeps the private helpers out of reach of every client role", () => {
    expect(sql).toContain("revoke all on function private.portal_require_customer(uuid) from public, anon, authenticated;");
    expect(sql).toContain("revoke all on function private.portal_invoice_rows(uuid, uuid) from public, anon, authenticated;");
    expect(sql).toContain("revoke all on function private.portal_quote_rows(uuid, uuid) from public, anon, authenticated;");
    expect(sql).toMatch(/revoke all on private\.portal_visible_invoices[^;]*from public, anon, authenticated;/);
    /* The storage policy runs as the member, so this one helper is theirs to execute -- and answers only yes or no. */
    expect(sql).toContain("grant execute on function private.portal_can_read_document(text) to authenticated;");
    expect(sql).toMatch(/private\.portal_can_read_document\(p_name text\)\s+returns boolean/);
  });

  it("refuses with one error code, whatever the reason", () => {
    expect(sql.match(/raise exception '([^']*)' using errcode = '([^']*)'/g)?.every((line) => line.includes("'42501'"))).toBe(true);
  });

  it("names its columns: no select *, no dynamic SQL", () => {
    expect(sql).not.toMatch(/select\s+\*/i);
    expect(sql).not.toMatch(/\.\*/);
    expect(sql).not.toMatch(/\bexecute\s+(format|')/i);
  });

  it("returns no internal column", () => {
    const forbidden = [
      "notes",
      "intro",
      "provider_payment_id",
      "provider_refund_id",
      "mollie_subscription_id,",
      "lifecycle_problem",
      "subscription_claim",
      "activation_note",
      "finalizing_at",
      "idempotency_key",
      "claimed_at",
      "failure_reason",
      "created_by",
      "source_inquiry_id",
      "source_lead_id",
      "cancellation_deviation",
      "special_terms,",
      "'note'",
      "recipient_email",
    ];
    /* Only the projections count; the visibility views read some of these to decide, they never return them. */
    for (const fn of publicReads.concat(all.filter(({ name }) => name.endsWith("_rows")))) {
      const returns = fn.body.slice(fn.body.indexOf("returns"), fn.body.indexOf("language"));
      for (const column of forbidden) {
        expect(returns, `${fn.name} returns ${column}`).not.toMatch(new RegExp(`\\b${column.replace(/[,']/g, "")}\\b`));
      }
      const projected = [...fn.body.matchAll(/'([a-z_]+)',\s/g)].map((match) => match[1]);
      for (const key of projected) {
        expect(forbidden.map((column) => column.replace(/[,']/g, "")), `${fn.name} jsonb key ${key}`).not.toContain(key);
      }
    }
  });

  it("adds no customer policy to a business table; storage gets one, through the helper", () => {
    const policies = [...sql.matchAll(/create policy (\w+)\s+on ([\w.]+)/g)].map((match) => `${match[1]} on ${match[2]}`);
    expect(policies).toEqual(["invoice_documents_portal_read on storage.objects"]);
    expect(sql).toContain("using (bucket_id = 'invoice-documents' and private.portal_can_read_document(name));");
  });

  it("decides visibility once, and never shows a concept or a legacy quote without document", () => {
    expect(sql).toContain("and not q.legacy_sent_without_document");
    expect(sql).toContain("and q.document_path is not null");
    expect(sql).toContain("where q.status <> 'draft'");
    expect(sql).toContain("and i.status in ('sent', 'overdue', 'paid')");
    expect(sql).toContain("where s.status <> 'draft'");
  });
});
