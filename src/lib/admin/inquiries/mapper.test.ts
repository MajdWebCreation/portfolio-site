import { describe, expect, it } from "vitest";
import { inquiryFromRow, statusEventFromRow, type InquiryRow, type InquiryStatusEventRow } from "@/lib/admin/inquiries/mapper";
import { summarizeInquiry } from "@/lib/admin/inquiries/types";

const base: InquiryRow = {
  id: "00000000-0000-0000-0000-000000000001",
  origin: "contact",
  status: "new",
  status_changed_at: "2026-09-24T09:00:00Z",
  lost_reason: null,
  service_interest: null,
  quoted_value_cents: null,
  won_value_cents: null,
  recurring_monthly_cents: null,
  currency: "EUR",
  lead_event_id: null,
  marketing_consent: null,
  consent_version: null,
  consent_decided_at: null,
  adgroup_id: null,
  match_type: null,
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
  utm_term: null,
  utm_content: null,
  gclid: null,
  gbraid: null,
  wbraid: null,
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

describe("the lifecycle columns", () => {
  it("map status, reason, service, current values, lead id and consent; absent ones stay absent", () => {
    const inquiry = inquiryFromRow({
      ...base,
      status: "won",
      status_changed_at: "2026-10-02T10:00:00Z",
      service_interest: "business-websites",
      quoted_value_cents: 149500,
      won_value_cents: 149500,
      recurring_monthly_cents: 1500,
      lead_event_id: "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e",
      marketing_consent: true,
      consent_version: 5,
      consent_decided_at: "2026-09-30T18:00:00Z",
      traffic_class: "campaign",
      traffic_source: "google",
      traffic_medium: "cpc",
      campaign: "123456",
      utm_term: "website laten maken",
      utm_content: "987654",
      adgroup_id: "555",
      match_type: "e",
      landing_path: "/nl/diensten/website-laten-maken",
    });
    expect(inquiry).toMatchObject({
      status: "won",
      statusChangedAt: "2026-10-02T10:00:00Z",
      serviceInterest: "business-websites",
      quotedValueCents: 149500,
      wonValueCents: 149500,
      recurringMonthlyCents: 1500,
      leadEventId: "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e",
      consent: { marketing: true, version: 5, decidedAt: "2026-09-30T18:00:00Z" },
      attribution: { term: "website laten maken", content: "987654", adgroupId: "555", matchType: "e" },
    });
    expect(inquiry).not.toHaveProperty("lostReason");

    const bare = inquiryFromRow(base);
    for (const key of ["lostReason", "serviceInterest", "quotedValueCents", "wonValueCents", "recurringMonthlyCents", "leadEventId", "consent"]) {
      expect(bare).not.toHaveProperty(key);
    }
  });

  it("keeps a lost reason and refuses a value the register does not know", () => {
    expect(inquiryFromRow({ ...base, status: "lost", lost_reason: "price" })).toMatchObject({ status: "lost", lostReason: "price" });
    expect(inquiryFromRow({ ...base, status: "lost", lost_reason: "meteor" })).not.toHaveProperty("lostReason");
    expect(inquiryFromRow({ ...base, service_interest: "time-travel" })).not.toHaveProperty("serviceInterest");
  });

  it("maps a history row with its values and the resolved admin name", () => {
    const row: InquiryStatusEventRow = {
      id: "e1",
      inquiry_id: base.id,
      from_status: "quote_sent",
      to_status: "won",
      lost_reason: null,
      value_cents: 149500,
      recurring_monthly_cents: 1500,
      currency: "EUR",
      changed_at: "2026-10-02T10:00:00Z",
      changed_by: "u1",
    };
    expect(statusEventFromRow(row, "Majd")).toEqual({
      id: "e1",
      fromStatus: "quote_sent",
      toStatus: "won",
      valueCents: 149500,
      recurringMonthlyCents: 1500,
      changedAt: "2026-10-02T10:00:00Z",
      changedBy: "Majd",
    });
    expect(statusEventFromRow({ ...row, from_status: null, value_cents: null, recurring_monthly_cents: null, currency: null, changed_by: null }, undefined)).toEqual({
      id: "e1",
      toStatus: "won",
      changedAt: "2026-10-02T10:00:00Z",
    });
  });
});
