import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";
import { getCounterpartPath } from "@/lib/content/routes";
import {
  getServiceBySlug,
  getServiceKeyForSlug,
  getServicesForLocale,
  serviceDefinitions,
  serviceKeys,
} from "@/lib/content/services";
import { businessInfo, whatsappLink, whatsappUrl } from "@/lib/content/site-content";

/*
  A service that changes its slug keeps its old address working: one
  permanent redirect straight to the current page, no page served twice, and
  the language switch and analytics following along.
*/
const formerSlugs = serviceKeys.flatMap((key) =>
  (serviceDefinitions[key].formerSlugs?.nl ?? []).map((slug) => ({
    key,
    slug,
    current: `/nl/diensten/${serviceDefinitions[key].locale.nl.slug}`,
  })),
);

describe("the website-laten-maken page", () => {
  it("is the Dutch business website service, under the search term people use", () => {
    const service = getServiceBySlug("nl", "website-laten-maken");
    expect(service?.key).toBe("business-websites");
    expect(service?.path).toBe("/nl/diensten/website-laten-maken");
    expect(service?.metaTitle).toMatch(/^Website laten maken/);
  });

  it("switches language to the English page and back", () => {
    expect(getCounterpartPath("/nl/diensten/website-laten-maken", "nl", "en")).toBe("/en/services/business-websites");
    expect(getCounterpartPath("/en/services/business-websites", "en", "nl")).toBe("/nl/diensten/website-laten-maken");
  });
});

describe("former service slugs", () => {
  it("includes the old business website address", () => {
    expect(formerSlugs).toContainEqual({
      key: "business-websites",
      slug: "bedrijfswebsite",
      current: "/nl/diensten/website-laten-maken",
    });
  });

  it("are never served as a page of their own", () => {
    const currentSlugs = getServicesForLocale("nl").map((service) => service.slug);
    for (const { slug } of formerSlugs) {
      expect(getServiceBySlug("nl", slug)).toBeNull();
      expect(currentSlugs).not.toContain(slug);
    }
  });

  it("redirect permanently, in one hop, from the prefixed and the bare path", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];

    for (const { slug, current } of formerSlugs) {
      for (const source of [`/nl/diensten/${slug}`, `/diensten/${slug}`]) {
        const rule = redirects.find((item) => item.source === source);
        expect(rule, source).toMatchObject({ destination: current, permanent: true });
      }
      /* Before the generic rule, which would otherwise make it two hops. */
      const generic = redirects.findIndex((item) => item.source === "/diensten/:slug");
      expect(redirects.findIndex((item) => item.source === `/diensten/${slug}`)).toBeLessThan(generic);
    }
  });

  it("still count as the same service in analytics", () => {
    for (const { key, slug } of formerSlugs) {
      expect(getServiceKeyForSlug("nl", slug)).toBe(key);
    }
    expect(getServiceKeyForSlug("nl", "website-laten-maken")).toBe("business-websites");
    expect(getServiceKeyForSlug("nl", "bestaat-niet")).toBeNull();
  });
});

describe("direct contact links", () => {
  it("dial the business number", () => {
    expect(`tel:${businessInfo.phone}`).toBe("tel:+31653400220");
  });

  it("open WhatsApp on the same number, with an optional first line", () => {
    expect(whatsappUrl).toBe("https://wa.me/31653400220");
    expect(whatsappLink()).toBe(whatsappUrl);
    expect(whatsappLink("Hallo, ik wil een website")).toBe("https://wa.me/31653400220?text=Hallo%2C%20ik%20wil%20een%20website");
  });
});
