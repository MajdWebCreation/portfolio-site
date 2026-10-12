import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/* The profile migration's rules, pinned as text; its behaviour is proven in profile.integration.test.ts. */
const sql = readFileSync("supabase/migrations/20261012180000_customer_profile_editing.sql", "utf8");

function body(name: string): string {
  const start = sql.indexOf(`create or replace function ${name}`);
  return sql.slice(start, sql.indexOf("$$;", start));
}

describe("the profile migration", () => {
  it("writes through one definer function whose parameters are the whitelist", () => {
    const fn = body("public.portal_update_customer_profile");
    expect(fn).toContain("security definer");
    expect(fn).toContain("set search_path = ''");
    expect(fn.slice(fn.indexOf("begin") + 5).trim().startsWith("perform private.portal_require_customer(p_customer_id);")).toBe(true);
    const parameters = [...fn.slice(0, fn.indexOf("returns")).matchAll(/\b(p_\w+)\s/g)].map((match) => match[1]);
    expect(parameters).toEqual([
      "p_customer_id", "p_expected_updated_at", "p_company_name", "p_contact_name", "p_email", "p_billing_email",
      "p_phone", "p_street", "p_postal_code", "p_city", "p_country", "p_kvk_number", "p_vat_number",
    ]);
    for (const internal of ["notes", "status", "source_inquiry_id", "source_lead_id", "created_at"]) {
      expect(fn, internal).not.toMatch(new RegExp(`\\b${internal}\\s*=`));
    }
    expect(fn).toContain("for update");
    expect(fn).toContain("v_row.updated_at is distinct from p_expected_updated_at");
    expect(fn).not.toMatch(/\bexecute\b/i);
  });

  it("is closed to anon, and adds no policy on customers", () => {
    expect(sql).toMatch(/revoke all on function public\.portal_update_customer_profile\([^)]*\) from public, anon;/);
    expect(sql).toMatch(/grant execute on function public\.portal_update_customer_profile\([^)]*\) to authenticated;/);
    expect(sql).toContain("revoke all on function public.portal_customer_profile(uuid) from public, anon;");
    expect(sql).not.toMatch(/create policy[^;]*on public\.customers\b/);
  });

  it("audits in the same transaction, with values for business identifiers only", () => {
    const trigger = body("private.record_customer_profile_change");
    expect(sql).toContain("after update on public.customers");
    expect(trigger).toContain("security definer");
    const valued = [...trigger.matchAll(/jsonb_build_object\('(\w+)'/g)].map((match) => match[1]).filter((key) => key !== "from");
    expect(valued.sort()).toEqual(["company_name", "kvk_number", "vat_number"]);
    expect(sql).toContain("revoke all on table public.customer_profile_changes from anon, authenticated;");
    expect(sql).toContain("grant select on table public.customer_profile_changes to authenticated;");
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*customer_profile_changes/);
  });
});
