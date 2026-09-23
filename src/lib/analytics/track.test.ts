import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The consent store is the only dependency, and it reads `document`; here it
 * is a switch. `window` is stubbed with just what track.ts touches.
 */
let consent = false;
vi.mock("@/lib/consent/store", () => ({
  hasAnalyticsConsent: () => consent,
}));

import { flushPendingEvents, pendingEventCount, resetPendingEvents, trackEvent, trackUntypedEvent } from "@/lib/analytics/track";

type Call = [string, string, Record<string, unknown>];

function stubWindow(pathname: string, gtag?: (...args: unknown[]) => void) {
  vi.stubGlobal("window", {
    location: { pathname },
    gtag,
  });
}

describe("trackEvent", () => {
  const calls: Call[] = [];
  const gtag = (...args: unknown[]) => {
    calls.push(args as Call);
  };

  beforeEach(() => {
    calls.length = 0;
    consent = false;
    resetPendingEvents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends nothing without consent, and keeps nothing for later", () => {
    stubWindow("/nl/diensten/bedrijfswebsite", gtag);
    trackEvent("cta_click", { cta_id: "home_hero_contact", cta_target: "contact", placement: "hero" });
    expect(calls).toEqual([]);
    expect(pendingEventCount()).toBe(0);
  });

  it("adds locale and page_type from the path and sends through gtag", () => {
    consent = true;
    stubWindow("/en/services/business-websites", gtag);
    trackEvent("service_view", { service_id: "business-websites", service_family: "websites", service_kind: "package" });
    expect(calls).toEqual([
      [
        "event",
        "service_view",
        {
          locale: "en",
          page_type: "service",
          service_id: "business-websites",
          service_family: "websites",
          service_kind: "package",
        },
      ],
    ]);
  });

  it("holds events sent after consent but before the tag exists, and hands them over when it does", () => {
    consent = true;
    stubWindow("/nl/tarieven");
    trackEvent("consent_granted", { placement: "banner" });
    trackEvent("pricing_view", { preselected_package: "none" });
    expect(pendingEventCount()).toBe(2);

    stubWindow("/nl/tarieven", gtag);
    flushPendingEvents();
    expect(calls.map((call) => call[1])).toEqual(["consent_granted", "pricing_view"]);
    expect(pendingEventCount()).toBe(0);
  });

  it("keeps held events when asked to flush before the tag exists", () => {
    consent = true;
    stubWindow("/nl");
    trackEvent("consent_granted", { placement: "banner" });
    flushPendingEvents();
    expect(pendingEventCount()).toBe(1);

    stubWindow("/nl", gtag);
    trackEvent("cta_click", { cta_id: "home_hero_contact", cta_target: "contact", placement: "hero" });
    expect(calls.map((call) => call[1])).toEqual(["consent_granted", "cta_click"]);
    expect(pendingEventCount()).toBe(0);
  });

  it("throws the held events away if consent was withdrawn before the tag arrived", () => {
    consent = true;
    stubWindow("/nl");
    trackEvent("consent_granted", { placement: "banner" });
    expect(pendingEventCount()).toBe(1);

    consent = false;
    stubWindow("/nl", gtag);
    flushPendingEvents();
    expect(calls).toEqual([]);
    expect(pendingEventCount()).toBe(0);
  });

  it("drops an event the guard refuses instead of sending part of it", () => {
    consent = true;
    stubWindow("/nl/contact", gtag);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    trackUntypedEvent("cta_click", { cta_id: "jan@example.com", cta_target: "contact", placement: "hero" });
    trackUntypedEvent("primary_cta_click", { cta_id: "x" });
    expect(calls).toEqual([]);
    warn.mockRestore();
  });

  it("forwards only registered parameters from untyped input", () => {
    consent = true;
    stubWindow("/nl/blog/artikel", gtag);
    trackUntypedEvent("article_cta_click", {
      article_slug: "artikel",
      cta_target: "service",
      placement: "article_related",
      event_label: "Bedrijfswebsite",
    });
    expect(calls).toEqual([
      [
        "event",
        "article_cta_click",
        { locale: "nl", page_type: "article", article_slug: "artikel", cta_target: "service", placement: "article_related" },
      ],
    ]);
  });
});
