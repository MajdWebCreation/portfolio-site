import { describe, expect, it } from "vitest";
import {
  blogPostingSchema,
  breadcrumbListSchema,
  collectionPageSchema,
  creativeWorkSchema,
  organizationId,
  organizationSchema,
  serviceSchema,
  webPageId,
  webPageSchema,
  websiteId,
  websiteSchema,
} from "@/lib/schema";

/*
  What is tested is identity and restraint: that the entities refer to one
  another by the same identifier, that a page says which language it is in,
  and that a field we cannot back with a real value stays absent. The wording
  of a name or a description is not asserted.
*/

const articleUrl = "https://ymcreations.com/nl/blog/website-of-webshop";
const serviceUrl = "https://ymcreations.com/nl/diensten/bedrijfswebsite";

describe("one organization, one website", () => {
  it("gives the organization a stable identifier and points the site at it", () => {
    expect(organizationSchema()["@id"]).toBe(organizationId);
    expect(websiteSchema()["@id"]).toBe(websiteId);
    expect(websiteSchema().publisher).toEqual({ "@id": organizationId });
  });

  it("describes the same organization on every page that names it", () => {
    // The contact page and the home page both emit it; a reader that merges
    // by @id must not find two different companies.
    expect(organizationSchema()).toEqual(organizationSchema());
  });

  it("carries a logo that is a raster file well over the 112px minimum", () => {
    const { logo } = organizationSchema();

    expect(logo.url).toMatch(/^https:\/\/ymcreations\.com\/.+\.png$/);
    expect(logo.url).toBe(logo.contentUrl);
    expect(Math.min(logo.width, logo.height)).toBeGreaterThanOrEqual(112);
  });

  it("claims no address, social profile, rating or search action", () => {
    const organization = organizationSchema() as Record<string, unknown>;

    for (const invented of ["address", "sameAs", "aggregateRating", "openingHours"]) {
      expect(organization).not.toHaveProperty(invented);
    }
    expect(websiteSchema() as Record<string, unknown>).not.toHaveProperty(
      "potentialAction",
    );
  });
});

describe("pages", () => {
  it("states the language of the page and ties it to the website", () => {
    const dutch = webPageSchema({
      locale: "nl",
      name: "Naam",
      description: "Beschrijving",
      url: serviceUrl,
    });
    const english = collectionPageSchema({
      locale: "en",
      name: "Name",
      description: "Description",
      url: "https://ymcreations.com/en/services",
    });

    expect(dutch.inLanguage).toBe("nl-NL");
    expect(english.inLanguage).toBe("en-US");
    expect(dutch.isPartOf).toEqual({ "@id": websiteId });
    expect(dutch["@id"]).toBe(webPageId(serviceUrl));
  });

  it("only announces a breadcrumb when the page emits one", () => {
    const without = webPageSchema({
      locale: "nl",
      name: "Naam",
      description: "Beschrijving",
      url: serviceUrl,
    }) as Record<string, unknown>;

    expect(without).not.toHaveProperty("breadcrumb");

    const withCrumbs = webPageSchema({
      locale: "nl",
      name: "Naam",
      description: "Beschrijving",
      url: serviceUrl,
      hasBreadcrumb: true,
    });
    const list = breadcrumbListSchema({
      url: serviceUrl,
      items: [{ name: "Home", url: "https://ymcreations.com/nl" }],
    });

    expect(withCrumbs.breadcrumb).toEqual({ "@id": list["@id"] });
  });

  it("separates the service and the case from the page they sit on", () => {
    const service = serviceSchema({
      locale: "nl",
      name: "Bedrijfswebsite",
      description: "Beschrijving",
      url: serviceUrl,
    });

    expect(service["@id"]).not.toBe(webPageId(serviceUrl));
    expect(service.mainEntityOfPage).toEqual({ "@id": webPageId(serviceUrl) });
    expect(service.provider).toEqual({ "@id": organizationId });

    // A Service is not a creative work, so it carries no creative-work
    // properties; the page it sits on carries those.
    const serviceRecord = service as Record<string, unknown>;
    expect(serviceRecord).not.toHaveProperty("inLanguage");
    expect(serviceRecord).not.toHaveProperty("isPartOf");

    const work = creativeWorkSchema({
      locale: "nl",
      name: "Case",
      description: "Beschrijving",
      url: "https://ymcreations.com/nl/projecten/flexora-bouw",
    });

    expect(work.creator).toEqual({ "@id": organizationId });
  });
});

describe("articles", () => {
  const base = {
    locale: "nl" as const,
    headline: "Website of webshop",
    description: "Beschrijving",
    url: articleUrl,
  };

  it("names the organization as publisher by reference", () => {
    expect(blogPostingSchema(base).publisher).toEqual({ "@id": organizationId });
    expect(blogPostingSchema(base).mainEntityOfPage).toEqual({
      "@id": webPageId(articleUrl),
    });
    expect(blogPostingSchema(base).inLanguage).toBe("nl-NL");
  });

  it("leaves out an author the record does not name", () => {
    const withoutAuthor = blogPostingSchema(base) as Record<string, unknown>;

    expect(withoutAuthor).not.toHaveProperty("author");

    const withAuthor = blogPostingSchema({ ...base, authorName: "Iemand" });
    expect(withAuthor.author).toEqual({ "@type": "Person", name: "Iemand" });
  });

  it("never invents a date, an image or a modification claim", () => {
    const bare = blogPostingSchema(base) as Record<string, unknown>;

    expect(bare).not.toHaveProperty("datePublished");
    expect(bare).not.toHaveProperty("image");
    // The only change timestamp on an article row is a bulk record-keeping
    // date, so no dateModified is derived from it.
    expect(bare).not.toHaveProperty("dateModified");
    expect(
      blogPostingSchema({ ...base, datePublished: "2026-09-11" }) as Record<string, unknown>,
    ).not.toHaveProperty("dateModified");
  });

  it("does not fall back to the logo when an article has no image", () => {
    const bare = blogPostingSchema(base) as Record<string, unknown>;
    expect(JSON.stringify(bare)).not.toContain("ym-favicon-mark");
  });
});

describe("breadcrumb markup", () => {
  it("numbers the trail from one and keeps the given order", () => {
    const list = breadcrumbListSchema({
      url: serviceUrl,
      items: [
        { name: "Home", url: "https://ymcreations.com/nl" },
        { name: "Diensten", url: "https://ymcreations.com/nl/diensten" },
        { name: "Bedrijfswebsite", url: serviceUrl },
      ],
    });

    expect(list.itemListElement.map((item) => item.position)).toEqual([1, 2, 3]);
    expect(list.itemListElement.map((item) => item.name)).toEqual([
      "Home",
      "Diensten",
      "Bedrijfswebsite",
    ]);
    expect(list.itemListElement.at(-1)?.item).toBe(serviceUrl);
  });
});
