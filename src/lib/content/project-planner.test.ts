import { describe, expect, it } from "vitest";
import {
  buildPlannerSummary,
  formatPlannerPrices,
  initialPlannerState,
  type PlannerState,
} from "@/lib/content/project-planner";
import { catalogFromRows, type PricingSettingsRow } from "@/lib/pricing/catalog";
import { developmentPrice } from "@/lib/pricing/discount";
import { formatMonthlyFrom } from "@/lib/pricing/format";
import { seedAddOnRows, seedPackageRows, settingsRow } from "@/lib/pricing/test-fixtures";

const catalogWith = (settings: PricingSettingsRow | null) => catalogFromRows(seedPackageRows, seedAddOnRows, settings);

/*
 * Compact website with motion (695 + 175 = 870) and content partly ready
 * (+150 buffer): range 870 to roundToFifty(1020) = 1050. At 30% the total is
 * 609, while discounting the parts first would give 487 + 123 = 610.
 */
const starterWithMotion: PlannerState = {
  ...initialPlannerState,
  locale: "nl",
  projectType: "starter",
  pageCount: "1-5",
  starterMotion: true,
  contentReady: "partly",
};

/* Business with SEO (350) and email flow (200): 2045, buffer 300 + 150, range to 2500. */
const businessWithExtras: PlannerState = {
  ...initialPlannerState,
  locale: "nl",
  projectType: "business",
  businessSeoGrowth: true,
  businessAdvancedEmail: true,
  contentReady: "no",
  brandingReady: "partly",
};

describe("buildPlannerSummary without a campaign", () => {
  it("builds the estimate exactly as before", () => {
    const summary = buildPlannerSummary(starterWithMotion, catalogWith(null));

    expect(summary.startingPrice).toBe(870);
    expect(summary.baseStartingPrice).toBe(870);
    expect(summary.range).toEqual({ min: 870, max: 1050 });
    expect(summary.baseRange).toEqual({ min: 870, max: 1050 });
    expect(summary.discountPercent).toBeNull();
    expect(summary.monthlyManagementFrom).toBe(10);
  });

  it("is identical when the campaign is switched off", () => {
    expect(buildPlannerSummary(businessWithExtras, catalogWith(settingsRow(false, 30)))).toEqual(
      buildPlannerSummary(businessWithExtras, catalogWith(null)),
    );
  });
});

describe("buildPlannerSummary with a campaign", () => {
  it("builds the base range first and discounts its final minimum and maximum once", () => {
    const base = buildPlannerSummary(starterWithMotion, catalogWith(null));
    const summary = buildPlannerSummary(starterWithMotion, catalogWith(settingsRow(true, 30)));

    expect(summary.baseStartingPrice).toBe(base.startingPrice);
    expect(summary.baseRange).toEqual(base.range);
    expect(summary.startingPrice).toBe(609);
    expect(summary.range).toEqual({ min: 609, max: 735 });
    expect(summary.discountPercent).toBe(30);

    // Not the sum of separately discounted parts (487 + 123 = 610).
    const partwise =
      developmentPrice(695, { percent: 30 }).amount + developmentPrice(175, { percent: 30 }).amount;
    expect(partwise).toBe(610);
    expect(summary.startingPrice).not.toBe(partwise);
  });

  it("follows a changed percentage through the same rule", () => {
    const summary = buildPlannerSummary(businessWithExtras, catalogWith(settingsRow(true, 20)));

    expect(summary.baseRange).toEqual({ min: 2045, max: 2500 });
    expect(summary.range).toEqual({ min: 1636, max: 2000 });
    expect(summary.startingPrice).toBe(1636);
  });

  it.each([
    ["off", settingsRow(false, 30)],
    ["30%", settingsRow(true, 30)],
    ["1%", settingsRow(true, 1)],
    ["20%", settingsRow(true, 20)],
    ["90%", settingsRow(true, 90)],
  ])("keeps monthly management identical with %s", (_, settings) => {
    for (const state of [starterWithMotion, businessWithExtras]) {
      const base = buildPlannerSummary(state, catalogWith(null));
      const summary = buildPlannerSummary(state, catalogWith(settings));
      expect(summary.monthlyManagementFrom).toBe(base.monthlyManagementFrom);
      expect(formatMonthlyFrom(summary.monthlyManagementFrom, "nl")).toBe(
        formatMonthlyFrom(base.monthlyManagementFrom, "nl"),
      );
    }
  });
});

describe("formatPlannerPrices", () => {
  it("sends the plain amounts without a campaign", () => {
    const prices = formatPlannerPrices(buildPlannerSummary(starterWithMotion, catalogWith(null)), "nl");

    expect(prices.originalStartingPrice).toBeNull();
    expect(prices.discountNote).toBeNull();
    expect(prices.submittedStartingPrice).toBe(prices.startingPrice);
    expect(prices.submittedRange).toBe(prices.range);
  });

  it("sends the discounted amounts with their context while a campaign is active", () => {
    const prices = formatPlannerPrices(
      buildPlannerSummary(starterWithMotion, catalogWith(settingsRow(true, 30))),
      "nl",
    );
    const nbsp = (text: string) => text.replace(/ /g, " ");

    expect(nbsp(prices.startingPrice)).toBe("€ 609");
    expect(nbsp(prices.originalStartingPrice ?? "")).toBe("€ 870");
    expect(prices.discountNote).toBe("Tijdelijk 30% korting op de ontwikkelkosten");
    expect(nbsp(prices.submittedStartingPrice)).toBe("€ 609 (30% korting op € 870)");
    expect(nbsp(prices.submittedRange ?? "")).toBe("€ 609 - € 735 (30% korting op € 870 - € 1.050)");
  });

  it("uses the stored percentage in the English copy", () => {
    const prices = formatPlannerPrices(
      buildPlannerSummary({ ...starterWithMotion, locale: "en" }, catalogWith(settingsRow(true, 20))),
      "en",
    );

    expect(prices.discountNote).toBe("Temporarily 20% off development costs");
    expect(prices.submittedStartingPrice).toBe("€696 (20% off €870)");
  });
});
