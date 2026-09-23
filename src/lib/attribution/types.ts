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
  /** The path of the first page in the session; never its query string. */
  landingPath: string;
};

export const attributionLimits = {
  trafficSource: 100,
  trafficMedium: 100,
  campaign: 100,
  landingPath: 200,
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
