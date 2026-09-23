import { describe, expect, it } from "vitest";
import { localeFromPath, pageTypeFromPath } from "@/lib/analytics/page-type";
import { ctaTargetForHref } from "@/lib/analytics/targets";
import { trackedElementFromDataset } from "@/lib/analytics/dataset";

describe("pageTypeFromPath", () => {
  it("maps the Dutch and English route of one page to the same type", () => {
    expect(pageTypeFromPath("/nl")).toBe("home");
    expect(pageTypeFromPath("/en")).toBe("home");
    expect(pageTypeFromPath("/nl/diensten")).toBe("services");
    expect(pageTypeFromPath("/en/services")).toBe("services");
    expect(pageTypeFromPath("/nl/diensten/bedrijfswebsite")).toBe("service");
    expect(pageTypeFromPath("/en/services/business-websites")).toBe("service");
    expect(pageTypeFromPath("/nl/tarieven")).toBe("pricing");
    expect(pageTypeFromPath("/en/pricing")).toBe("pricing");
    expect(pageTypeFromPath("/nl/projectplanner")).toBe("planner");
    expect(pageTypeFromPath("/en/project-planner")).toBe("planner");
    expect(pageTypeFromPath("/nl/werkwijze")).toBe("process");
    expect(pageTypeFromPath("/en/how-we-work")).toBe("process");
    expect(pageTypeFromPath("/nl/projecten")).toBe("projects");
    expect(pageTypeFromPath("/nl/projecten/flexora-bouw")).toBe("case");
    expect(pageTypeFromPath("/nl/blog")).toBe("blog");
    expect(pageTypeFromPath("/en/blog/some-article")).toBe("article");
    expect(pageTypeFromPath("/nl/contact")).toBe("contact");
  });

  it("classes legal and payment pages, and everything else as other", () => {
    expect(pageTypeFromPath("/nl/privacy")).toBe("legal");
    expect(pageTypeFromPath("/en/cookies")).toBe("legal");
    expect(pageTypeFromPath("/nl/algemene-voorwaarden")).toBe("legal");
    expect(pageTypeFromPath("/nl/betaling/afgerond")).toBe("payment");
    expect(pageTypeFromPath("/nl/incasso/abc")).toBe("payment");
    expect(pageTypeFromPath("/admin")).toBe("other");
    expect(pageTypeFromPath("/nl/onbekend")).toBe("other");
    expect(pageTypeFromPath("/")).toBe("other");
  });

  it("ignores query and hash", () => {
    expect(pageTypeFromPath("/nl/tarieven#business")).toBe("pricing");
    expect(pageTypeFromPath("/nl/projectplanner?package=starter")).toBe("planner");
  });
});

describe("localeFromPath", () => {
  it("reads the first segment, defaulting to Dutch", () => {
    expect(localeFromPath("/en/services")).toBe("en");
    expect(localeFromPath("/nl/diensten")).toBe("nl");
    expect(localeFromPath("/")).toBe("nl");
  });
});

describe("ctaTargetForHref", () => {
  it("classes internal destinations", () => {
    expect(ctaTargetForHref("/nl/contact")).toBe("contact");
    expect(ctaTargetForHref("/en/project-planner")).toBe("planner");
    expect(ctaTargetForHref("/nl/tarieven")).toBe("pricing");
    expect(ctaTargetForHref("/nl/diensten/webshop-laten-maken")).toBe("service");
    expect(ctaTargetForHref("/nl/diensten")).toBe("services");
    expect(ctaTargetForHref("/nl/projecten/taxi-de-polder")).toBe("case");
    expect(ctaTargetForHref("/nl/blog")).toBe("blog");
    expect(ctaTargetForHref("/nl/blog/artikel")).toBe("article");
    expect(ctaTargetForHref("/nl")).toBe("home");
  });

  it("classes anything else as other", () => {
    expect(ctaTargetForHref("https://flexorabouw.nl")).toBe("other");
    expect(ctaTargetForHref("/nl/privacy")).toBe("other");
    expect(ctaTargetForHref("mailto:contact@ymcreations.com")).toBe("other");
  });
});

describe("trackedElementFromDataset", () => {
  it("turns data-track-* attributes into snake_case parameters", () => {
    expect(
      trackedElementFromDataset({
        trackEvent: "cta_click",
        trackCtaId: "home_hero_contact",
        trackCtaTarget: "contact",
        trackPlacement: "hero",
      }),
    ).toEqual({
      name: "cta_click",
      params: { cta_id: "home_hero_contact", cta_target: "contact", placement: "hero" },
    });
  });

  it("returns null without an event, and leaves the outbound context and other data attributes alone", () => {
    expect(trackedElementFromDataset({ trackCtaId: "x" })).toBeNull();
    expect(
      trackedElementFromDataset({ trackEvent: "cta_click", trackLinkContext: "project_live", state: "open" }),
    ).toEqual({ name: "cta_click", params: {} });
  });
});
