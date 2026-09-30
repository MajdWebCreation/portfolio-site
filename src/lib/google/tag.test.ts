import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adsConversionTarget,
  deniedGoogleConsent,
  googleAdsConsentGranted,
  googleConsentFor,
  googleTagAllowed,
  normalizeAdsId,
  normalizeConversionLabel,
  normalizeMeasurementId,
  resetGoogleTag,
  stripAdClickIds,
  syncGooglePage,
  syncGoogleTag,
  type GoogleTagConfig,
} from "@/lib/google/tag";

/* A stand-in page: a window with a data layer, a document with a head. */
function fakePage(href = "https://ymcreations.com/nl/tarieven") {
  const scripts: Array<{ id: string; src: string; async: boolean }> = [];
  const win = { location: { href } } as Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };
  const doc = {
    getElementById: (id: string) => scripts.find((script) => script.id === id) ?? null,
    createElement: () => ({ id: "", src: "", async: false, addEventListener: () => {} }),
    head: { appendChild: (node: { id: string; src: string; async: boolean }) => scripts.push(node) },
  } as unknown as Document;
  const commands = () => (win.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>));
  return { win, doc, scripts, commands };
}

const both: GoogleTagConfig = { measurementId: "G-ABC123DEF4", adsId: "AW-123456789", labels: {} };

beforeEach(() => {
  resetGoogleTag();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("configuration", () => {
  it("accepts only IDs and labels in Google's shapes", () => {
    expect(normalizeMeasurementId(" G-ABC123DEF4 ")).toBe("G-ABC123DEF4");
    expect(normalizeMeasurementId("UA-1234-1")).toBeUndefined();
    expect(normalizeAdsId("AW-123456789")).toBe("AW-123456789");
    expect(normalizeAdsId("123456789")).toBeUndefined();
    expect(normalizeAdsId(undefined)).toBeUndefined();
    expect(normalizeConversionLabel("AbC_12-xyz")).toBe("AbC_12-xyz");
    expect(normalizeConversionLabel("a b")).toBeUndefined();
  });

  it("builds a conversion target only when both the Ads ID and the label exist", () => {
    expect(adsConversionTarget({ ...both, labels: { lead: "LeadLabel1" } }, "lead")).toBe("AW-123456789/LeadLabel1");
    expect(adsConversionTarget({ ...both, labels: {} }, "lead")).toBeNull();
    expect(adsConversionTarget({ labels: { lead: "LeadLabel1" } }, "lead")).toBeNull();
  });
});

describe("Consent Mode v2 signals", () => {
  it("are all denied without a choice", () => {
    expect(googleConsentFor(null)).toEqual(deniedGoogleConsent);
    expect(Object.values(deniedGoogleConsent)).toEqual(["denied", "denied", "denied", "denied"]);
  });

  it("map statistics to analytics storage and marketing to the three ad signals", () => {
    expect(googleConsentFor({ analytics: true, marketing: false })).toEqual({
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    expect(googleConsentFor({ analytics: false, marketing: true })).toEqual({
      analytics_storage: "denied",
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
    });
  });

  it("need a configured destination for the category that was allowed", () => {
    expect(googleTagAllowed(both, null)).toBe(false);
    expect(googleTagAllowed({ adsId: "AW-123456789", labels: {} }, { analytics: true, marketing: false })).toBe(false);
    expect(googleTagAllowed({ measurementId: "G-ABC123DEF4", labels: {} }, { analytics: false, marketing: true })).toBe(false);
    expect(googleTagAllowed(both, { analytics: false, marketing: true })).toBe(true);
  });
});

describe("syncGoogleTag", () => {
  it("creates nothing before a choice: no data layer, no script", () => {
    const page = fakePage();
    syncGoogleTag({ config: both, choice: null, win: page.win, doc: page.doc });
    syncGoogleTag({ config: both, choice: { analytics: false, marketing: false }, win: page.win, doc: page.doc });
    expect(page.win.dataLayer).toBeUndefined();
    expect(page.win.gtag).toBeUndefined();
    expect(page.scripts).toEqual([]);
  });

  it("sets the denied default first, then the choice, then configures only what was allowed", () => {
    const page = fakePage();
    syncGoogleTag({ config: both, choice: { analytics: true, marketing: false }, win: page.win, doc: page.doc });

    const commands = page.commands();
    expect(commands[0]).toEqual(["consent", "default", deniedGoogleConsent]);
    expect(commands[1]).toEqual(["consent", "update", googleConsentFor({ analytics: true, marketing: false })]);
    expect(commands[2]).toEqual(["set", "ads_data_redaction", true]);
    expect(commands[3][0]).toBe("js");
    expect(commands[4]).toEqual(["config", "G-ABC123DEF4", { cookie_expires: 90 * 24 * 60 * 60, cookie_update: false }]);
    expect(commands.some((command) => command[0] === "config" && command[1] === "AW-123456789")).toBe(false);
    expect(page.scripts).toHaveLength(1);
    expect(page.scripts[0].src).toBe("https://www.googletagmanager.com/gtag/js?id=G-ABC123DEF4");
  });

  it("updates consent and adds Ads when marketing is granted later, without a second script", () => {
    const page = fakePage();
    syncGoogleTag({ config: both, choice: { analytics: true, marketing: false }, win: page.win, doc: page.doc });
    const before = page.commands().length;

    syncGoogleTag({ config: both, choice: { analytics: true, marketing: true }, win: page.win, doc: page.doc });
    const added = page.commands().slice(before);

    expect(added).toEqual([
      ["consent", "update", googleConsentFor({ analytics: true, marketing: true })],
      ["set", "ads_data_redaction", false],
      ["config", "AW-123456789"],
    ]);
    expect(page.scripts).toHaveLength(1);
  });

  it("sends nothing new when the same choice is synced again", () => {
    const page = fakePage();
    const choice = { analytics: true, marketing: true };
    syncGoogleTag({ config: both, choice, win: page.win, doc: page.doc });
    const count = page.commands().length;
    syncGoogleTag({ config: both, choice, win: page.win, doc: page.doc });
    expect(page.commands()).toHaveLength(count);
  });

  it("tells Google about a withdrawal in the same page", () => {
    const page = fakePage();
    syncGoogleTag({ config: both, choice: { analytics: true, marketing: true }, win: page.win, doc: page.doc });
    syncGoogleTag({ config: both, choice: { analytics: false, marketing: false }, win: page.win, doc: page.doc });
    expect(page.commands().at(-2)).toEqual(["consent", "update", deniedGoogleConsent]);
  });

  it("starts with Ads alone for marketing when there is no GA property", () => {
    const page = fakePage();
    syncGoogleTag({
      config: { adsId: "AW-123456789", labels: {} },
      choice: { analytics: false, marketing: true },
      win: page.win,
      doc: page.doc,
    });
    expect(page.scripts[0].src).toBe("https://www.googletagmanager.com/gtag/js?id=AW-123456789");
  });

  it("in a dry run queues every command but never loads gtag.js", () => {
    vi.stubEnv("NEXT_PUBLIC_TRACKING_DRY_RUN", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const page = fakePage();
    syncGoogleTag({ config: both, choice: { analytics: true, marketing: true }, win: page.win, doc: page.doc });
    expect(page.commands().length).toBeGreaterThan(4);
    expect(page.scripts).toEqual([]);
    info.mockRestore();
  });
});

describe("ad click identifiers and Google Analytics", () => {
  const paid = "https://ymcreations.com/nl/diensten/website-laten-maken?utm_source=google&utm_medium=cpc&utm_campaign=1&utm_term=website%20laten%20maken&gclid=Cj0abc&gbraid=1x&wbraid=2y";
  const clean = "https://ymcreations.com/nl/diensten/website-laten-maken?utm_source=google&utm_medium=cpc&utm_campaign=1&utm_term=website+laten+maken";
  const gaConfigAt = (page: ReturnType<typeof fakePage>) => page.commands().findIndex((command) => command[0] === "config" && command[1] === "G-ABC123DEF4");
  const sets = (page: ReturnType<typeof fakePage>) => page.commands().filter((command) => command[0] === "set" && typeof command[1] === "object");
  const navigate = (page: ReturnType<typeof fakePage>, href: string, choice: { analytics: boolean; marketing: boolean }) => {
    (page.win.location as { href: string }).href = href;
    syncGooglePage({ choice, win: page.win });
  };

  it("stripAdClickIds removes Google's click ids and nothing else", () => {
    expect(stripAdClickIds(paid)).toBe(clean);
    expect(stripAdClickIds("https://ymcreations.com/nl?dclid=1&gclsrc=aw.ds&x=1")).toBe("https://ymcreations.com/nl?x=1");
    expect(stripAdClickIds("https://ymcreations.com/nl/contact")).toBe("https://ymcreations.com/nl/contact");
    expect(stripAdClickIds("https://ymcreations.com/nl?utm_source=google#top")).toBe("https://ymcreations.com/nl?utm_source=google#top");
    expect(stripAdClickIds("not a url")).toBe("not a url");
  });

  it("with statistics only, GA is told the address minus the click ids before its config; the address bar is untouched", () => {
    const page = fakePage(paid);
    syncGoogleTag({ config: both, choice: { analytics: true, marketing: false }, win: page.win, doc: page.doc });
    const commands = page.commands();
    const at = gaConfigAt(page);
    expect(commands[at - 1]).toEqual(["set", { page_location: clean }]);
    expect(commands[at][2]).toEqual({ cookie_expires: 90 * 24 * 60 * 60, cookie_update: false });
    expect(page.win.location.href).toBe(paid);
    expect(commands.some((command) => command[0] === "config" && command[1] === "AW-123456789")).toBe(false);
  });

  it("keeps the address and the referrer in step on client-side navigation, both without click ids", () => {
    const page = fakePage(paid);
    const choice = { analytics: true, marketing: false };
    syncGoogleTag({ config: both, choice, win: page.win, doc: page.doc });
    navigate(page, "https://ymcreations.com/nl/werkwijze", choice);
    navigate(page, "https://ymcreations.com/nl/werkwijze", choice);
    navigate(page, "https://ymcreations.com/nl/contact", choice);
    expect(sets(page)).toEqual([
      ["set", { page_location: clean }],
      ["set", { page_location: "https://ymcreations.com/nl/werkwijze", page_referrer: clean }],
      ["set", { page_location: "https://ymcreations.com/nl/contact", page_referrer: "https://ymcreations.com/nl/werkwijze" }],
    ]);
    expect(JSON.stringify(page.commands())).not.toContain("gclid");
  });

  it("with statistics and marketing, nothing is set and GA is configured exactly as before", () => {
    const page = fakePage(paid);
    const choice = { analytics: true, marketing: true };
    syncGoogleTag({ config: both, choice, win: page.win, doc: page.doc });
    navigate(page, "https://ymcreations.com/nl/werkwijze", choice);
    navigate(page, "https://ymcreations.com/nl/contact", choice);
    expect(sets(page)).toEqual([]);
    expect(page.commands()[gaConfigAt(page)][2]).toEqual({ cookie_expires: 90 * 24 * 60 * 60, cookie_update: false });
    expect(page.commands().some((command) => command[0] === "config" && command[1] === "AW-123456789")).toBe(true);
  });

  it("touches nothing for a statistics-only visit whose address carries no click id", () => {
    const page = fakePage("https://ymcreations.com/nl/contact?utm_source=newsletter&utm_medium=email");
    const choice = { analytics: true, marketing: false };
    syncGoogleTag({ config: both, choice, win: page.win, doc: page.doc });
    navigate(page, "https://ymcreations.com/nl/tarieven", choice);
    expect(sets(page)).toEqual([]);
  });

  it("keeps telling GA the current address after marketing is granted later in the same page", () => {
    const page = fakePage(paid);
    syncGoogleTag({ config: both, choice: { analytics: true, marketing: false }, win: page.win, doc: page.doc });
    syncGoogleTag({ config: both, choice: { analytics: true, marketing: true }, win: page.win, doc: page.doc });
    navigate(page, "https://ymcreations.com/nl/contact", { analytics: true, marketing: true });
    expect(sets(page)).toEqual([
      ["set", { page_location: clean }],
      ["set", { page_location: "https://ymcreations.com/nl/contact", page_referrer: paid }],
    ]);
    expect(page.commands().filter((command) => command[0] === "config" && command[1] === "G-ABC123DEF4")).toHaveLength(1);
  });

  it("does nothing before the tag runs or without statistics", () => {
    const page = fakePage(paid);
    syncGooglePage({ choice: { analytics: true, marketing: false }, win: page.win });
    expect(page.win.dataLayer).toBeUndefined();
    syncGoogleTag({ config: both, choice: { analytics: false, marketing: true }, win: page.win, doc: page.doc });
    navigate(page, "https://ymcreations.com/nl/contact", { analytics: false, marketing: true });
    expect(sets(page)).toEqual([]);
  });
});

describe("googleAdsConsentGranted", () => {
  it("is true only while the tag was told ad_storage and ad_user_data are granted", () => {
    const page = fakePage();
    expect(googleAdsConsentGranted()).toBe(false);

    syncGoogleTag({ config: both, choice: { analytics: true, marketing: false }, win: page.win, doc: page.doc });
    expect(googleAdsConsentGranted()).toBe(false);

    syncGoogleTag({ config: both, choice: { analytics: true, marketing: true }, win: page.win, doc: page.doc });
    expect(googleAdsConsentGranted()).toBe(true);

    syncGoogleTag({ config: both, choice: { analytics: true, marketing: false }, win: page.win, doc: page.doc });
    expect(googleAdsConsentGranted()).toBe(false);
  });
});
