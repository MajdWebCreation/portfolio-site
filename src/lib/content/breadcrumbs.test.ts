import { describe, expect, it } from "vitest";
import {
  getArticleBreadcrumbs,
  getCaseBreadcrumbs,
  getServiceBreadcrumbs,
} from "@/lib/content/breadcrumbs";
import { getServiceBySlug } from "@/lib/content/services";

/*
  What is tested is the route a trail describes, not the wording of a page:
  which paths it walks, in which order, and that it stays inside its own
  language. The names are asserted only where they have to come from the
  navigation rather than from a label invented for the trail.
*/

describe("service breadcrumbs", () => {
  it("walks home, the Dutch services index and the service itself", () => {
    const service = getServiceBySlug("nl", "bedrijfswebsite");
    expect(service).not.toBeNull();

    expect(getServiceBreadcrumbs("nl", service!)).toEqual([
      { name: "Home", path: "/nl" },
      { name: "Diensten", path: "/nl/diensten" },
      { name: "Bedrijfswebsite", path: "/nl/diensten/bedrijfswebsite" },
    ]);
  });

  it("stays on the English routes for an English service", () => {
    const service = getServiceBySlug("en", "business-websites");
    expect(service).not.toBeNull();

    const crumbs = getServiceBreadcrumbs("en", service!);
    expect(crumbs.map((crumb) => crumb.path)).toEqual([
      "/en",
      "/en/services",
      "/en/services/business-websites",
    ]);
    expect(crumbs[1].name).toBe("Services");
  });

  it("never mixes a language into another language's trail", () => {
    for (const slug of ["webshop-laten-maken", "3d-configurator", "performance"]) {
      const service = getServiceBySlug("nl", slug);
      expect(service).not.toBeNull();

      for (const crumb of getServiceBreadcrumbs("nl", service!)) {
        expect(crumb.path.startsWith("/nl")).toBe(true);
      }
    }
  });
});

describe("article breadcrumbs", () => {
  it("walks home, the article index under its own name and the article", () => {
    expect(
      getArticleBreadcrumbs("nl", {
        title: "Website of webshop",
        path: "/nl/blog/website-of-webshop",
      }),
    ).toEqual([
      { name: "Home", path: "/nl" },
      { name: "Inzichten", path: "/nl/blog" },
      { name: "Website of webshop", path: "/nl/blog/website-of-webshop" },
    ]);
  });
});

describe("case breadcrumbs", () => {
  it("walks home, the projects index and the case", () => {
    expect(
      getCaseBreadcrumbs("nl", {
        name: "Flexora Bouw",
        path: "/nl/projecten/flexora-bouw",
      }),
    ).toEqual([
      { name: "Home", path: "/nl" },
      { name: "Projecten", path: "/nl/projecten" },
      { name: "Flexora Bouw", path: "/nl/projecten/flexora-bouw" },
    ]);
  });
});
