import { describe, expect, it } from "vitest";
import { websitecheckContent, websitecheckPromotion } from "@/lib/content/websitecheck";
import { catalogFromRows } from "@/lib/pricing/catalog";
import { seedAddOnRows, seedPackageRows, settingsRow } from "@/lib/pricing/test-fixtures";

describe("the campaign line on /websitecheck", () => {
  it("names the stored percentage when the campaign is on", () => {
    const catalog = catalogFromRows(seedPackageRows, seedAddOnRows, settingsRow(true, 30));
    expect(websitecheckPromotion(catalog)).toEqual({
      note: "Tijdelijk 30% korting op de ontwikkelkosten",
      scope: websitecheckContent.promotion.scope,
    });
  });

  it("follows a changed percentage without any change here", () => {
    const catalog = catalogFromRows(seedPackageRows, seedAddOnRows, settingsRow(true, 20));
    expect(websitecheckPromotion(catalog)?.note).toBe("Tijdelijk 20% korting op de ontwikkelkosten");
  });

  it("disappears when the campaign is off or there is no setting", () => {
    expect(websitecheckPromotion(catalogFromRows(seedPackageRows, seedAddOnRows, settingsRow(false, 30)))).toBeNull();
    expect(websitecheckPromotion(catalogFromRows(seedPackageRows, seedAddOnRows, null))).toBeNull();
    expect(websitecheckPromotion({ developmentDiscount: null })).toBeNull();
  });

  it("says the campaign does not touch recurring costs", () => {
    expect(websitecheckContent.promotion.scope).toMatch(/niet op hosting of technisch beheer/);
  });
});

describe("the landing page copy", () => {
  it("carries no hard-coded campaign percentage", () => {
    expect(JSON.stringify(websitecheckContent)).not.toMatch(/\d+\s?%/);
  });

  it("promises no rankings, traffic, leads or turnover", () => {
    const text = JSON.stringify(websitecheckContent).toLowerCase();
    for (const word of ["google", "ranking", "vindbaar", "meer klanten", "meer leads", "omzet", "gegarandeerd", "garantie", "binnen 24 uur"]) {
      expect(text, word).not.toContain(word);
    }
  });
});
