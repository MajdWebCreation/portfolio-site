import { describe, expect, it } from "vitest";
import { pricingPaths } from "@/lib/admin/pricing/paths";

describe("pricingPaths", () => {
  it("covers every page that renders a catalog amount, in both languages", () => {
    expect(pricingPaths()).toEqual(
      expect.arrayContaining([
        "/admin/prijzen",
        "/nl/tarieven",
        "/en/pricing",
        "/nl/projectplanner",
        "/en/project-planner",
        "/nl/diensten/website-laten-maken",
        "/en/services/business-websites",
        "/nl/websitecheck",
      ]),
    );
  });

  it("lists no path twice", () => {
    const paths = pricingPaths();
    expect(new Set(paths).size).toBe(paths.length);
  });
});
