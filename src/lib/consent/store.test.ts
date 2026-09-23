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
  };
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  return { jar, window, clarityCalls };
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
  it("asks again for a version-1 choice", async () => {
    fakeBrowser({ [CONSENT_COOKIE]: encodeURIComponent(`1.a1.${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}`) });
    const store = await freshStore();
    store.hydrateConsent();
    expect(store.hasAnalyticsConsent()).toBe(false);
    expect(store.hasRecordingsConsent()).toBe(false);
  });

  it.each([
    ["necessary only", false, false],
    ["statistics only", true, false],
    ["recordings only", false, true],
    ["everything", true, true],
  ] as const)("%s: GA %s, Clarity %s, nothing implied", async (_label, analytics, recordings) => {
    const browser = fakeBrowser();
    const store = await freshStore();
    store.hydrateConsent();
    const result = store.decideConsent({ analytics, recordings });

    expect(store.hasAnalyticsConsent()).toBe(analytics);
    expect(store.hasRecordingsConsent()).toBe(recordings);
    expect(clarityWouldLoad(store.hasRecordingsConsent())).toBe(recordings);
    expect(result.reloadRequired).toBe(false);
    expect(readCookieValue(document.cookie, CONSENT_COOKIE)).toMatch(new RegExp(`^2\\.a${analytics ? 1 : 0}\\.r${recordings ? 1 : 0}\\.`));
    expect(browser.clarityCalls).toEqual([]);
  });
});

describe("withdrawing recordings", () => {
  it("stops Clarity, clears its cookies, asks for a reload, and leaves GA running", async () => {
    const browser = fakeBrowser({ _clck: "id|1", _clsk: "s|1", _ga: "GA1.1.1" });
    const store = await freshStore();
    store.hydrateConsent();
    store.decideConsent({ analytics: true, recordings: true });

    const result = store.decideConsent({ analytics: true, recordings: false });

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
    store.decideConsent({ analytics: false, recordings: true });
    expect(store.decideConsent({ analytics: false, recordings: false }).reloadRequired).toBe(true);
    expect(browser.jar.has("_clck")).toBe(false);
  });
});

describe("withdrawing analytics", () => {
  it("stops GA and clears its cookies, and keeps Clarity when recordings stay on", async () => {
    const browser = fakeBrowser({ _ga: "GA1.1.1", _ga_TEST123: "x", _clck: "id|1" });
    const store = await freshStore();
    store.hydrateConsent();
    store.decideConsent({ analytics: true, recordings: true });

    const result = store.decideConsent({ analytics: false, recordings: true });

    expect(result.reloadRequired).toBe(false);
    expect(browser.window[`ga-disable-${GA_ID}`]).toBe(true);
    expect(browser.jar.has("_ga")).toBe(false);
    expect(browser.jar.has("_ga_TEST123")).toBe(false);
    expect(browser.jar.has("_clck")).toBe(true);
    expect(browser.clarityCalls).toEqual([]);
    expect(clarityWouldLoad(store.hasRecordingsConsent())).toBe(true);
  });
});
