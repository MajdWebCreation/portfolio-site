/**
 * The website address a visitor types into the websitecheck form, made into
 * one absolute URL.
 *
 * People write their site the way they say it: `jouwbedrijf.nl`,
 * `www.jouwbedrijf.nl`, `https://jouwbedrijf.nl/over-ons`. All three are the
 * same request, so a missing scheme is filled in as https and the result is
 * the URL as the platform parses it: lower-case host, no fragment. Anything
 * that is not a public http(s) address -- an email address, a bare word, a
 * `javascript:` scheme, credentials in the URL, whitespace or markup -- is
 * refused as a whole, and the form asks again.
 *
 * Used on both sides: the form checks before it sends, the route checks
 * again before it stores. The database repeats the shape as a last line.
 */
export const websiteUrlMaxLength = 500;

/* A registrable host: labels of letters, digits and hyphens, at least one dot, a letter-only or punycode top-level label. */
const hostPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.(xn--[a-z0-9-]+|[a-z]{2,})$/;

export function normalizeWebsiteUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;

  const trimmed = input.trim();
  if (!trimmed || trimmed.length > websiteUrlMaxLength) return null;
  if (/[\s<>"'`\\]/.test(trimmed)) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!hostPattern.test(url.hostname)) return null;

  url.hash = "";
  const normalized = url.toString();
  return normalized.length > websiteUrlMaxLength ? null : normalized;
}

/** The host as a person would say it: `jouwbedrijf.nl`, without `www.`. Falls back to the input when it is not a URL. */
export function websiteUrlHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
