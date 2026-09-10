import { describe, expect, it } from "vitest";
import {
  catalogFromRows,
  getAddOn,
  getMonthlyManagementFrom,
  getPackage,
  getStartingPrice,
  type PricingAddOnRow,
  type PricingPackageRow,
} from "@/lib/pricing/catalog";

const packageRow = (over: Partial<PricingPackageRow> & Pick<PricingPackageRow, "id">): PricingPackageRow => ({
  starting_price_cents: 69500,
  scope_driven: false,
  monthly_management_from_cents: 1000,
  name_nl: "Compacte website",
  name_en: "Compact website",
  tagline_nl: "Voor presentatie en contact",
  tagline_en: "For presentation and contact",
  sort_order: 0,
  ...over,
});

const addOnRow = (over: Partial<PricingAddOnRow> & Pick<PricingAddOnRow, "package_id" | "addon_id">): PricingAddOnRow => ({
  addon_group: "content",
  amount_cents: 7500,
  mode: "plus",
  label_nl: "Extra pagina",
  label_en: "Extra page",
  sort_order: 0,
  ...over,
});

describe("catalogFromRows", () => {
  it("reads integer cents as whole euros", () => {
    const catalog = catalogFromRows(
      [packageRow({ id: "starter", starting_price_cents: 69500, monthly_management_from_cents: 1000 })],
      [addOnRow({ package_id: "starter", addon_id: "extra-page", amount_cents: 7500 })],
    );

    expect(getStartingPrice(catalog, "starter")).toBe(695);
    expect(getMonthlyManagementFrom(catalog, "starter")).toBe(10);
    expect(getAddOn(catalog, "nl", "starter", "extra-page").amount).toBe(75);
  });

  it("orders packages and add-ons by the stored sort order, not by arrival", () => {
    const catalog = catalogFromRows(
      [
        packageRow({ id: "business", sort_order: 1 }),
        packageRow({ id: "starter", sort_order: 0 }),
      ],
      [
        addOnRow({ package_id: "starter", addon_id: "seo-plus", sort_order: 2 }),
        addOnRow({ package_id: "starter", addon_id: "extra-page", sort_order: 0 }),
        addOnRow({ package_id: "starter", addon_id: "multilingual", sort_order: 1 }),
      ],
    );

    expect(catalog.packages.map((pkg) => pkg.id)).toEqual(["starter", "business"]);
    expect(getPackage(catalog, "starter").addOns.map((addOn) => addOn.id)).toEqual([
      "extra-page",
      "multilingual",
      "seo-plus",
    ]);
  });

  it("keeps an add-on id bound to its package", () => {
    const catalog = catalogFromRows(
      [packageRow({ id: "starter", sort_order: 0 }), packageRow({ id: "webshop", sort_order: 1 })],
      [
        addOnRow({ package_id: "starter", addon_id: "multilingual", amount_cents: 20000 }),
        addOnRow({ package_id: "webshop", addon_id: "multilingual", amount_cents: 30000 }),
      ],
    );

    expect(getAddOn(catalog, "nl", "starter", "multilingual").amount).toBe(200);
    expect(getAddOn(catalog, "nl", "webshop", "multilingual").amount).toBe(300);
  });

  it("picks the label of the requested language", () => {
    const catalog = catalogFromRows(
      [packageRow({ id: "starter" })],
      [addOnRow({ package_id: "starter", addon_id: "extra-page" })],
    );

    expect(getAddOn(catalog, "nl", "starter", "extra-page").label).toBe("Extra pagina");
    expect(getAddOn(catalog, "en", "starter", "extra-page").label).toBe("Extra page");
  });

  it("refuses to guess about something the catalog does not hold", () => {
    const catalog = catalogFromRows([packageRow({ id: "starter" })], []);

    expect(() => getPackage(catalog, "platform")).toThrow(/platform/);
    expect(() => getAddOn(catalog, "nl", "starter", "motion")).toThrow(/motion/);
  });
});
