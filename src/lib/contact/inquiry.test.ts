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
      utm_term: null,
      utm_content: null,
      adgroup_id: null,
      match_type: null,
      gclid: null,
      gbraid: null,
      wbraid: null,
      lead_event_id: null,
      marketing_consent: null,
      consent_version: null,
      consent_decided_at: null,
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

  it("names every intake column on every insert, null where there is nothing: one canonical row shape", async () => {
    await storeInquiry({ ...contact, attribution, adClickIds: null });
    const row = insert.mock.calls[0][0];
    for (const column of ["utm_term", "utm_content", "adgroup_id", "match_type", "gclid", "gbraid", "wbraid", "lead_event_id", "marketing_consent", "consent_version", "consent_decided_at"]) {
      expect(row).toHaveProperty(column, null);
    }
  });

  it("writes the ad group and match type of the landing URL next to the matched keyword", async () => {
    await storeInquiry({ ...contact, attribution: { ...paid, adgroupId: "1234567890", matchType: "e" }, adClickIds: null });
    expect(insert.mock.calls[0][0]).toMatchObject({ utm_term: "website laten maken", adgroup_id: "1234567890", match_type: "e" });
  });

  it("writes the lead event id and the consent snapshot the route hands it, and null consent columns for no choice", async () => {
    await storeInquiry({
      ...contact,
      attribution: null,
      leadEventId: "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e",
      consent: { marketing: true, version: 5, decidedAt: "2026-09-30T18:00:00.000Z" },
    });
    expect(insert.mock.calls[0][0]).toMatchObject({
      lead_event_id: "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e",
      marketing_consent: true,
      consent_version: 5,
      consent_decided_at: "2026-09-30T18:00:00.000Z",
    });

    insert.mockClear();
    await storeInquiry({ ...contact, attribution: null, leadEventId: "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e", consent: null });
    expect(insert.mock.calls[0][0]).toMatchObject({ lead_event_id: "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e", marketing_consent: null, consent_version: null, consent_decided_at: null });
  });

  it("fails loudly on a schema mismatch instead of storing a row with fewer columns", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const code of ["PGRST204", "42703", "42501"]) {
      insert.mockClear();
      insert.mockResolvedValueOnce({ error: { code, message: "Could not find the 'lead_event_id' column of 'inquiries'" } });
      await expect(
        storeInquiry({ ...contact, attribution: paid, adClickIds: { gclid: "Cj0KCQjw_test-GCLID" }, leadEventId: "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e" }),
      ).rejects.toThrow(`schema mismatch (${code})`);
      expect(insert).toHaveBeenCalledTimes(1);
    }
    expect(JSON.stringify(error.mock.calls)).toContain("schema mismatch");
    expect(JSON.stringify(error.mock.calls)).not.toContain("Cj0KCQjw");
    error.mockRestore();
  });

  it("does not retry other failures", async () => {
    insert.mockResolvedValueOnce({ error: { code: "23514", message: "check violation" } });
    await expect(storeInquiry({ ...contact, attribution: paid, adClickIds: null })).rejects.toThrow();
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
