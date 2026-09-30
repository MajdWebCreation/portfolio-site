import { describe, expect, it } from "vitest";
import { suggestServiceInterest } from "@/lib/admin/inquiries/service-interest";

const landed = (landingPath: string) => ({
  origin: "contact" as const,
  attribution: { trafficClass: "campaign" as const, trafficSource: "google", trafficMedium: "cpc", campaign: null, landingPath },
});

describe("suggestServiceInterest", () => {
  it("proposes the service of the page the visit landed on, in either language", () => {
    expect(suggestServiceInterest(landed("/nl/diensten/website-laten-maken"))).toBe("business-websites");
    expect(suggestServiceInterest(landed("/en/services/business-websites"))).toBe("business-websites");
    expect(suggestServiceInterest(landed("/nl/diensten/webshop-laten-maken"))).toBe("ecommerce-development");
  });

  it("proposes nothing for a page that is not a service page, an unknown slug, or no attribution", () => {
    expect(suggestServiceInterest(landed("/nl/contact"))).toBeUndefined();
    expect(suggestServiceInterest(landed("/nl/diensten/onbekend"))).toBeUndefined();
    expect(suggestServiceInterest({ origin: "contact" })).toBeUndefined();
  });

  it("prefers the planner's project type over the landing page", () => {
    expect(suggestServiceInterest({ ...landed("/nl/diensten/website-laten-maken"), origin: "project_planner", planner: { projectTypeKey: "webshop" } })).toBe(
      "ecommerce-development",
    );
    expect(suggestServiceInterest({ origin: "project_planner", planner: { projectTypeKey: "smart" } })).toBe("web-app-development");
    expect(suggestServiceInterest({ origin: "project_planner", planner: { projectTypeKey: "mystery" } })).toBeUndefined();
  });
});
