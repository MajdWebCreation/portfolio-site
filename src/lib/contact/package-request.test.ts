import { describe, expect, it } from "vitest";
import {
  describePackageChoice,
  describePackageChoices,
  packageIdFromSearch,
  packageRequestLine,
} from "@/lib/contact/package-request";
import { catalogFromRows } from "@/lib/pricing/catalog";
import { seedAddOnRows, seedPackageRows, settingsRow } from "@/lib/pricing/test-fixtures";

const catalog = catalogFromRows(seedPackageRows, seedAddOnRows);

describe("packageIdFromSearch", () => {
  it("reads a project type from the query string", () => {
    expect(packageIdFromSearch("?package=starter")).toBe("starter");
    expect(packageIdFromSearch("?utm_source=google&package=webshop")).toBe("webshop");
  });

  it("returns null for anything that is not a project type", () => {
    expect(packageIdFromSearch("")).toBeNull();
    expect(packageIdFromSearch("?package=")).toBeNull();
    expect(packageIdFromSearch("?package=premium")).toBeNull();
    expect(packageIdFromSearch("?package=Starter")).toBeNull();
    expect(packageIdFromSearch("?package=starter%20OR%201%3D1")).toBeNull();
    expect(packageIdFromSearch("?pkg=starter")).toBeNull();
  });
});

describe("describePackageChoice", () => {
  it("takes the name and the amounts from the catalog, in the visitor's language", () => {
    expect(describePackageChoice(catalog, "nl", "starter")).toEqual({
      id: "starter",
      name: "Compacte website",
      price: "vanaf €\u00a0695",
      monthly: "vanaf €\u00a015 p/m",
    });
    expect(describePackageChoice(catalog, "en", "platform")).toEqual({
      id: "platform",
      name: "Web application or platform",
      price: "from €4,995",
      monthly: "from €69 per month",
    });
  });

  it("applies the development discount to the starting price, never to management", () => {
    const discounted = catalogFromRows(seedPackageRows, seedAddOnRows, settingsRow(true, 20));
    expect(describePackageChoice(discounted, "nl", "business")).toMatchObject({
      price: "vanaf €\u00a01.196",
      monthly: "vanaf €\u00a029 p/m",
    });
  });

  it("describes every project type once", () => {
    const choices = describePackageChoices(catalog, "nl");
    expect(Object.keys(choices).sort()).toEqual(["business", "platform", "smart", "starter", "webshop"]);
    expect(choices.webshop.price).toBe("vanaf €\u00a01.995");
  });
});

describe("packageRequestLine", () => {
  it("names the type and what it starts at", () => {
    expect(packageRequestLine(describePackageChoice(catalog, "nl", "smart"), "nl")).toBe(
      "Gekozen projecttype: Website met reserveringen (vanaf €\u00a02.495 excl. btw, technisch beheer vanaf €\u00a039 p/m)",
    );
    expect(packageRequestLine(describePackageChoice(catalog, "en", "webshop"), "en")).toBe(
      "Chosen project type: Webshop (from €1,995 excl. VAT, technical management from €35 per month)",
    );
  });
});
