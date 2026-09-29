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
