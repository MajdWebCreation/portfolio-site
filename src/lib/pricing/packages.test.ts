import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPackageMetadata, hiddenAddOns, isAddOnShown, packageIds } from "@/lib/pricing/packages";

/* The seed migration lists every add-on row the catalog started with. */
const seedSql = readFileSync("supabase/migrations/20260910174246_pricing_seed.sql", "utf8");

describe("package metadata", () => {
  it("gives every type an audience line, three to five highlights and a full list, in both languages", () => {
    for (const id of packageIds) {
      const meta = getPackageMetadata(id);
      for (const locale of ["nl", "en"] as const) {
        expect(meta.audience[locale].length, `${id} audience ${locale}`).toBeGreaterThan(10);
        expect(meta.highlights[locale].length, `${id} highlights ${locale}`).toBeGreaterThanOrEqual(3);
        expect(meta.highlights[locale].length, `${id} highlights ${locale}`).toBeLessThanOrEqual(5);
        expect(meta.included[locale].length, `${id} included ${locale}`).toBeGreaterThan(meta.highlights[locale].length);
        expect(meta.boundary[locale].length, `${id} boundary ${locale}`).toBeGreaterThan(20);
        /* The lists are the same length in both languages: one translation per line. */
        expect(meta.notIncluded.en.length).toBe(meta.notIncluded.nl.length);
        expect(meta.onRequest.en.length).toBe(meta.onRequest.nl.length);
      }
    }
  });

  it("names no amount: every euro comes from the catalog", () => {
    for (const id of packageIds) {
      const text = JSON.stringify(getPackageMetadata(id));
      expect(text, id).not.toMatch(/€|\beur\b/i);
    }
  });

  it("keeps the page counts the current prices and the planner are built on", () => {
    expect(getPackageMetadata("starter").included.nl[0]).toBe("1 tot 5 pagina's");
    expect(getPackageMetadata("business").included.nl[0]).toMatch(/^6 tot 12 pagina's/);
  });

  it("hides only add-ons that exist, and leaves every other add-on shown", () => {
    for (const [packageId, ids] of Object.entries(hiddenAddOns)) {
      for (const addOnId of ids ?? []) {
        expect(isAddOnShown(packageId as never, addOnId)).toBe(false);
      }
    }
    expect(isAddOnShown("business", "content-admin")).toBe(false);
    expect(isAddOnShown("business", "seo-growth")).toBe(true);
    expect(isAddOnShown("starter", "content-admin")).toBe(true);
    /* Every hidden add-on is a real row in the catalog (seed), not a typo. */
    for (const [packageId, ids] of Object.entries(hiddenAddOns)) {
      for (const addOnId of ids ?? []) {
        expect(seedSql, `${packageId}/${addOnId}`).toContain(`('${packageId}', '${addOnId}'`);
      }
    }
  });
});
