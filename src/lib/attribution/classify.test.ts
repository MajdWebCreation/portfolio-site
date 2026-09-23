import { describe, expect, it } from "vitest";
import { classifyAttribution, cleanLandingPath, validateAttribution } from "@/lib/attribution/classify";
import { aiSources, findSourceByHost, findSourceByUtm } from "@/lib/attribution/sources";

const base = { ownHostname: "ymcreations.com", landingPath: "/nl/diensten/bedrijfswebsite" };
const classify = (input: Partial<Parameters<typeof classifyAttribution>[0]> & { referrer: string }) =>
  classifyAttribution({ ...base, ...input });

describe("the source register", () => {
  it("recognises Google on every country domain, and only Google", () => {
    expect(findSourceByHost("www.google.com")?.source).toBe("google.com");
    expect(findSourceByHost("google.nl")?.source).toBe("google.com");
    expect(findSourceByHost("www.google.co.uk")?.source).toBe("google.com");
    expect(findSourceByHost("notgoogle.com")).toBeNull();
    expect(findSourceByHost("google.example")).toBeNull();
  });

  it("lets a more specific host win: Gemini is an assistant, not a search engine", () => {
    expect(findSourceByHost("gemini.google.com")).toMatchObject({ source: "gemini.google.com", trafficClass: "ai_assistant" });
  });

  it("matches subdomains of a listed host but not lookalikes", () => {
    expect(findSourceByHost("www.bing.com")?.source).toBe("bing.com");
    expect(findSourceByHost("mybing.com")).toBeNull();
    expect(findSourceByHost("lnkd.in")?.source).toBe("linkedin.com");
  });

  it("reads a UTM source only when it is a known host", () => {
    expect(findSourceByUtm("chatgpt.com")?.source).toBe("chatgpt.com");
    expect(findSourceByUtm("ChatGPT.com")?.source).toBe("chatgpt.com");
    expect(findSourceByUtm("newsletter")).toBeNull();
    expect(findSourceByUtm("chatgpt com")).toBeNull();
  });

  it("lists the AI sources for the dashboard", () => {
    expect(aiSources).toContain("chatgpt.com");
    expect(aiSources).toContain("perplexity.ai");
    expect(aiSources).toContain("claude.ai");
  });
});

describe("classifyAttribution", () => {
  it("ChatGPT via UTM, with or without a referrer", () => {
    expect(classify({ referrer: "", utmSource: "chatgpt.com" })).toEqual({
      trafficClass: "ai_assistant",
      trafficSource: "chatgpt.com",
      trafficMedium: "ai-assistant",
      campaign: null,
      landingPath: base.landingPath,
    });
    expect(classify({ referrer: "https://chatgpt.com/", utmSource: "chatgpt.com", utmMedium: "referral" })).toMatchObject({
      trafficClass: "ai_assistant",
      trafficSource: "chatgpt.com",
      trafficMedium: "referral",
    });
  });

  it("ChatGPT via referrer, on both hostnames", () => {
    expect(classify({ referrer: "https://chatgpt.com/c/abc?x=1" })).toMatchObject({ trafficClass: "ai_assistant", trafficSource: "chatgpt.com", trafficMedium: "ai-assistant" });
    expect(classify({ referrer: "https://chat.openai.com/" })).toMatchObject({ trafficClass: "ai_assistant", trafficSource: "chatgpt.com" });
  });

  it("Google and Bing as organic search", () => {
    expect(classify({ referrer: "https://www.google.nl/" })).toMatchObject({ trafficClass: "organic_search", trafficSource: "google.com", trafficMedium: "organic" });
    expect(classify({ referrer: "https://www.bing.com/search?q=x" })).toMatchObject({ trafficClass: "organic_search", trafficSource: "bing.com" });
  });

  it("social, referral, internal and direct", () => {
    expect(classify({ referrer: "https://www.linkedin.com/feed/" })).toMatchObject({ trafficClass: "social", trafficSource: "linkedin.com", trafficMedium: "social" });
    expect(classify({ referrer: "https://www.example-partner.nl/links?id=9#top" })).toEqual({
      trafficClass: "referral",
      trafficSource: "example-partner.nl",
      trafficMedium: "referral",
      campaign: null,
      landingPath: base.landingPath,
    });
    expect(classify({ referrer: "https://ymcreations.com/nl/tarieven" })).toMatchObject({ trafficClass: "internal", trafficSource: null });
    expect(classify({ referrer: "https://www.ymcreations.com/" })).toMatchObject({ trafficClass: "internal" });
    expect(classify({ referrer: "" })).toEqual({ trafficClass: "direct", trafficSource: null, trafficMedium: null, campaign: null, landingPath: base.landingPath });
  });

  it("a campaign keeps its UTM values, cleaned", () => {
    expect(classify({ referrer: "https://mail.example.com/", utmSource: "Nieuwsbrief", utmMedium: "email", utmCampaign: "Voorjaar 2026" })).toEqual({
      trafficClass: "campaign",
      trafficSource: "nieuwsbrief",
      trafficMedium: "email",
      campaign: "voorjaar 2026",
      landingPath: base.landingPath,
    });
  });

  it("AI wins over the generic campaign rule", () => {
    expect(classify({ referrer: "", utmSource: "chatgpt.com", utmMedium: "cpc", utmCampaign: "x" })).toMatchObject({ trafficClass: "ai_assistant", campaign: "x" });
  });

  it("makes nothing up from a referrer it cannot read", () => {
    expect(classify({ referrer: "not a url" })).toMatchObject({ trafficClass: "direct" });
    expect(classify({ referrer: "android-app://com.google.android.gm/" })).toMatchObject({ trafficClass: "direct" });
  });

  it("drops UTM values with unsafe characters or excessive length, and refuses a bad landing path", () => {
    expect(classify({ referrer: "", utmSource: "<script>" })).toMatchObject({ trafficClass: "direct" });
    expect(classify({ referrer: "", utmSource: "a".repeat(101) })).toMatchObject({ trafficClass: "direct" });
    expect(classifyAttribution({ ...base, referrer: "", landingPath: "https://evil.example/" })).toBeNull();
    expect(classifyAttribution({ ...base, referrer: "", landingPath: "//evil.example/" })).toBeNull();
  });

  it("keeps the landing path without its query string", () => {
    expect(cleanLandingPath("/nl/tarieven?utm_source=chatgpt.com#business")).toBe("/nl/tarieven");
    expect(cleanLandingPath("/nl/x\u0000y")).toBeNull();
    expect(cleanLandingPath("/" + "a".repeat(200))).toBeNull();
  });
});

describe("validateAttribution (server side)", () => {
  const valid = { trafficClass: "ai_assistant", trafficSource: "chatgpt.com", trafficMedium: "ai-assistant", campaign: null, landingPath: "/nl/tarieven" };

  it("accepts exactly what the classifier produces", () => {
    expect(validateAttribution(valid)).toEqual(valid);
    expect(validateAttribution({ trafficClass: "direct", trafficSource: null, trafficMedium: null, campaign: null, landingPath: "/nl" })).toMatchObject({ trafficClass: "direct" });
    expect(validateAttribution({ trafficClass: "referral", trafficSource: "example-partner.nl", trafficMedium: "referral", campaign: null, landingPath: "/en" })).toMatchObject({ trafficClass: "referral" });
    expect(validateAttribution({ trafficClass: "campaign", trafficSource: "nieuwsbrief", trafficMedium: "email", campaign: "voorjaar 2026", landingPath: "/nl" })).toMatchObject({ trafficClass: "campaign" });
  });

  it("refuses an unknown class, including 'unknown'", () => {
    expect(validateAttribution({ ...valid, trafficClass: "unknown" })).toBeNull();
    expect(validateAttribution({ ...valid, trafficClass: "Organic Search" })).toBeNull();
  });

  it("refuses a source that is not a hostname, or not the host the class claims", () => {
    expect(validateAttribution({ ...valid, trafficSource: "https://chatgpt.com/" })).toBeNull();
    expect(validateAttribution({ ...valid, trafficSource: "chat gpt" })).toBeNull();
    expect(validateAttribution({ ...valid, trafficSource: "example.com" })).toBeNull();
    expect(validateAttribution({ ...valid, trafficClass: "organic_search" })).toBeNull();
    expect(validateAttribution({ trafficClass: "direct", trafficSource: "google.com", trafficMedium: null, campaign: null, landingPath: "/nl" })).toBeNull();
  });

  it("refuses values over the limits", () => {
    expect(validateAttribution({ ...valid, trafficClass: "referral", trafficSource: `${"a".repeat(100)}.nl` })).toBeNull();
    expect(validateAttribution({ ...valid, campaign: "a".repeat(101) })).toBeNull();
    expect(validateAttribution({ ...valid, trafficMedium: "a".repeat(101) })).toBeNull();
  });

  it("refuses an external or unclean landing path", () => {
    expect(validateAttribution({ ...valid, landingPath: "https://ymcreations.com/nl" })).toBeNull();
    expect(validateAttribution({ ...valid, landingPath: "/nl/tarieven?x=1" })).toBeNull();
    expect(validateAttribution({ ...valid, landingPath: "/nl/\u0007" })).toBeNull();
    expect(validateAttribution({ ...valid, landingPath: "" })).toBeNull();
  });

  it("refuses values that look like a person or free text", () => {
    expect(validateAttribution({ ...valid, trafficClass: "campaign", trafficSource: "jan@example.com" })).toBeNull();
    expect(validateAttribution({ ...valid, campaign: "Bel mij op 0612345678!" })).toBeNull();
    expect(validateAttribution({ ...valid, trafficMedium: "Neem contact op" })).toBeNull();
  });

  it("refuses a malformed payload", () => {
    expect(validateAttribution(null)).toBeNull();
    expect(validateAttribution("chatgpt.com")).toBeNull();
    expect(validateAttribution([])).toBeNull();
    expect(validateAttribution({})).toBeNull();
    expect(validateAttribution({ ...valid, trafficSource: 42 })).toBeNull();
    expect(validateAttribution({ ...valid, extra: "field" })).toEqual(valid);
  });
});
