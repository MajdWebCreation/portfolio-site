import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* Account values the module reads when it loads; none of them is real. */
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_GOOGLE_ADS_ID = "AW-111111111";
  process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL = "LeadLabel01";
  process.env.NEXT_PUBLIC_GOOGLE_ADS_PHONE_LABEL = "PhoneLabel01";
  delete process.env.NEXT_PUBLIC_GOOGLE_ADS_WHATSAPP_LABEL;
});

let marketing = false;
vi.mock("@/lib/consent/store", () => ({ hasMarketingConsent: () => marketing }));
/* What the running tag was told; follows the stored choice unless a test separates them. */
let adsConsent: boolean | null = null;
vi.mock("@/lib/google/tag", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/google/tag")>()),
  googleAdsConsentGranted: () => adsConsent ?? marketing,
}));
const trackMetaLead = vi.fn();
vi.mock("@/lib/meta/track", () => ({ trackMetaLead: (input: unknown) => trackMetaLead(input) }));
const trackUntypedEvent = vi.fn();
vi.mock("@/lib/analytics/track", () => ({
  trackUntypedEvent: (name: string, params: unknown) => trackUntypedEvent(name, params),
}));

const { contactMethodForHref, reportContactClick, reportLead, resetReportedLeads, sendAdsConversion } = await import(
  "@/lib/tracking/conversions"
);

const gtag = vi.fn();
const leadId = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";

beforeEach(() => {
  marketing = false;
  adsConsent = null;
  gtag.mockReset();
  trackMetaLead.mockReset();
  trackUntypedEvent.mockReset();
  resetReportedLeads();
  vi.stubGlobal("window", { gtag });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("contactMethodForHref", () => {
  it("recognises phone and WhatsApp links, and nothing else", () => {
    expect(contactMethodForHref("tel:+31653400220")).toBe("phone");
    expect(contactMethodForHref("https://wa.me/31653400220?text=Hallo")).toBe("whatsapp");
    expect(contactMethodForHref("https://api.whatsapp.com/send?phone=31653400220")).toBe("whatsapp");
    expect(contactMethodForHref("mailto:contact@ymcreations.com")).toBeNull();
    expect(contactMethodForHref("https://ymcreations.com/nl/contact")).toBeNull();
    expect(contactMethodForHref("https://wa.me.evil.example/x")).toBeNull();
    expect(contactMethodForHref("not a url")).toBeNull();
  });
});

describe("Google Ads conversions", () => {
  it("send nothing without marketing consent", () => {
    expect(sendAdsConversion("phone")).toBe(false);
    expect(gtag).not.toHaveBeenCalled();
  });

  it("go to the Ads account and this action's label only", () => {
    marketing = true;
    expect(sendAdsConversion("phone")).toBe(true);
    expect(gtag).toHaveBeenCalledWith("event", "conversion", { send_to: "AW-111111111/PhoneLabel01" });
  });

  it("are skipped quietly when the action has no label yet", () => {
    marketing = true;
    expect(sendAdsConversion("whatsapp")).toBe(false);
    expect(gtag).not.toHaveBeenCalled();
  });

  it("are skipped when the tag is not running", () => {
    marketing = true;
    vi.stubGlobal("window", {});
    expect(sendAdsConversion("phone")).toBe(false);
  });
});

describe("reportLead", () => {
  it("reports nothing without the id the server hands out on success", () => {
    marketing = true;
    reportLead({ form: "contact", eventId: undefined });
    reportLead({ form: "contact", eventId: "not-a-uuid" });
    expect(trackMetaLead).not.toHaveBeenCalled();
    expect(gtag).not.toHaveBeenCalled();
  });

  it("reports an accepted enquiry to Meta and Google Ads with the same id, once", () => {
    marketing = true;
    reportLead({ form: "contact", eventId: leadId });
    reportLead({ form: "contact", eventId: leadId });

    expect(trackMetaLead).toHaveBeenCalledTimes(1);
    expect(trackMetaLead).toHaveBeenCalledWith({ form: "contact", eventId: leadId });
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith("event", "conversion", { send_to: "AW-111111111/LeadLabel01", transaction_id: leadId });
  });
});

describe("reportContactClick", () => {
  it("sends the GA event with the method and a known placement, never the number", () => {
    reportContactClick("phone", "contact_block");
    expect(trackUntypedEvent).toHaveBeenCalledWith("contact_click", { contact_method: "phone", placement: "contact_block" });
  });

  it("leaves an unknown placement out rather than losing the event", () => {
    reportContactClick("whatsapp", "somewhere-else");
    expect(trackUntypedEvent).toHaveBeenCalledWith("contact_click", { contact_method: "whatsapp", placement: undefined });
  });

  it("adds the Ads conversion only with marketing consent", () => {
    reportContactClick("phone");
    expect(gtag).not.toHaveBeenCalled();

    marketing = true;
    reportContactClick("phone");
    expect(gtag).toHaveBeenCalledWith("event", "conversion", { send_to: "AW-111111111/PhoneLabel01" });
  });
});

describe("enhanced conversions on a lead", () => {
  const contact = { email: " Jan.Jansen@Gmail.com ", phone: "06 12 34 56 78" };
  const commands = () => gtag.mock.calls;

  it("puts the normalised user data on the one lead conversion event, never on the tag globally", () => {
    marketing = true;
    reportLead({ form: "project_planner", eventId: leadId, contact });

    expect(commands()).toEqual([
      [
        "event",
        "conversion",
        {
          send_to: "AW-111111111/LeadLabel01",
          transaction_id: leadId,
          user_data: { email: "janjansen@gmail.com", phone_number: "+31612345678" },
        },
      ],
    ]);
    expect(commands().some((call) => call[0] === "set")).toBe(false);
  });

  it("sends nothing to Google, and no contact details at all, without marketing consent", () => {
    reportLead({ form: "contact", eventId: leadId, contact });
    expect(gtag).not.toHaveBeenCalled();
  });

  it("sends nothing when the tag was not told ad_user_data is granted, whatever the stored choice", () => {
    marketing = true;
    adsConsent = false;
    reportLead({ form: "contact", eventId: leadId, contact });
    expect(gtag).not.toHaveBeenCalled();
  });

  it("sends nothing for a failed enquiry, which has no lead id", () => {
    marketing = true;
    reportLead({ form: "contact", eventId: undefined, contact });
    reportLead({ form: "contact", eventId: null, contact });
    expect(gtag).not.toHaveBeenCalled();
    expect(trackMetaLead).not.toHaveBeenCalled();
  });

  it("counts a double submit of the same enquiry once, user data included", () => {
    marketing = true;
    reportLead({ form: "contact", eventId: leadId, contact });
    reportLead({ form: "contact", eventId: leadId, contact });
    expect(commands().filter((call) => call[1] === "conversion")).toHaveLength(1);
  });

  it("works with the email address alone", () => {
    marketing = true;
    reportLead({ form: "contact", eventId: leadId, contact: { email: "info@bedrijf.nl" } });
    expect(commands()[0][2]).toMatchObject({ user_data: { email: "info@bedrijf.nl" } });
  });

  it("drops malformed details but still counts the lead", () => {
    marketing = true;
    reportLead({ form: "websitecheck", eventId: leadId, contact: { email: "niet-een-adres", phone: "bel me" } });
    expect(commands()).toEqual([["event", "conversion", { send_to: "AW-111111111/LeadLabel01", transaction_id: leadId }]]);
  });

  it("never gives the contact details to a click conversion, not even right after a lead", () => {
    marketing = true;
    reportLead({ form: "contact", eventId: leadId, contact });
    gtag.mockClear();

    reportContactClick("phone");
    reportContactClick("whatsapp");
    expect(commands()).toEqual([
      ["event", "conversion", { send_to: "AW-111111111/PhoneLabel01" }],
    ]);
    expect(commands().every((call) => call[0] !== "set" && !("user_data" in (call[2] as object)))).toBe(true);
  });

  it("leaves Meta exactly as it was: form and event id, no contact details", () => {
    marketing = true;
    reportLead({ form: "project_planner", eventId: leadId, contact });
    expect(trackMetaLead).toHaveBeenCalledWith({ form: "project_planner", eventId: leadId });
  });

  it("leaves GA alone: a lead sends no GA event and no user data through the GA path", () => {
    marketing = true;
    reportLead({ form: "contact", eventId: leadId, contact });
    expect(trackUntypedEvent).not.toHaveBeenCalled();
  });

  it("never writes an address or number into the debug log", () => {
    vi.stubEnv("NEXT_PUBLIC_TRACKING_DRY_RUN", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    marketing = true;
    reportLead({ form: "project_planner", eventId: leadId, contact });

    const logged = JSON.stringify(info.mock.calls);
    expect(logged).toContain("user_data");
    expect(logged).not.toMatch(/janjansen|jan\.jansen|gmail|31612345678|12 34 56 78/i);
    info.mockRestore();
    vi.unstubAllEnvs();
  });
});
