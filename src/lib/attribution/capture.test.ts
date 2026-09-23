import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let consent = false;
const hydrateConsent = vi.fn();
vi.mock("@/lib/consent/store", () => ({
  hasAnalyticsConsent: () => consent,
  hydrateConsent: () => hydrateConsent(),
}));

import {
  ATTRIBUTION_STORAGE_KEY,
  captureAttribution,
  currentAttribution,
  resetAttributionCapture,
  syncAttributionStorage,
} from "@/lib/attribution/capture";

/** Just enough browser: a location, a referrer, and a sessionStorage that counts. */
function stubBrowser({ referrer, path, search = "" }: { referrer: string; path: string; search?: string }) {
  const session = new Map<string, string>();
  const local = new Map<string, string>();
  const storage = (map: Map<string, string>) => ({
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    get length() {
      return map.size;
    },
  });
  vi.stubGlobal("window", {
    location: { hostname: "ymcreations.com", pathname: path, search },
    sessionStorage: storage(session),
    localStorage: storage(local),
  });
  vi.stubGlobal("document", { referrer });
  return { session, local };
}

describe("captureAttribution", () => {
  beforeEach(() => {
    consent = false;
    resetAttributionCapture();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("classifies the first page and keeps it in memory only, before consent", () => {
    const { session, local } = stubBrowser({ referrer: "https://chatgpt.com/", path: "/nl/tarieven", search: "?utm_source=chatgpt.com" });
    const value = captureAttribution();
    expect(hydrateConsent).toHaveBeenCalled();
    expect(value).toMatchObject({ trafficClass: "ai_assistant", trafficSource: "chatgpt.com", landingPath: "/nl/tarieven" });
    expect(currentAttribution()).toEqual(value);
    expect(session.size).toBe(0);
    expect(local.size).toBe(0);
  });

  it("is first touch: a later capture on an internal page changes nothing", () => {
    stubBrowser({ referrer: "https://www.google.nl/", path: "/nl" });
    const first = captureAttribution();
    vi.unstubAllGlobals();
    stubBrowser({ referrer: "https://ymcreations.com/nl", path: "/nl/contact" });
    expect(captureAttribution()).toEqual(first);
    expect(currentAttribution()?.landingPath).toBe("/nl");
  });

  it("writes to sessionStorage once consent is granted, and removes it on withdrawal", () => {
    const { session, local } = stubBrowser({ referrer: "https://www.bing.com/", path: "/en/pricing" });
    captureAttribution();
    expect(session.has(ATTRIBUTION_STORAGE_KEY)).toBe(false);

    consent = true;
    syncAttributionStorage(true);
    expect(JSON.parse(session.get(ATTRIBUTION_STORAGE_KEY) ?? "null")).toMatchObject({ trafficClass: "organic_search", trafficSource: "bing.com" });
    expect(local.size).toBe(0);

    consent = false;
    syncAttributionStorage(false);
    expect(session.has(ATTRIBUTION_STORAGE_KEY)).toBe(false);
  });

  it("restores a stored value after a reload with consent, ignoring the internal referrer", () => {
    consent = true;
    const { session } = stubBrowser({ referrer: "https://chat.openai.com/", path: "/nl/diensten" });
    captureAttribution();
    expect(session.has(ATTRIBUTION_STORAGE_KEY)).toBe(true);
    const stored = session.get(ATTRIBUTION_STORAGE_KEY) ?? "";

    resetAttributionCapture();
    vi.unstubAllGlobals();
    const reloaded = stubBrowser({ referrer: "https://ymcreations.com/nl/diensten", path: "/nl/diensten" });
    reloaded.session.set(ATTRIBUTION_STORAGE_KEY, stored);
    expect(captureAttribution()).toMatchObject({ trafficClass: "ai_assistant", trafficSource: "chatgpt.com", landingPath: "/nl/diensten" });
  });

  it("loses the value on a reload without consent, as designed", () => {
    stubBrowser({ referrer: "https://chatgpt.com/", path: "/nl" });
    captureAttribution();
    resetAttributionCapture();
    vi.unstubAllGlobals();
    stubBrowser({ referrer: "https://ymcreations.com/nl", path: "/nl" });
    expect(captureAttribution()).toMatchObject({ trafficClass: "internal" });
  });

  it("ignores a tampered stored value", () => {
    consent = true;
    const { session } = stubBrowser({ referrer: "", path: "/nl" });
    session.set(ATTRIBUTION_STORAGE_KEY, JSON.stringify({ trafficClass: "ai_assistant", trafficSource: "evil.example", trafficMedium: null, campaign: null, landingPath: "/nl" }));
    expect(captureAttribution()).toMatchObject({ trafficClass: "direct" });
  });
});
