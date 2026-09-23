/**
 * The visitor's cookie choice, as a value.
 *
 * Three categories exist on the public site. "Necessary" is what the site
 * needs to work and asks nothing for; on the public pages that is currently
 * nothing at all beyond this cookie -- the admin's session cookies live
 * behind a login and are outside this choice. "Analytics" is Google
 * Analytics. "Recordings" (gedragsopnames) is Microsoft Clarity: heatmaps and
 * reconstructed session recordings. Both are off until the visitor turns
 * them on, and each is its own choice: one never implies the other.
 *
 * Three things are remembered, and nothing else: the schema version the
 * choice was given under, the choice itself, and the moment it was made. The
 * moment is the record that a choice was made and when -- what a cookie
 * choice has to be able to show -- and is the only thing in the value that
 * differs between two visitors who chose the same. No identifier, no address,
 * no fingerprint; the cookie cannot say who chose, only that and when.
 *
 * The version is the re-consent switch. Raise `CONSENT_VERSION` when what the
 * choice covers changes materially (a new category, a new recipient), and
 * every stored choice parses as "no choice yet", so the card asks again.
 * Version 2 added the recordings category (23 September 2026), so every
 * version-1 choice (`1.a1.<moment>`) is asked again; `storedConsentVersion`
 * still reads the version out of it, so that is a decision, not an accident
 * of a regex. Values from before the timestamp existed (`1.a1`, `1.a0`) are
 * treated the same way.
 *
 * Stored as a first-party cookie rather than in localStorage so that the
 * choice travels with ordinary navigation and nothing has to be read back
 * from a storage API that private windows may refuse.
 */
export const CONSENT_COOKIE = "ym_consent";
export const CONSENT_VERSION = 2;

/** Six months, after which the question is asked again. */
export const CONSENT_MAX_AGE_SECONDS = 182 * 24 * 60 * 60;

export type ConsentDecision = {
  version: number;
  /** Google Analytics. */
  analytics: boolean;
  /** Microsoft Clarity: heatmaps and session recordings. */
  recordings: boolean;
  /** When the choice was made, ISO 8601 in UTC, to the second. */
  decidedAt: string;
};

/** `2.a1.r0.2026-09-23T10:15:00Z`: version, analytics, recordings, moment. */
export function serializeConsent(decision: ConsentDecision): string {
  return `${decision.version}.a${decision.analytics ? 1 : 0}.r${decision.recordings ? 1 : 0}.${toSecond(decision.decidedAt)}`;
}

function toSecond(iso: string): string {
  return new Date(iso).toISOString().replace(/\.\d{3}Z$/, "Z");
}

const moment = "(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z)";
/** The current shape: version, analytics, recordings, moment. */
const shape = new RegExp(`^(\\d{1,4})\\.a([01])\\.r([01])\\.${moment}$`);
/** Version 1: analytics and moment only. Recognised to be refused on purpose. */
const shapeV1 = new RegExp(`^(\\d{1,4})\\.a([01])\\.${moment}$`);

/**
 * The version a stored value was written under, whichever shape it has, or
 * null when it is not a consent value at all. For telling an outdated
 * choice from a garbled one; `parseConsent` accepts only the current one.
 */
export function storedConsentVersion(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = shape.exec(value) ?? shapeV1.exec(value);
  return match ? Number(match[1]) : null;
}

/**
 * Null for anything that is not a current, well-formed, unexpired choice: no
 * cookie, a garbled value, a value without a moment, a value from an earlier
 * version, or a choice older than the cookie was ever meant to live (a
 * browser that kept it past `Max-Age` does not extend the consent). All of
 * them mean the same thing to the site -- ask -- and none is an error.
 */
export function parseConsent(value: string | null | undefined, now: Date = new Date()): ConsentDecision | null {
  if (!value) return null;
  const match = shape.exec(value);
  if (!match) return null;

  const version = Number(match[1]);
  if (version !== CONSENT_VERSION) return null;

  const decided = new Date(match[4]);
  if (Number.isNaN(decided.getTime())) return null;
  if (decided.getTime() > now.getTime() + 5 * 60 * 1000) return null;
  if (decided.getTime() + CONSENT_MAX_AGE_SECONDS * 1000 <= now.getTime()) return null;

  return { version, analytics: match[2] === "1", recordings: match[3] === "1", decidedAt: match[4] };
}

/** The value of one cookie out of a `document.cookie` string, or undefined. */
export function readCookieValue(cookieString: string, name: string): string | undefined {
  for (const part of cookieString.split(";")) {
    const [rawName, ...rest] = part.split("=");
    if (rawName?.trim() === name) {
      return decodeURIComponent(rest.join("=").trim());
    }
  }
  return undefined;
}

/**
 * The `Set-Cookie`-style string the browser is handed. `SameSite=Lax` and
 * `Path=/` so the choice is seen on every page; `Secure` whenever the page is
 * served over https, which is every page outside local development.
 */
export function consentCookieString(decision: ConsentDecision, { secure }: { secure: boolean }): string {
  const parts = [
    `${CONSENT_COOKIE}=${encodeURIComponent(serializeConsent(decision))}`,
    "Path=/",
    `Max-Age=${CONSENT_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
