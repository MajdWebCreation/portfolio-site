import { afterEach, describe, expect, it, vi } from "vitest";
import { CONSENT_COOKIE, CONSENT_VERSION, serializeConsent } from "@/lib/consent/consent";

/*
  The Meta Pixel against a small stand-in browser: a document that records
  the script elements it is given and a cookie jar, a location, and no fbq
  until the module installs one. What reaches Meta is read off the stub's
  queue, which is exactly what fbevents.js would replay once it loads.
*/
const PIXEL = "1119790594057101";

type Queued = unknown[];

function fakeBrowser({ marketing, path = "/nl" }: { marketing: boolean | null; path?: string }) {
  const scripts: { id: string; src: string; async: boolean }[] = [];
  const jar = new Map<string, string>();
  if (marketing !== null) {
    const decidedAt = new Date().toISOString();
    jar.set(CONSENT_COOKIE, encodeURIComponent(serializeConsent({ version: CONSENT_VERSION, analytics: false, recordings: false, marketing, decidedAt })));
  }
  const document = {
    get cookie() {
      return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
    },
    set cookie(raw: string) {
      const [pair] = raw.split(";");
      const [name, ...rest] = pair.split("=");
      jar.set(name.trim(), rest.join("="));
    },
    createElement: () => ({ id: "", src: "", async: false }),
    getElementById: (id: string) => scripts.find((script) => script.id === id) ?? null,
    head: { appendChild: (element: { id: string; src: string; async: boolean }) => scripts.push(element) },
  };
  const window: Record<string, unknown> = { location: { pathname: path, protocol: "https:", hostname: "www.ymcreations.com" } };
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);

  return {
    scripts,
    window,
    navigate(next: string) {
      (window.location as { pathname: string }).pathname = next;
    },
    /** Everything handed to fbq so far. */
    calls(): Queued[] {
      const fbq = window.fbq as { queue: Queued[] } | undefined;
      return fbq ? fbq.queue : [];
    },
    events(name: string): Queued[] {
      return this.calls().filter((call) => call[0] === "track" && call[1] === name);
    },
  };
}

async function freshModules() {
  vi.resetModules();
  const store = await import("@/lib/consent/store");
  const pixel = await import("@/lib/meta/pixel");
  const track = await import("@/lib/meta/track");
  store.hydrateConsent();
  return { store, pixel, track };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
});

const leadId = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("the pixel id", () => {
  it("is read from NEXT_PUBLIC_META_PIXEL_ID and must be a plain number", async () => {
    const { pixel } = await freshModules();
    expect(pixel.metaPixelId()).toBeUndefined();
    process.env.NEXT_PUBLIC_META_PIXEL_ID = ` ${PIXEL} `;
    expect(pixel.metaPixelId()).toBe(PIXEL);
    for (const bad of ["", "abc", "123", "1119790594057101');alert(1)//"]) expect(pixel.normalizeMetaPixelId(bad)).toBeUndefined();
  });
});

describe("without a yes to marketing", () => {
  it.each([
    ["no choice yet", null],
    ["marketing refused", false],
  ] as const)("%s: no fbq, no script, no PageView, no Lead", async (_label, marketing) => {
    const browser = fakeBrowser({ marketing });
    const { store, pixel, track } = await freshModules();

    pixel.syncMetaPixel({ pixelId: PIXEL, marketingConsent: store.hasMarketingConsent(), pathname: "/nl" });
    pixel.syncMetaPixel({ pixelId: PIXEL, marketingConsent: store.hasMarketingConsent(), pathname: "/nl/tarieven" });

    expect(track.trackMetaLead({ form: "contact", eventId: leadId })).toBe(false);
    expect(browser.window.fbq).toBeUndefined();
    expect(browser.scripts).toEqual([]);
  });

  it("starts nothing without a configured pixel, even with consent", async () => {
    const browser = fakeBrowser({ marketing: true });
    const { pixel } = await freshModules();
    pixel.syncMetaPixel({ pixelId: undefined, marketingConsent: true, pathname: "/nl" });
    expect(browser.window.fbq).toBeUndefined();
    expect(browser.scripts).toEqual([]);
  });
});

describe("with a yes to marketing", () => {
  it("loads the library once, initialises once without user data, and sends one PageView", async () => {
    const browser = fakeBrowser({ marketing: true });
    const { pixel } = await freshModules();

    /* Re-renders and React's development double effects call it again with the same input. */
    for (let render = 0; render < 3; render++) pixel.syncMetaPixel({ pixelId: PIXEL, marketingConsent: true, pathname: "/nl" });

    expect(browser.scripts).toEqual([{ id: pixel.META_PIXEL_SCRIPT_ID, src: "https://connect.facebook.net/en_US/fbevents.js", async: true }]);
    expect(browser.calls()).toEqual([
      ["set", "autoConfig", false, PIXEL],
      ["init", PIXEL],
      ["track", "PageView"],
    ]);
    const fbq = browser.window.fbq as { disablePushState?: boolean; allowDuplicatePageViews?: boolean };
    expect([fbq.disablePushState, fbq.allowDuplicatePageViews]).toEqual([true, true]);
  });

  it("starts when consent arrives later in the visit, without a reload", async () => {
    const browser = fakeBrowser({ marketing: null });
    const { pixel } = await freshModules();

    pixel.syncMetaPixel({ pixelId: PIXEL, marketingConsent: false, pathname: "/nl/websitecheck" });
    expect(browser.window.fbq).toBeUndefined();

    pixel.syncMetaPixel({ pixelId: PIXEL, marketingConsent: true, pathname: "/nl/websitecheck" });
    expect(browser.scripts).toHaveLength(1);
    expect(browser.events("PageView")).toHaveLength(1);
  });

  it("sends one PageView per client-side navigation to another path, never two for one", async () => {
    const browser = fakeBrowser({ marketing: true });
    const { pixel } = await freshModules();
    const visit = (pathname: string) => pixel.syncMetaPixel({ pixelId: PIXEL, marketingConsent: true, pathname });

    visit("/nl");
    visit("/nl/tarieven");
    visit("/nl/tarieven");
    visit("/nl/contact");
    visit("/nl");

    expect(browser.events("PageView")).toHaveLength(4);
    expect(browser.calls().filter((call) => call[0] === "init")).toHaveLength(1);
    expect(browser.scripts).toHaveLength(1);
  });

  it("stays off on the admin, direct-debit and payment routes, and counts the page after them again", async () => {
    const browser = fakeBrowser({ marketing: true, path: "/nl/incasso/abc123token" });
    const { pixel } = await freshModules();
    const visit = (pathname: string) => pixel.syncMetaPixel({ pixelId: PIXEL, marketingConsent: true, pathname });

    visit("/nl/incasso/abc123token");
    visit("/nl/betaling/afgerond");
    expect(browser.window.fbq).toBeUndefined();
    expect(browser.scripts).toEqual([]);

    visit("/nl");
    visit("/nl/betaling/afgerond");
    visit("/nl");
    expect(browser.events("PageView")).toHaveLength(2);
    expect(pixel.metaPixelAllowedOnPath("/admin/analytics")).toBe(false);
  });
});

describe("a Lead", () => {
  it("is sent once for an accepted inquiry, with its event id and the form as the only parameter", async () => {
    const browser = fakeBrowser({ marketing: true, path: "/nl/websitecheck" });
    const { pixel, track } = await freshModules();
    pixel.syncMetaPixel({ pixelId: PIXEL, marketingConsent: true, pathname: "/nl/websitecheck" });

    expect(track.trackMetaLead({ form: "websitecheck", eventId: leadId })).toBe(true);
    /* A second report of the same inquiry (a double handler, a re-render) is not a second lead. */
    expect(track.trackMetaLead({ form: "websitecheck", eventId: leadId })).toBe(false);

    expect(browser.events("Lead")).toEqual([["track", "Lead", { content_name: "websitecheck" }, { eventID: leadId }]]);
  });

  it("is two leads for two accepted inquiries", async () => {
    const browser = fakeBrowser({ marketing: true, path: "/nl/contact" });
    const { pixel, track } = await freshModules();
    pixel.syncMetaPixel({ pixelId: PIXEL, marketingConsent: true, pathname: "/nl/contact" });

    track.trackMetaLead({ form: "contact", eventId: leadId });
    track.trackMetaLead({ form: "contact", eventId: "7c9e6679-7425-40de-944b-e07fc1f90ae7" });
    expect(browser.events("Lead")).toHaveLength(2);
  });

  it.each([
    ["no event id (the honeypot's answer, or a failure)", undefined],
    ["an event id that is not one", "lead-1"],
    ["something that is not a string", { id: leadId }],
  ])("is not sent for %s", async (_label, eventId) => {
    const browser = fakeBrowser({ marketing: true, path: "/nl/contact" });
    const { pixel, track } = await freshModules();
    pixel.syncMetaPixel({ pixelId: PIXEL, marketingConsent: true, pathname: "/nl/contact" });

    expect(track.trackMetaLead({ form: "contact", eventId })).toBe(false);
    expect(browser.events("Lead")).toEqual([]);
  });

  it("is not sent, and starts nothing, when the pixel is not running", async () => {
    const browser = fakeBrowser({ marketing: true, path: "/nl/contact" });
    const { track } = await freshModules();

    expect(track.trackMetaLead({ form: "project_planner", eventId: leadId })).toBe(false);
    expect(browser.window.fbq).toBeUndefined();
    expect(browser.scripts).toEqual([]);
  });

  it("never throws into the form when the pixel does", async () => {
    const browser = fakeBrowser({ marketing: true, path: "/nl/contact" });
    const { pixel, track } = await freshModules();
    pixel.syncMetaPixel({ pixelId: PIXEL, marketingConsent: true, pathname: "/nl/contact" });
    (browser.window.fbq as { callMethod?: () => void }).callMethod = () => {
      throw new Error("pixel broke");
    };

    expect(() => track.trackMetaLead({ form: "contact", eventId: leadId })).not.toThrow();
  });
});

describe("withdrawal", () => {
  it("revokes, expires the cookies and removes the library's localStorage entries, nothing else", async () => {
    const browser = fakeBrowser({ marketing: true, path: "/nl" });
    const storage = new Map([
      ["lastExternalReferrer", "empty"],
      ["lastExternalReferrerTime", "1790730738907"],
      ["ym:tracking-debug", "1"],
      ["_gcl_ls", "{}"],
    ]);
    browser.window.localStorage = { removeItem: (key: string) => void storage.delete(key), getItem: (key: string) => storage.get(key) ?? null };
    document.cookie = "_fbp=fb.1.1.1";
    document.cookie = "_fbc=fb.1.1.abc";
    const { pixel } = await freshModules();
    pixel.syncMetaPixel({ pixelId: PIXEL, marketingConsent: true, pathname: "/nl" });

    pixel.withdrawMetaPixel();

    expect(browser.calls().some((call) => call[0] === "consent" && call[1] === "revoke")).toBe(true);
    expect([...storage.keys()].sort()).toEqual(["_gcl_ls", "ym:tracking-debug"]);
  });

  it("does not fail when storage is refused or the pixel never ran", async () => {
    const browser = fakeBrowser({ marketing: false, path: "/nl" });
    browser.window.localStorage = {
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    const { pixel } = await freshModules();
    expect(() => pixel.withdrawMetaPixel()).not.toThrow();
  });
});
