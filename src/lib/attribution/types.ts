/**
 * Where a visit came from, reduced to what a business needs to know.
 *
 * Seven classes, one of which is always true of a first page view. The
 * value is deliberately small: a class, a source (a hostname or a UTM
 * source), a medium and a campaign when a link carried them, and the path
 * of the first page. Nothing that could point at a person: no full
 * referrer, no query string of the landing page, no identifier of any kind.
 *
 * "direct" is a narrow claim -- no usable external referrer and no UTM --
 * and never a guess. "internal" is the site itself as referrer, which is
 * what a hard reload or a return from a preview looks like. Neither is
 * ever upgraded to a source that was not actually seen.
 */
export const trafficClasses = [
  "organic_search",
  "ai_assistant",
  "social",
  "campaign",
  "referral",
  "internal",
  "direct",
] as const;

export type TrafficClass = (typeof trafficClasses)[number];

export function isTrafficClass(value: unknown): value is TrafficClass {
  return typeof value === "string" && (trafficClasses as readonly string[]).includes(value);
}

export type Attribution = {
  trafficClass: TrafficClass;
  /** A hostname (`google.com`, `chatgpt.com`) or a UTM source; null for direct. */
  trafficSource: string | null;
  /** `organic`, `referral`, `ai-assistant`, a UTM medium; null when nothing says. */
  trafficMedium: string | null;
  /** The UTM campaign, when a link carried one. */
  campaign: string | null;
  /** `utm_term` (for a search ad: the keyword), when a link carried one. */
  term?: string | null;
  /** `utm_content` (the ad or link variant), when a link carried one. */
  content?: string | null;
  /** The path of the first page in the session; never its query string. */
  landingPath: string;
};

/**
 * The click identifiers Google Ads appends to an ad's landing URL (auto-
 * tagging): `gclid`, or `gbraid`/`wbraid` for clicks from iOS. Unlike the
 * attribution above, these do identify something -- one ad click -- so they
 * are kept apart from it: in the browser's memory only, never in storage,
 * and stored with an inquiry only when the request carries a yes to
 * marketing (the contact route checks the consent cookie). They let a lead
 * be traced back to the exact campaign and keyword in Google Ads later.
 */
export type AdClickIds = { gclid?: string; gbraid?: string; wbraid?: string };

export const adClickIdKeys = ["gclid", "gbraid", "wbraid"] as const;

export const attributionLimits = {
  trafficSource: 100,
  trafficMedium: 100,
  campaign: 100,
  term: 100,
  content: 100,
  landingPath: 200,
  adClickId: 256,
} as const;

export const trafficClassLabels: Record<TrafficClass, string> = {
  organic_search: "Organisch zoeken",
  ai_assistant: "AI-assistent",
  social: "Social",
  campaign: "Campagne",
  referral: "Verwijzing",
  internal: "Intern",
  direct: "Direct / onbekend",
};
