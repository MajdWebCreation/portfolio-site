import { describe, expect, it } from "vitest";
import { inquiryFromRow, type InquiryRow } from "@/lib/admin/inquiries/mapper";
import { summarizeInquiry } from "@/lib/admin/inquiries/types";

const base: InquiryRow = {
  id: "00000000-0000-0000-0000-000000000001",
  origin: "contact",
  status: "new",
  received_at: "2026-09-24T09:00:00Z",
  locale: "nl",
  name: "Anna Voorbeeld",
  email: "anna@example.com",
  company: null,
  message: "",
  internal_note: null,
  phone: null,
  planner: null,
  website_url: null,
  updated_at: "2026-09-24T09:00:00Z",
  traffic_class: null,
  traffic_source: null,
  traffic_medium: null,
  campaign: null,
  landing_path: null,
};

describe("a websitecheck row", () => {
  it("becomes a websitecheck inquiry with its address and phone", () => {
    const inquiry = inquiryFromRow({
      ...base,
      origin: "websitecheck",
      phone: "06 12345678",
      website_url: "https://www.example.nl/",
      traffic_class: "campaign",
      traffic_source: "facebook",
      traffic_medium: "paid-social",
      campaign: "websitecheck",
      landing_path: "/nl/websitecheck",
    });

    expect(inquiry.origin).toBe("websitecheck");
    if (inquiry.origin !== "websitecheck") throw new Error("unreachable");
    expect(inquiry.websiteUrl).toBe("https://www.example.nl/");
    expect(inquiry.phone).toBe("06 12345678");
    expect(inquiry.attribution).toEqual({
      trafficClass: "campaign",
      trafficSource: "facebook",
      trafficMedium: "paid-social",
      campaign: "websitecheck",
      landingPath: "/nl/websitecheck",
    });
    expect(summarizeInquiry(inquiry)).toBe("example.nl");
  });

  it("leaves contact and planner rows as they were", () => {
    expect(inquiryFromRow({ ...base, message: "Een bericht." }).origin).toBe("contact");
    const planner = inquiryFromRow({ ...base, origin: "project_planner", planner: { projectTypeKey: "starter" }, phone: "0612345678" });
    expect(planner.origin).toBe("project_planner");
    if (planner.origin !== "project_planner") throw new Error("unreachable");
    expect(planner.phone).toBe("0612345678");
  });
});
