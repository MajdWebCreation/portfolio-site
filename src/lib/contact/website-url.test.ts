import { describe, expect, it } from "vitest";
import { normalizeWebsiteUrl, websiteUrlHost } from "@/lib/contact/website-url";

describe("normalizeWebsiteUrl", () => {
  it("accepts the ways people write their own site", () => {
    expect(normalizeWebsiteUrl("jouwbedrijf.nl")).toBe("https://jouwbedrijf.nl/");
    expect(normalizeWebsiteUrl("www.jouwbedrijf.nl")).toBe("https://www.jouwbedrijf.nl/");
    expect(normalizeWebsiteUrl("https://jouwbedrijf.nl")).toBe("https://jouwbedrijf.nl/");
    expect(normalizeWebsiteUrl("http://jouwbedrijf.nl/over-ons")).toBe("http://jouwbedrijf.nl/over-ons");
    expect(normalizeWebsiteUrl("  WWW.JouwBedrijf.NL/Team  ")).toBe("https://www.jouwbedrijf.nl/Team");
    expect(normalizeWebsiteUrl("jouwbedrijf.nl?ref=1#top")).toBe("https://jouwbedrijf.nl/?ref=1");
    expect(normalizeWebsiteUrl("bedrijf.co.uk")).toBe("https://bedrijf.co.uk/");
    expect(normalizeWebsiteUrl("münchen-bau.de")).toBe("https://xn--mnchen-bau-9db.de/");
  });

  it("refuses what is not a public website address", () => {
    for (const input of [
      "",
      "   ",
      "jouwbedrijf",
      "naam@bedrijf.nl",
      "https://naam:geheim@bedrijf.nl",
      "javascript:alert(1)",
      "mailto:naam@bedrijf.nl",
      "ftp://bedrijf.nl",
      "localhost",
      "http://localhost:3000",
      "bedrijf .nl",
      "bedrijf.nl/<script>",
      "bedrijf.nl/'quote",
      "https://bedrijf.nl\\pad",
      "-bedrijf.nl",
      "bedrijf.123",
      42,
      null,
      undefined,
      `bedrijf.nl/${"a".repeat(600)}`,
    ]) {
      expect(normalizeWebsiteUrl(input), String(input)).toBeNull();
    }
  });
});

describe("websiteUrlHost", () => {
  it("names the site without www", () => {
    expect(websiteUrlHost("https://www.jouwbedrijf.nl/over-ons")).toBe("jouwbedrijf.nl");
    expect(websiteUrlHost("https://jouwbedrijf.nl/")).toBe("jouwbedrijf.nl");
  });

  it("returns the input when it is not a URL", () => {
    expect(websiteUrlHost("jouwbedrijf")).toBe("jouwbedrijf");
  });
});
