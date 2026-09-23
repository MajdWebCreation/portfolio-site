import { describe, expect, it } from "vitest";
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  CONSENT_VERSION,
  consentCookieString,
  parseConsent,
  readCookieValue,
  serializeConsent,
} from "@/lib/consent/consent";

const now = new Date("2026-09-23T12:00:00.000Z");
const decidedAt = "2026-09-23T10:15:00Z";

describe("a stored choice", () => {
  it("round-trips through the cookie value", () => {
    for (const analytics of [true, false]) {
      const value = serializeConsent({ version: CONSENT_VERSION, analytics, decidedAt });
      expect(parseConsent(value, now)).toEqual({ version: CONSENT_VERSION, analytics, decidedAt });
    }
  });

  it("is the version, one flag and the moment, nothing more", () => {
    expect(serializeConsent({ version: 1, analytics: true, decidedAt })).toBe("1.a1.2026-09-23T10:15:00Z");
    expect(serializeConsent({ version: 1, analytics: false, decidedAt })).toBe("1.a0.2026-09-23T10:15:00Z");
  });

  it("writes the moment to the second, in UTC", () => {
    expect(serializeConsent({ version: 1, analytics: true, decidedAt: "2026-09-23T12:15:00.789+02:00" })).toBe(
      "1.a1.2026-09-23T10:15:00Z",
    );
  });

  /* Raising the version is how a material change asks everyone again. */
  it("counts as no choice once the schema moves on", () => {
    expect(parseConsent(serializeConsent({ version: CONSENT_VERSION - 1, analytics: true, decidedAt }), now)).toBeNull();
    expect(parseConsent(serializeConsent({ version: CONSENT_VERSION + 1, analytics: true, decidedAt }), now)).toBeNull();
  });

  /* The values from before the moment was recorded: ask again. */
  it("counts a legacy value without a moment as no choice", () => {
    expect(parseConsent("1.a1", now)).toBeNull();
    expect(parseConsent("1.a0", now)).toBeNull();
  });

  it("counts as no choice when absent or garbled", () => {
    for (const value of [
      undefined,
      null,
      "",
      "1",
      "a1",
      "1.a2.2026-09-23T10:15:00Z",
      "x.a1.2026-09-23T10:15:00Z",
      "1.a1.2026-09-23",
      "1.a1.2026-09-23T10:15:00.000Z",
      "1.a1.2026-13-45T10:15:00Z",
      "1.a1.2026-09-23T10:15:00Z.extra",
      "true",
    ]) {
      expect(parseConsent(value, now)).toBeNull();
    }
  });

  /* A browser that kept the cookie past its Max-Age has not extended the consent. */
  it("counts as no choice once older than six months", () => {
    const limit = new Date(now.getTime() - CONSENT_MAX_AGE_SECONDS * 1000);
    const justInside = new Date(limit.getTime() + 60 * 1000).toISOString();
    const justOutside = new Date(limit.getTime() - 60 * 1000).toISOString();

    expect(parseConsent(serializeConsent({ version: 1, analytics: true, decidedAt: justInside }), now)).not.toBeNull();
    expect(parseConsent(serializeConsent({ version: 1, analytics: true, decidedAt: justOutside }), now)).toBeNull();
  });

  it("counts a choice from the future as no choice", () => {
    const later = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    expect(parseConsent(serializeConsent({ version: 1, analytics: true, decidedAt: later }), now)).toBeNull();
  });
});

describe("the cookie itself", () => {
  it("is first-party, site-wide, lax and six months long", () => {
    const cookie = consentCookieString({ version: 1, analytics: false, decidedAt }, { secure: true });

    expect(cookie).toBe(
      `${CONSENT_COOKIE}=${encodeURIComponent("1.a0.2026-09-23T10:15:00Z")}; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax; Secure`,
    );
    expect(CONSENT_MAX_AGE_SECONDS).toBe(182 * 24 * 60 * 60);
  });

  it("drops Secure only where there is no https to secure it", () => {
    expect(consentCookieString({ version: 1, analytics: true, decidedAt }, { secure: false })).not.toContain("Secure");
  });

  it("is found among other cookies, decoded, and left alone when absent", () => {
    const encoded = encodeURIComponent("1.a1.2026-09-23T10:15:00Z");
    expect(readCookieValue(`_ga=GA1.1.1; ${CONSENT_COOKIE}=${encoded}; other=x`, CONSENT_COOKIE)).toBe("1.a1.2026-09-23T10:15:00Z");
    expect(readCookieValue("_ga=GA1.1.1", CONSENT_COOKIE)).toBeUndefined();
    expect(readCookieValue("", CONSENT_COOKIE)).toBeUndefined();
  });
});
