import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/* The payment-context migration, pinned as text; its behaviour is proven in payments.integration.test.ts. */
const sql = readFileSync("supabase/migrations/20261012150000_portal_payment_actions.sql", "utf8");

describe("the portal payment migration", () => {
  it("adds one read, a definer that checks the membership first and is closed to anon", () => {
    const body = sql.slice(sql.indexOf("create or replace function public.portal_payment_context"));
    expect(body).toContain("security definer");
    expect(body).toContain("set search_path = ''");
    expect(body.slice(body.indexOf("begin") + 5).trim().startsWith("perform private.portal_require_customer(p_customer_id);")).toBe(true);
    expect(sql).toContain("revoke all on function public.portal_payment_context(uuid) from public, anon;");
    expect(sql).toContain("grant execute on function public.portal_payment_context(uuid) to authenticated;");
  });

  it("returns no link, id or payment of the provider", () => {
    const body = sql.slice(sql.indexOf("create or replace function public.portal_payment_context"));
    for (const column of ["checkout_url", "provider_payment_link_id", "provider_customer_id", "provider_payment_id", "mandate_id'", "'provider_mandate_id'"]) {
      expect(body, column).not.toContain(column);
    }
    expect(body).not.toMatch(/select\s+\*/i);
  });

  it("only widens the record of portal actions, and adds no policy", () => {
    expect(sql).toContain("'invoice_payment_started', 'mandate_activation_requested'");
    expect(sql).not.toMatch(/create policy/);
    expect(sql).not.toMatch(/\bdrop (table|function|view|policy)\b/);
  });
});
