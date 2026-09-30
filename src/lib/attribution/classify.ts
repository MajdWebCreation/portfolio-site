import { findSourceByHost, findSourceByUtm } from "@/lib/attribution/sources";
import { adClickIdKeys, attributionLimits, isTrafficClass, type AdClickIds, type Attribution, type TrafficClass } from "@/lib/attribution/types";

/**
 * From what the browser knows to one attribution value. Pure, so the
 * browser, the server and the tests all run the same rules.
 *
 * Order of precedence:
 *
 *  1. A UTM source that names a known AI assistant: `ai_assistant`. OpenAI
 *     appends `utm_source=chatgpt.com` to every link, so this is the most
 *     reliable AI signal there is, and it beats the generic campaign rule.
 *  2. Any other UTM source: `campaign`, with the UTM values as given.
 *  2b. No UTM source, but a Google Ads click identifier in the URL (auto-
 *     tagging: `gclid`, `gbraid`, `wbraid`): `campaign`, source `google`,
 *     medium `cpc` -- the values Google itself reports such a click under.
 *     Without this rule a paid click, whose referrer is google.com, would
 *     be recorded as organic search.
 *  3. A referrer from a known search engine, AI assistant or social host.
 *  4. A referrer from this site itself: `internal`.
 *  5. Any other referrer: `referral`, recorded by hostname only.
 *  6. Nothing at all: `direct`.
 *
 * A referrer that cannot be parsed counts as nothing: no source is ever
 * made up from a broken value.
 */
export type ClassifyInput = {
  referrer: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  /** `adgroup_id` and `match_type` of the landing URL: Google Ads' ad group and match type, next to the UTM values. */
  adgroupId?: string | null;
  matchType?: string | null;
  /** Whether the URL carried a Google Ads click identifier; the value itself is not needed here. */
  googleAdClick?: boolean;
  /** The site's own hostname, so its own pages are recognised as internal. */
  ownHostname: string;
  /** The path of the page this visit started on. */
  landingPath: string;
};

const safeValue = /^[a-z0-9][a-z0-9._\- ]*$/i;

/** Lowercased, trimmed, limited, and only characters a UTM value legitimately has; null otherwise. */
export function cleanUtmValue(value: string | null | undefined, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (trimmed.length === 0 || trimmed.length > max) return null;
  if (!safeValue.test(trimmed)) return null;
  return trimmed;
}

/** The path of a URL on this site, without query or fragment; null for anything that is not a local path. */
export function cleanLandingPath(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  const path = value.split("?")[0].split("#")[0];
  if (path.length > attributionLimits.landingPath) return null;
  if (/[\u0000-\u001f\u007f\s<>"'`\\]/.test(path)) return null;
  return path;
}

function hostnameOf(referrer: string): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

function sameSite(hostname: string, ownHostname: string): boolean {
  const own = ownHostname.toLowerCase().replace(/^www\./, "");
  const host = hostname.replace(/^www\./, "");
  return host === own || (own !== "" && host.endsWith(`.${own}`));
}

/**
 * `utm_term`, `utm_content`, `adgroup_id` and `match_type`, each only when
 * present: an attribution without them keeps its old shape. Vocabulary, so
 * the four are never confused later: `term` is the keyword Google matched
 * (`{keyword}`), not the search term the visitor typed, which no landing URL
 * carries; `content` is the ad (creative) id; `adgroupId` the ad group;
 * `matchType` Google's `e`, `p` or `b`.
 */
function extras(
  term: string | null,
  content: string | null,
  adgroupId: string | null,
  matchType: string | null,
): Pick<Attribution, "term" | "content" | "adgroupId" | "matchType"> {
  return {
    ...(term ? { term } : {}),
    ...(content ? { content } : {}),
    ...(adgroupId ? { adgroupId } : {}),
    ...(matchType ? { matchType } : {}),
  };
}

export function classifyAttribution(input: ClassifyInput): Attribution | null {
  const landingPath = cleanLandingPath(input.landingPath);
  if (!landingPath) return null;

  const utmSource = cleanUtmValue(input.utmSource, attributionLimits.trafficSource);
  const utmMedium = cleanUtmValue(input.utmMedium, attributionLimits.trafficMedium);
  const campaign = cleanUtmValue(input.utmCampaign, attributionLimits.campaign);
  const extra = extras(
    cleanUtmValue(input.utmTerm, attributionLimits.term),
    cleanUtmValue(input.utmContent, attributionLimits.content),
    cleanUtmValue(input.adgroupId, attributionLimits.adgroupId),
    cleanUtmValue(input.matchType, attributionLimits.matchType),
  );

  if (utmSource) {
    const known = findSourceByUtm(utmSource);
    if (known?.trafficClass === "ai_assistant") {
      return { trafficClass: "ai_assistant", trafficSource: known.source, trafficMedium: utmMedium ?? "ai-assistant", campaign, ...extra, landingPath };
    }
    return { trafficClass: "campaign", trafficSource: utmSource, trafficMedium: utmMedium, campaign, ...extra, landingPath };
  }

  if (input.googleAdClick) {
    return { trafficClass: "campaign", trafficSource: "google", trafficMedium: utmMedium ?? "cpc", campaign, ...extra, landingPath };
  }

  const hostname = hostnameOf(input.referrer);
  if (!hostname) {
    return { trafficClass: "direct", trafficSource: null, trafficMedium: null, campaign: null, landingPath };
  }

  if (sameSite(hostname, input.ownHostname)) {
    return { trafficClass: "internal", trafficSource: null, trafficMedium: null, campaign: null, landingPath };
  }

  const known = findSourceByHost(hostname);
  if (known) {
    const medium: Record<typeof known.trafficClass, string> = {
      organic_search: "organic",
      ai_assistant: "ai-assistant",
      social: "social",
    };
    return { trafficClass: known.trafficClass, trafficSource: known.source, trafficMedium: medium[known.trafficClass], campaign: null, landingPath };
  }

  const source = hostname.replace(/^www\./, "");
  if (source.length > attributionLimits.trafficSource) return null;
  return { trafficClass: "referral", trafficSource: source, trafficMedium: "referral", campaign: null, landingPath };
}

/**
 * The server's view of what a client sent: the same shape, checked field by
 * field against the same rules, and null for anything that does not fit
 * exactly. A request whose attribution fails this is stored without one;
 * nothing is repaired, guessed or partially kept.
 */
const hostnameShape = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

function validSource(trafficClass: TrafficClass, value: unknown): string | null | false {
  if (trafficClass === "direct" || trafficClass === "internal") return value === null || value === undefined ? null : false;
  if (typeof value !== "string" || value.length === 0 || value.length > attributionLimits.trafficSource) return false;
  if (trafficClass === "campaign") return cleanUtmValue(value, attributionLimits.trafficSource) === value ? value : false;
  return hostnameShape.test(value) ? value : false;
}

function validOptional(value: unknown, max: number): string | null | false {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return false;
  return cleanUtmValue(value, max) === value ? value : false;
}

export function validateAttribution(input: unknown): Attribution | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;

  if (!isTrafficClass(raw.trafficClass)) return null;
  const trafficClass = raw.trafficClass;

  const trafficSource = validSource(trafficClass, raw.trafficSource);
  if (trafficSource === false) return null;

  const trafficMedium = validOptional(raw.trafficMedium, attributionLimits.trafficMedium);
  if (trafficMedium === false) return null;

  const campaign = validOptional(raw.campaign, attributionLimits.campaign);
  if (campaign === false) return null;

  const term = validOptional(raw.term, attributionLimits.term);
  if (term === false) return null;

  const content = validOptional(raw.content, attributionLimits.content);
  if (content === false) return null;

  const adgroupId = validOptional(raw.adgroupId, attributionLimits.adgroupId);
  if (adgroupId === false) return null;

  const matchType = validOptional(raw.matchType, attributionLimits.matchType);
  if (matchType === false) return null;

  const landingPath = typeof raw.landingPath === "string" ? cleanLandingPath(raw.landingPath) : null;
  if (!landingPath || landingPath !== raw.landingPath) return null;

  /* A known-host class must name a host the register knows, or it is not that class. */
  if (trafficClass === "organic_search" || trafficClass === "ai_assistant" || trafficClass === "social") {
    const known = findSourceByHost(trafficSource as string);
    if (!known || known.trafficClass !== trafficClass || known.source !== trafficSource) return null;
  }

  return { trafficClass, trafficSource, trafficMedium, campaign, ...extras(term, content, adgroupId, matchType), landingPath };
}

/*
  Google's click identifiers are opaque URL-safe strings (letters, digits,
  `-`, `_`; about a hundred characters). Anything else is not one of them.
*/
const adClickIdShape = new RegExp(`^[A-Za-z0-9._-]{8,${attributionLimits.adClickId}}$`);

/**
 * The Google Ads click identifiers out of an untrusted value -- a URL's
 * query in the browser, a request body on the server -- each kept only when
 * it has the shape of one; null when none survives.
 */
export function cleanAdClickIds(input: unknown): AdClickIds | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const ids: AdClickIds = {};
  for (const key of adClickIdKeys) {
    const value = raw[key];
    if (typeof value === "string" && adClickIdShape.test(value)) ids[key] = value;
  }
  return Object.keys(ids).length > 0 ? ids : null;
}
