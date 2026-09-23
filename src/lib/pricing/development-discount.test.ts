import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalogFromRows, type PricingSettingsRow } from "@/lib/pricing/catalog";
import { developmentPrice } from "@/lib/pricing/discount";
import { formatMonthly, formatMonthlyFrom } from "@/lib/pricing/format";
import { seedAddOnRows, seedPackageRows, settingsRow } from "@/lib/pricing/test-fixtures";

/* Every campaign state the invariant must hold for. */
const campaigns: [string, PricingSettingsRow | null][] = [
  ["no settings row", null],
  ["off", settingsRow(false, 30)],
  ["30%", settingsRow(true, 30)],
  ["1%", settingsRow(true, 1)],
  ["20%", settingsRow(true, 20)],
  ["90%", settingsRow(true, 90)],
];

const seededMonthly = { starter: 10, business: 25, smart: 35, webshop: 25, platform: 49 };

describe("the catalog and the campaign setting", () => {
  it("carries no discount without a settings row", () => {
    expect(catalogFromRows(seedPackageRows, seedAddOnRows).developmentDiscount).toBeNull();
    expect(catalogFromRows(seedPackageRows, seedAddOnRows, null).developmentDiscount).toBeNull();
  });

  it("carries no discount when the setting is off", () => {
    expect(catalogFromRows(seedPackageRows, seedAddOnRows, settingsRow(false, 30)).developmentDiscount).toBeNull();
  });

  it("carries the stored percentage when the setting is on", () => {
    expect(catalogFromRows(seedPackageRows, seedAddOnRows, settingsRow(true, 30)).developmentDiscount).toEqual({
      percent: 30,
    });
    expect(catalogFromRows(seedPackageRows, seedAddOnRows, settingsRow(true, 20)).developmentDiscount).toEqual({
      percent: 20,
    });
  });

  it("keeps every canonical amount as stored, whatever the campaign", () => {
    for (const [, settings] of campaigns) {
      const catalog = catalogFromRows(seedPackageRows, seedAddOnRows, settings);
      expect(catalog.packages.map((pkg) => pkg.startingPrice)).toEqual([695, 1495, 2495, 1995, 4995]);
      expect(catalog.packages.flatMap((pkg) => pkg.addOns.map((addOn) => addOn.amount))).toEqual([
        75, 200, 250, 175, 350, 200, 900, 8500,
      ]);
    }
  });

  it("derives discounted amounts without mutating the catalog", () => {
    const catalog = catalogFromRows(seedPackageRows, seedAddOnRows, settingsRow(true, 30));
    const snapshot = structuredClone(catalog);

    for (const pkg of catalog.packages) {
      developmentPrice(pkg.startingPrice, catalog.developmentDiscount);
      for (const addOn of pkg.addOns) developmentPrice(addOn.amount, catalog.developmentDiscount);
    }

    expect(catalog).toEqual(snapshot);
  });

  it("discounts every one-time amount, including the lower bound and every add-on mode", () => {
    const catalog = catalogFromRows(seedPackageRows, seedAddOnRows, settingsRow(true, 30));
    const shown = (amount: number) => developmentPrice(amount, catalog.developmentDiscount).amount;

    expect(catalog.packages.map((pkg) => shown(pkg.startingPrice))).toEqual([487, 1047, 1747, 1397, 3497]);
    const webshop = catalog.packages.find((pkg) => pkg.id === "webshop")!;
    const platform = catalog.packages.find((pkg) => pkg.id === "platform")!;
    // "Abonnementen of lidmaatschappen" is the one-time cost of building them.
    expect(shown(webshop.addOns.find((addOn) => addOn.id === "subscriptions")!.amount)).toBe(630);
    expect(shown(platform.addOns.find((addOn) => addOn.id === "full-app")!.amount)).toBe(5950);
  });
});

describe("recurring prices under every campaign state", () => {
  it.each(campaigns)("monthly management is unchanged with %s", (_, settings) => {
    const catalog = catalogFromRows(seedPackageRows, seedAddOnRows, settings);

    for (const pkg of catalog.packages) {
      const expected = seededMonthly[pkg.id];
      expect(pkg.monthlyManagementFrom).toBe(expected);
      expect(formatMonthlyFrom(pkg.monthlyManagementFrom, "nl")).toBe(formatMonthlyFrom(expected, "nl"));
      expect(formatMonthlyFrom(pkg.monthlyManagementFrom, "en")).toBe(formatMonthlyFrom(expected, "en"));
      expect(formatMonthly(pkg.monthlyManagementFrom, "nl")).toBe(formatMonthly(expected, "nl"));
    }
  });

  it("renders the same monthly text for every campaign state", () => {
    const texts = campaigns.map(([, settings]) =>
      catalogFromRows(seedPackageRows, seedAddOnRows, settings)
        .packages.map((pkg) => `${formatMonthlyFrom(pkg.monthlyManagementFrom, "nl")}|${formatMonthlyFrom(pkg.monthlyManagementFrom, "en")}`)
        .join(";"),
    );
    expect(new Set(texts).size).toBe(1);
  });

  /*
   * A guard on the code itself: the discount rule is only ever called with a
   * one-time amount. If someone passes a monthly amount through it, this
   * fails before the site shows a discounted management fee.
   */
  it("never passes a monthly amount through the development discount", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) files.push(path);
      }
    };
    walk(join(process.cwd(), "src"));

    const calls = files.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line.includes("developmentPrice("))
        .map((line) => `${file}: ${line.trim()}`),
    );

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).not.toMatch(/monthly|management|recurring/i);
    }
  });
});
