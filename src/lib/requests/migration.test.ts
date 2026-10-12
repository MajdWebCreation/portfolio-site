import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/* The requests migration's rules, pinned as text; the behaviour is proven in portal/requests.integration.test.ts. */
const sql = readFileSync("supabase/migrations/20261012210000_customer_requests.sql", "utf8");

function body(name: string): string {
  const start = sql.indexOf(`create or replace function ${name}`);
  return sql.slice(start, sql.indexOf("$$;", start));
}

describe("the requests migration", () => {
  it("makes every portal function a definer with an empty search path that checks the membership first", () => {
    for (const name of ["public.portal_create_request", "public.portal_requests", "public.portal_request", "public.portal_register_request_attachment", "public.portal_request_attachment"]) {
      const fn = body(name);
      expect(fn, name).toContain("security definer");
      expect(fn, name).toContain("set search_path = ''");
      expect(fn.slice(fn.indexOf("begin") + 5).trim().startsWith("perform private.portal_require_customer(p_customer_id);"), name).toBe(true);
      expect(sql, name).toMatch(new RegExp(`revoke all on function ${name.replace(".", "\\.")}\\([^)]*\\) from public, anon;`));
    }
    expect(sql).not.toMatch(/select\s+\*/i);
  });

  it("gives customers no policy on the tables, and the admin only status, project and quote", () => {
    expect(sql).not.toMatch(/create policy[^;]*on public\.customer_requests[^;]*for (insert|delete)/);
    expect(sql).toContain("grant update (status, project_id, quote_id) on table public.customer_requests to authenticated;");
    const policies = [...sql.matchAll(/create policy (\w+)\s+on ([\w.]+) for (\w+)/g)].map((match) => `${match[2]}:${match[3]}:${match[1]}`);
    for (const policy of policies.filter((item) => item.startsWith("public."))) expect(policy).toMatch(/_admin_(read|update)$/);
  });

  it("keeps the bucket private, typed and sized, and every storage policy behind a definer check", () => {
    expect(sql).toContain("values ('request-attachments', 'request-attachments', false, 15728640,");
    expect(sql).not.toMatch(/svg|text\/html|javascript|zip/);
    for (const check of ["portal_can_upload_request_attachment(name)", "portal_can_read_request_attachment(name)", "portal_can_discard_request_upload(name)"]) {
      expect(sql).toContain(`private.${check}`);
    }
    expect(sql).not.toMatch(/on storage\.objects for update/);
  });

  it("links a request only to the same customer's project and quote", () => {
    expect(sql).toContain("foreign key (project_id, customer_id) references public.projects (id, customer_id)");
    expect(sql).toContain("foreign key (quote_id, customer_id) references public.quotes (id, customer_id)");
    expect(sql).toContain("constraint customer_requests_one_per_submission unique (customer_id, submission_id)");
  });
});
