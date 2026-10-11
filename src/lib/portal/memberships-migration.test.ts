import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/* The rules the membership migration states, pinned as text; the behaviour is proven in memberships.integration.test.ts. */
const sql = readFileSync("supabase/migrations/20261011230000_portal_memberships.sql", "utf8");

describe("the portal membership migration", () => {
  it("models memberships as rows that are revoked, never deleted", () => {
    expect(sql).toContain("create table public.customer_users");
    expect(sql).toContain("constraint customer_users_one_per_customer unique (user_id, customer_id)");
    expect(sql).toContain("revoked_at     timestamptz");
    expect(sql).toContain("grant select, insert, update on table public.customer_users to authenticated");
    expect(sql).not.toMatch(/grant[^;]*delete[^;]*customer_users/);
    expect(sql).toContain("role           text not null default 'member' check (role in ('member'))");
  });

  it("forces row level security on both tables and lets a member read only their own rows", () => {
    expect(sql).toContain("alter table public.customer_users force row level security");
    expect(sql).toContain("alter table public.portal_events force row level security");
    expect(sql).toContain("using ((select auth.uid()) = user_id)");
    expect(sql).not.toMatch(/create policy[^;]*to anon/);
  });

  it("adds no customer policy to any business table", () => {
    for (const table of ["public.customers", "public.quotes", "public.invoices", "public.recurring_services", "public.payments", "public.projects"]) {
      expect(sql).not.toMatch(new RegExp(`create policy[^;]*on ${table.replace(".", "\\.")}`));
    }
  });

  it("defines the tenant boundary as active memberships of the caller, out of reach of anon", () => {
    const fn = sql.slice(sql.indexOf("create or replace function private.portal_customer_ids()"));
    const body = fn.slice(0, fn.indexOf("$$;"));
    expect(body).toContain("security definer");
    expect(body).toContain("stable");
    expect(body).toContain("set search_path = ''");
    expect(body).toContain("m.user_id = (select auth.uid())");
    expect(body).toContain("m.revoked_at is null");
    expect(sql).toContain("revoke all on function private.portal_customer_ids() from public, anon;");
    expect(sql).toContain("grant execute on function private.portal_customer_ids() to authenticated;");
  });

  it("gives a member exactly one read: their memberships by customer name", () => {
    const fn = sql.slice(sql.indexOf("create or replace function public.portal_memberships()"));
    const body = fn.slice(0, fn.indexOf("$$;"));
    expect(body).toContain("security definer");
    expect(body).toContain("select m.customer_id, c.company_name, m.role, m.accepted_at");
    expect(body).not.toMatch(/c\.(email|notes|phone|kvk_number|vat_number|street)/);
    expect(sql).toContain("revoke all on function public.portal_memberships() from public, anon;");
  });

  it("records events append-only and lets a member log only their own two actions", () => {
    expect(sql).toContain("grant select, insert on table public.portal_events to authenticated");
    expect(sql).not.toMatch(/grant[^;]*(update|delete)[^;]*portal_events/);
    expect(sql).toContain("if p_action not in ('password_changed', 'customer_selected') then");
    expect(sql).toContain("if v_user is null or cardinality(v_ids) = 0 then");
    expect(sql).toContain("if p_customer_id is null or not (p_customer_id = any (v_ids)) then");
  });

  it("makes the admin's invitation idempotent and names what it found", () => {
    const fn = sql.slice(sql.indexOf("create or replace function public.admin_upsert_portal_membership"));
    const body = fn.slice(0, fn.indexOf("$$;"));
    expect(body).toContain("security invoker");
    expect(body).toContain("if not private.is_admin() then");
    expect(body).toContain("for update");
    for (const outcome of ["'invited'", "'reactivated'", "'reinvited'", "'already_member'"]) {
      expect(body).toContain(`v_outcome := ${outcome}`);
    }
  });

  it("stores no token, password or secret column", () => {
    expect(sql).not.toMatch(/\b(token|password|secret)\w*\s+(text|bytea|jsonb)/i);
  });
});
