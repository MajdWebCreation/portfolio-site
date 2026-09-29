import { afterEach, describe, expect, it, vi } from "vitest";

/* The configuration is read from build-time variables; each case sets its own. */
async function toolsWith(env: Record<string, string>) {
  vi.resetModules();
  for (const name of ["NEXT_PUBLIC_GA_MEASUREMENT_ID", "NEXT_PUBLIC_GOOGLE_ADS_ID", "NEXT_PUBLIC_CLARITY_PROJECT_ID", "NEXT_PUBLIC_META_PIXEL_ID"]) {
    vi.stubEnv(name, env[name] ?? "");
  }
  return import("@/lib/consent/tools");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("configuredConsentTools", () => {
  it("offers nothing, and no settings link, without any tool", async () => {
    const { configuredConsentTools, hasConsentTools } = await toolsWith({});
    expect(configuredConsentTools()).toEqual({ analytics: false, recordings: false, marketing: false });
    expect(hasConsentTools()).toBe(false);
  });

  it("counts Google Ads alone as marketing, so the card and the settings link both exist", async () => {
    const { configuredConsentTools, hasConsentTools } = await toolsWith({ NEXT_PUBLIC_GOOGLE_ADS_ID: "AW-18436471036" });
    expect(configuredConsentTools()).toEqual({ analytics: false, recordings: false, marketing: true });
    expect(hasConsentTools()).toBe(true);
  });

  it("maps GA to statistics and the Meta Pixel to marketing", async () => {
    const { configuredConsentTools } = await toolsWith({
      NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-ABC123DEF4",
      NEXT_PUBLIC_META_PIXEL_ID: "1234567890123456",
    });
    expect(configuredConsentTools()).toEqual({ analytics: true, recordings: false, marketing: true });
  });
});
