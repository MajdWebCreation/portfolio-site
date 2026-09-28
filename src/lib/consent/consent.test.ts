import { describe, expect, it } from "vitest";
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  CONSENT_VERSION,
  consentCookieString,
  parseConsent,
  readCookieValue,
  serializeConsent,
  storedConsentVersion,
  type ConsentDecision,
} from "@/lib/consent/consent";

const now = new Date("2026-09-23T12:00:00.000Z");
const decidedAt = "2026-09-23T10:15:00Z";
const choice = (analytics: boolean, recordings: boolean, marketing = false, at = decidedAt, version = CONSENT_VERSION): ConsentDecision => ({
  version,
  analytics,
  recordings,
  marketing,
  decidedAt: at,
});

describe("a stored choice", () => {
  it("is version 3 since marketing became a category", () => {
    expect(CONSENT_VERSION).toBe(3);
  });

  it("round-trips every combination of the three categories", () => {
    for (const analytics of [true, false]) {
      for (const recordings of [true, false]) {
        for (const marketing of [true, false]) {
          expect(parseConsent(serializeConsent(choice(analytics, recordings, marketing)), now)).toEqual(choice(analytics, recordings, marketing));
        }
      }
    }
  });

  it("is the version, three flags and the moment, nothing more", () => {
    expect(serializeConsent(choice(true, false))).toBe("3.a1.r0.m0.2026-09-23T10:15:00Z");
    expect(serializeConsent(choice(false, true))).toBe("3.a0.r1.m0.2026-09-23T10:15:00Z");
    expect(serializeConsent(choice(false, false, true))).toBe("3.a0.r0.m1.2026-09-23T10:15:00Z");
    expect(serializeConsent(choice(true, true, true))).toBe("3.a1.r1.m1.2026-09-23T10:15:00Z");
  });

  it("reads analytics, recordings and marketing separately", () => {
    expect(parseConsent("3.a1.r0.m0.2026-09-23T10:15:00Z", now)).toMatchObject({ analytics: true, recordings: false, marketing: false });
    expect(parseConsent("3.a0.r1.m0.2026-09-23T10:15:00Z", now)).toMatchObject({ analytics: false, recordings: true, marketing: false });
    expect(parseConsent("3.a0.r0.m1.2026-09-23T10:15:00Z", now)).toMatchObject({ analytics: false, recordings: false, marketing: true });
  });

  it("writes the moment to the second, in UTC", () => {
    expect(serializeConsent(choice(true, false, false, "2026-09-23T12:15:00.789+02:00"))).toBe("3.a1.r0.m0.2026-09-23T10:15:00Z");
  });

  /* Recordings and marketing were each a new processing: every older choice is asked again, including a yes to analytics. */
  it("asks again for a version-1 or version-2 choice, which it still recognises as one", () => {
    for (const legacy of ["1.a1.2026-09-23T10:15:00Z", "1.a0.2026-09-23T10:15:00Z"]) {
      expect(storedConsentVersion(legacy)).toBe(1);
      expect(parseConsent(legacy, now)).toBeNull();
    }
    for (const legacy of ["2.a1.r1.2026-09-23T10:15:00Z", "2.a0.r0.2026-09-23T10:15:00Z"]) {
      expect(storedConsentVersion(legacy)).toBe(2);
      expect(parseConsent(legacy, now)).toBeNull();
    }
    expect(storedConsentVersion("3.a1.r1.m1.2026-09-23T10:15:00Z")).toBe(3);
    expect(storedConsentVersion("garbage")).toBeNull();
  });

  it("counts as no choice once the schema moves on", () => {
    expect(parseConsent(serializeConsent(choice(true, true, true, decidedAt, CONSENT_VERSION + 1)), now)).toBeNull();
    expect(parseConsent("2.a1.r1.m1.2026-09-23T10:15:00Z", now)).toBeNull();
  });

  /* The values from before the moment was recorded: ask again. */
  it("counts a legacy value without a moment as no choice", () => {
    expect(parseConsent("3.a1.r1.m1", now)).toBeNull();
    expect(parseConsent("1.a1", now)).toBeNull();
    expect(parseConsent("1.a0", now)).toBeNull();
  });

  it("counts as no choice when absent or garbled", () => {
    for (const value of [
      undefined,
      null,
      "",
      "3",
      "a1",
      "3.a1.2026-09-23T10:15:00Z",
      "3.a1.r0.2026-09-23T10:15:00Z",
      "3.a2.r0.m0.2026-09-23T10:15:00Z",
      "3.a1.r2.m0.2026-09-23T10:15:00Z",
      "3.a1.r0.m2.2026-09-23T10:15:00Z",
      "3.a1.x1.m0.2026-09-23T10:15:00Z",
      "3.m1.r1.a1.2026-09-23T10:15:00Z",
      "x.a1.r0.m0.2026-09-23T10:15:00Z",
      "3.a1.r0.m0.2026-09-23",
      "3.a1.r0.m0.2026-09-23T10:15:00.000Z",
      "3.a1.r0.m0.2026-13-45T10:15:00Z",
      "3.a1.r0.m0.2026-09-23T10:15:00Z.extra",
      "true",
    ]) {
      expect(parseConsent(value, now), String(value)).toBeNull();
    }
  });

  /* A browser that kept the cookie past its Max-Age has not extended the consent. */
  it("counts as no choice once older than six months", () => {
    const limit = new Date(now.getTime() - CONSENT_MAX_AGE_SECONDS * 1000);
    const justInside = new Date(limit.getTime() + 60 * 1000).toISOString();
    const justOutside = new Date(limit.getTime() - 60 * 1000).toISOString();

    expect(parseConsent(serializeConsent(choice(true, true, true, justInside)), now)).not.toBeNull();
    expect(parseConsent(serializeConsent(choice(true, true, true, justOutside)), now)).toBeNull();
  });

  it("counts a choice from the future as no choice", () => {
    const later = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    expect(parseConsent(serializeConsent(choice(false, true, true, later)), now)).toBeNull();
  });
});

describe("the cookie itself", () => {
  it("is first-party, site-wide, lax and six months long", () => {
    const cookie = consentCookieString(choice(false, true), { secure: true });

    expect(cookie).toBe(
      `${CONSENT_COOKIE}=${encodeURIComponent("3.a0.r1.m0.2026-09-23T10:15:00Z")}; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax; Secure`,
    );
    expect(CONSENT_MAX_AGE_SECONDS).toBe(182 * 24 * 60 * 60);
  });

  it("drops Secure only where there is no https to secure it", () => {
    expect(consentCookieString(choice(true, false), { secure: false })).not.toContain("Secure");
  });

  it("is found among other cookies, decoded, and left alone when absent", () => {
    const encoded = encodeURIComponent("3.a1.r0.m0.2026-09-23T10:15:00Z");
    expect(readCookieValue(`_ga=GA1.1.1; ${CONSENT_COOKIE}=${encoded}; other=x`, CONSENT_COOKIE)).toBe("3.a1.r0.m0.2026-09-23T10:15:00Z");
    expect(readCookieValue("_ga=GA1.1.1", CONSENT_COOKIE)).toBeUndefined();
    expect(readCookieValue("", CONSENT_COOKIE)).toBeUndefined();
  });
});
