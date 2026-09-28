import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shouldLoadClarity } from "@/lib/clarity/client";
import { CONSENT_COOKIE, readCookieValue } from "@/lib/consent/consent";

/*
  The consent store against a small stand-in browser: a cookie jar that
  honours Max-Age=0, a location, and a Clarity stub that records its calls.
  Which tag may load is decided by the store's flags (and, for Clarity, the
  loader rule); these tests pin every combination and both withdrawals.
*/
const GA_ID = "G-TEST123";

function fakeBrowser(initialCookies: Record<string, string> = {}) {
  const jar = new Map(Object.entries(initialCookies));
  const clarityCalls: unknown[][] = [];
  const fbqCalls: unknown[][] = [];
  const document = {
    get cookie() {
      return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
    },
    set cookie(raw: string) {
      const [pair, ...attributes] = raw.split(";").map((part) => part.trim());
      const [name, ...rest] = pair.split("=");
      if (attributes.some((attribute) => attribute === "Max-Age=0")) jar.delete(name);
      else jar.set(name, rest.join("="));
    },
  };
  const window: Record<string, unknown> = {
    location: { protocol: "https:", hostname: "www.ymcreations.com", reload: vi.fn() },
    clarity: (...args: unknown[]) => clarityCalls.push(args),
    fbq: (...args: unknown[]) => fbqCalls.push(args),
  };
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  return { jar, window, clarityCalls, fbqCalls };
}

async function freshStore() {
  vi.resetModules();
  return import("@/lib/consent/store");
}

const clarityWouldLoad = (recordings: boolean) => shouldLoadClarity({ projectId: "abc123xyz", recordingsConsent: recordings, pathname: "/nl/tarieven" });

beforeEach(() => {
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = GA_ID;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
});

describe("choices", () => {
  it.each([
    ["version-1", "1.a1."],
    ["version-2", "2.a1.r1."],
  ])("asks again for a %s choice", async (_label, prefix) => {
    fakeBrowser({ [CONSENT_COOKIE]: encodeURIComponent(`${prefix}${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}`) });
    const store = await freshStore();
    store.hydrateConsent();
    expect(store.hasAnalyticsConsent()).toBe(false);
    expect(store.hasRecordingsConsent()).toBe(false);
    expect(store.hasMarketingConsent()).toBe(false);
  });

  it.each([
    ["necessary only", false, false, false],
    ["statistics only", true, false, false],
    ["recordings only", false, true, false],
    ["marketing only", false, false, true],
    ["everything", true, true, true],
  ] as const)("%s: GA %s, Clarity %s, Meta %s, nothing implied", async (_label, analytics, recordings, marketing) => {
    const browser = fakeBrowser();
    const store = await freshStore();
    store.hydrateConsent();
    const result = store.decideConsent({ analytics, recordings, marketing });

    expect(store.hasAnalyticsConsent()).toBe(analytics);
    expect(store.hasRecordingsConsent()).toBe(recordings);
    expect(store.hasMarketingConsent()).toBe(marketing);
    expect(clarityWouldLoad(store.hasRecordingsConsent())).toBe(recordings);
    expect(result.reloadRequired).toBe(false);
    expect(readCookieValue(document.cookie, CONSENT_COOKIE)).toMatch(
      new RegExp(`^3\\.a${analytics ? 1 : 0}\\.r${recordings ? 1 : 0}\\.m${marketing ? 1 : 0}\\.`),
    );
    expect(browser.clarityCalls).toEqual([]);
    expect(browser.fbqCalls).toEqual([]);
  });
});

describe("withdrawing recordings", () => {
  it("stops Clarity, clears its cookies, asks for a reload, and leaves GA running", async () => {
    const browser = fakeBrowser({ _clck: "id|1", _clsk: "s|1", _ga: "GA1.1.1" });
    const store = await freshStore();
    store.hydrateConsent();
    store.decideConsent({ analytics: true, recordings: true, marketing: false });

    const result = store.decideConsent({ analytics: true, recordings: false, marketing: false });

    expect(result.reloadRequired).toBe(true);
    expect(browser.clarityCalls).toEqual([["consent", false]]);
    expect(browser.jar.has("_clck")).toBe(false);
    expect(browser.jar.has("_clsk")).toBe(false);
    expect(store.hasAnalyticsConsent()).toBe(true);
    expect(browser.jar.has("_ga")).toBe(true);
    expect(browser.window[`ga-disable-${GA_ID}`]).toBe(false);
    expect(clarityWouldLoad(store.hasRecordingsConsent())).toBe(false);
  });

  it("still clears the cookies when the Clarity tag never loaded", async () => {
    const browser = fakeBrowser({ _clck: "id|1" });
    delete browser.window.clarity;
    const store = await freshStore();
    store.hydrateConsent();
    store.decideConsent({ analytics: false, recordings: true, marketing: false });
    expect(store.decideConsent({ analytics: false, recordings: false, marketing: false }).reloadRequired).toBe(true);
    expect(browser.jar.has("_clck")).toBe(false);
  });
});

describe("withdrawing analytics", () => {
  it("stops GA and clears its cookies, and keeps Clarity when recordings stay on", async () => {
    const browser = fakeBrowser({ _ga: "GA1.1.1", _ga_TEST123: "x", _clck: "id|1" });
    const store = await freshStore();
    store.hydrateConsent();
    store.decideConsent({ analytics: true, recordings: true, marketing: false });

    const result = store.decideConsent({ analytics: false, recordings: true, marketing: false });

    expect(result.reloadRequired).toBe(false);
    expect(browser.window[`ga-disable-${GA_ID}`]).toBe(true);
    expect(browser.jar.has("_ga")).toBe(false);
    expect(browser.jar.has("_ga_TEST123")).toBe(false);
    expect(browser.jar.has("_clck")).toBe(true);
    expect(browser.clarityCalls).toEqual([]);
    expect(clarityWouldLoad(store.hasRecordingsConsent())).toBe(true);
  });
});

describe("withdrawing marketing", () => {
  it("revokes the Meta Pixel, clears its cookies, asks for a reload, and leaves the rest running", async () => {
    const browser = fakeBrowser({ _fbp: "fb.1.1.1", _fbc: "fb.1.1.abc", _ga: "GA1.1.1", _clck: "id|1" });
    const store = await freshStore();
    store.hydrateConsent();
    store.decideConsent({ analytics: true, recordings: true, marketing: true });

    const result = store.decideConsent({ analytics: true, recordings: true, marketing: false });

    expect(result.reloadRequired).toBe(true);
    expect(browser.fbqCalls).toEqual([["consent", "revoke"]]);
    expect(browser.jar.has("_fbp")).toBe(false);
    expect(browser.jar.has("_fbc")).toBe(false);
    expect(browser.jar.has("_ga")).toBe(true);
    expect(browser.jar.has("_clck")).toBe(true);
    expect(browser.clarityCalls).toEqual([]);
    expect(store.hasAnalyticsConsent()).toBe(true);
    expect(store.hasRecordingsConsent()).toBe(true);
    expect(store.hasMarketingConsent()).toBe(false);
  });

  it("still clears the cookies when the pixel never loaded", async () => {
    const browser = fakeBrowser({ _fbp: "fb.1.1.1" });
    delete browser.window.fbq;
    const store = await freshStore();
    store.hydrateConsent();
    store.decideConsent({ analytics: false, recordings: false, marketing: true });
    expect(store.decideConsent({ analytics: false, recordings: false, marketing: false }).reloadRequired).toBe(true);
    expect(browser.jar.has("_fbp")).toBe(false);
  });
});
