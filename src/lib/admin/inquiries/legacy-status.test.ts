import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { legacyStatusMapping, planLegacyStatusMigration } from "@/lib/admin/inquiries/legacy-status";

/*
  The legacy step of the lifecycle migration: two handling states have one
  obvious stage and are mapped; anything else aborts with a count per
  status, never a guess. The SQL guard is checked for the same rule, so the
  contract here and the migration cannot drift apart unnoticed.
*/
describe("planLegacyStatusMigration", () => {
  it("maps viewed and follow_up, leaves new and qualified, and reports nothing for an empty table", () => {
    expect(planLegacyStatusMigration({})).toEqual([]);
    expect(planLegacyStatusMigration({ new: 3, qualified: 1 })).toEqual([]);
    expect(planLegacyStatusMigration({ viewed: 2, follow_up: 1, new: 4 })).toEqual([
      { from: "viewed", to: "new", rows: 2 },
      { from: "follow_up", to: "contacted", rows: 1 },
    ]);
  });

  it("aborts on completed, rejected or any unknown status, naming each with its count", () => {
    expect(() => planLegacyStatusMigration({ new: 2, completed: 1 })).toThrow(/1 inquiries carry a status with no unambiguous lifecycle stage \(completed: 1\)/);
    expect(() => planLegacyStatusMigration({ completed: 2, rejected: 3 })).toThrow(/5 inquiries .* \(completed: 2, rejected: 3\)/);
    expect(() => planLegacyStatusMigration({ surprise: 1 })).toThrow(/surprise: 1/);
    /* A zero count is no row. */
    expect(planLegacyStatusMigration({ completed: 0 })).toEqual([]);
  });

  it("never maps anything to won or lost by itself", () => {
    expect(Object.values(legacyStatusMapping)).not.toContain("won");
    expect(Object.values(legacyStatusMapping)).not.toContain("lost");
  });

  it("is the same rule the SQL migration applies", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260930193617_inquiry_lifecycle.sql"), "utf8");
    const guard = /where status not in \(([^)]+)\)/.exec(sql);
    expect(guard).not.toBeNull();
    const accepted = [...guard![1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(accepted).toEqual(Object.keys(legacyStatusMapping).sort());
    expect(sql).toContain("set status = 'contacted' where status = 'follow_up'");
    expect(sql).toContain("set status = 'new' where status = 'viewed'");
    expect(sql).not.toMatch(/set status = 'won'/);
    expect(sql).not.toMatch(/set status = 'lost'/);
    expect(sql).toContain("raise exception 'inquiry_lifecycle: % inquiries carry a status with no unambiguous lifecycle stage");
  });
});
