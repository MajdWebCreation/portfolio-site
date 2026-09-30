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

describe("storeInquiry with paid search attribution", () => {
  const paid = { ...attribution, trafficSource: "google", trafficMedium: "cpc", term: "website laten maken", content: "rsa-1" };
  const contact = { origin: "contact" as const, locale: "nl" as const, name: "Anna", email: "anna@example.com", company: "", message: "Twaalf tekens bericht", phone: "" };

  it("writes utm_term, utm_content and the click ids in their own columns", async () => {
    await storeInquiry({ ...contact, attribution: paid, adClickIds: { gclid: "Cj0KCQjw_test-GCLID" } });
    expect(insert.mock.calls[0][0]).toMatchObject({
      traffic_class: "campaign",
      traffic_source: "google",
      utm_term: "website laten maken",
      utm_content: "rsa-1",
      gclid: "Cj0KCQjw_test-GCLID",
      gbraid: null,
      wbraid: null,
    });
  });

  it("does not name the new columns at all when there is nothing for them", async () => {
    await storeInquiry({ ...contact, attribution, adClickIds: null });
    const row = insert.mock.calls[0][0];
    for (const column of ["utm_term", "utm_content", "gclid", "gbraid", "wbraid"]) expect(row).not.toHaveProperty(column);
  });

  it("still stores the inquiry, without them, when the database does not have the columns yet", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    insert.mockResolvedValueOnce({ error: { code: "PGRST204", message: "Could not find the 'gclid' column" } });
    await storeInquiry({ ...contact, attribution: paid, adClickIds: { gclid: "Cj0KCQjw_test-GCLID" } });
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[1][0]).not.toHaveProperty("gclid");
    expect(insert.mock.calls[1][0]).toMatchObject({ traffic_class: "campaign", traffic_source: "google" });
    expect(JSON.stringify(error.mock.calls)).not.toContain("Cj0KCQjw");
    error.mockRestore();
  });

  it("does not retry other failures", async () => {
    insert.mockResolvedValueOnce({ error: { code: "23514", message: "check violation" } });
    await expect(storeInquiry({ ...contact, attribution: paid, adClickIds: null })).rejects.toThrow();
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
