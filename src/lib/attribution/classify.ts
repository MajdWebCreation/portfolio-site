import { findSourceByHost, findSourceByUtm } from "@/lib/attribution/sources";
import { attributionLimits, isTrafficClass, type Attribution, type TrafficClass } from "@/lib/attribution/types";

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

export function classifyAttribution(input: ClassifyInput): Attribution | null {
  const landingPath = cleanLandingPath(input.landingPath);
  if (!landingPath) return null;

  const utmSource = cleanUtmValue(input.utmSource, attributionLimits.trafficSource);
  const utmMedium = cleanUtmValue(input.utmMedium, attributionLimits.trafficMedium);
  const campaign = cleanUtmValue(input.utmCampaign, attributionLimits.campaign);

  if (utmSource) {
    const known = findSourceByUtm(utmSource);
    if (known?.trafficClass === "ai_assistant") {
      return { trafficClass: "ai_assistant", trafficSource: known.source, trafficMedium: utmMedium ?? "ai-assistant", campaign, landingPath };
    }
    return { trafficClass: "campaign", trafficSource: utmSource, trafficMedium: utmMedium, campaign, landingPath };
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

  const landingPath = typeof raw.landingPath === "string" ? cleanLandingPath(raw.landingPath) : null;
  if (!landingPath || landingPath !== raw.landingPath) return null;

  /* A known-host class must name a host the register knows, or it is not that class. */
  if (trafficClass === "organic_search" || trafficClass === "ai_assistant" || trafficClass === "social") {
    const known = findSourceByHost(trafficSource as string);
    if (!known || known.trafficClass !== trafficClass || known.source !== trafficSource) return null;
  }

  return { trafficClass, trafficSource, trafficMedium, campaign, landingPath };
}
