import { describe, expect, it } from "vitest";
import {
  getProductCategory,
  isProductCategory,
  packagesInCategory,
  productCategories,
} from "@/lib/pricing/categories";
import { packageIds } from "@/lib/pricing/packages";

describe("product categories", () => {
  it("puts every project type in exactly one category", () => {
    const seen = productCategories.flatMap((category) => packagesInCategory(category));
    expect([...seen].sort()).toEqual([...packageIds].sort());
    for (const id of packageIds) {
      expect(packagesInCategory(getProductCategory(id))).toContain(id);
    }
  });

  it("keeps the website types together and the webshop on its own", () => {
    expect(packagesInCategory("website")).toEqual(["starter", "business"]);
    expect(packagesInCategory("webshop")).toEqual(["webshop"]);
    expect(packagesInCategory("custom")).toEqual(["smart", "platform"]);
  });

  it("keeps catalog order within a category", () => {
    for (const category of productCategories) {
      const ids = packagesInCategory(category);
      const positions = ids.map((id) => packageIds.indexOf(id));
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it("recognises a category name and nothing else", () => {
    expect(isProductCategory("custom")).toBe(true);
    expect(isProductCategory("business")).toBe(false);
    expect(isProductCategory("")).toBe(false);
    expect(isProductCategory(undefined)).toBe(false);
  });
});
