import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  What reaches the inquiries table for each origin. The Supabase client is
  replaced by a recorder, so the assertions are on the row as it would be
  inserted: the shape the check constraints and the intake policy demand.
*/
const insert = vi.fn();

vi.mock("@/lib/supabase/public", () => ({
  createSupabasePublicClient: () => ({
    from: () => ({ insert: (...args: unknown[]) => insert(...args) }),
  }),
}));

const { storeInquiry } = await import("@/lib/contact/inquiry");

const attribution = {
  trafficClass: "campaign" as const,
  trafficSource: "facebook",
  trafficMedium: "paid-social",
  campaign: "websitecheck-sep",
  landingPath: "/nl/websitecheck",
};

beforeEach(() => {
  insert.mockReset();
  insert.mockResolvedValue({ error: null });
});

describe("storeInquiry for a websitecheck", () => {
  it("writes the origin, the address and the optional phone, and no planner block", async () => {
    await storeInquiry({
      origin: "websitecheck",
      locale: "nl",
      name: "Anna Voorbeeld",
      email: "anna@example.com",
      company: "",
      message: "",
      phone: " 06 12345678 ",
      websiteUrl: "https://www.example.nl/",
      attribution,
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toEqual({
      origin: "websitecheck",
      locale: "nl",
      name: "Anna Voorbeeld",
      email: "anna@example.com",
      company: null,
      message: "",
      phone: "06 12345678",
      planner: null,
      website_url: "https://www.example.nl/",
      traffic_class: "campaign",
      traffic_source: "facebook",
      traffic_medium: "paid-social",
      campaign: "websitecheck-sep",
      landing_path: "/nl/websitecheck",
    });
  });

  it("stores no phone when none was given, and null attribution as five nulls", async () => {
    await storeInquiry({
      origin: "websitecheck",
      locale: "nl",
      name: "Anna Voorbeeld",
      email: "anna@example.com",
      company: "",
      message: "",
      phone: "",
      websiteUrl: "https://example.nl/",
      attribution: null,
    });

    expect(insert.mock.calls[0][0]).toMatchObject({
      phone: null,
      website_url: "https://example.nl/",
      traffic_class: null,
      traffic_source: null,
      traffic_medium: null,
      campaign: null,
      landing_path: null,
    });
  });

  it("throws when the row was not stored", async () => {
    insert.mockResolvedValue({ error: { message: "permission denied" } });
    await expect(
      storeInquiry({
        origin: "websitecheck",
        locale: "nl",
        name: "Anna",
        email: "anna@example.com",
        company: "",
        message: "",
        phone: "",
        websiteUrl: "https://example.nl/",
        attribution: null,
      }),
    ).rejects.toThrow("permission denied");
  });
});

describe("storeInquiry for the existing origins", () => {
  it("keeps a contact request without phone, planner or address", async () => {
    await storeInquiry({
      origin: "contact",
      locale: "en",
      name: "Anna",
      email: "anna@example.com",
      company: "Example BV",
      message: "A message.",
      phone: "0612345678",
      websiteUrl: "https://example.nl/",
      attribution: null,
    });

    expect(insert.mock.calls[0][0]).toMatchObject({ origin: "contact", phone: null, planner: null, website_url: null, company: "Example BV" });
  });

  it("keeps a planner request with its block and phone, and no address", async () => {
    await storeInquiry({
      origin: "project_planner",
      locale: "nl",
      name: "Anna",
      email: "anna@example.com",
      company: "",
      message: "Toelichting",
      phone: "0612345678",
      planner: { projectTypeKey: "starter" },
      websiteUrl: "https://example.nl/",
      attribution: null,
    });

    expect(insert.mock.calls[0][0]).toMatchObject({
      origin: "project_planner",
      phone: "0612345678",
      planner: { projectTypeKey: "starter" },
      website_url: null,
    });
  });
});
