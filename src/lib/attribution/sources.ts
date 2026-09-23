import type { TrafficClass } from "@/lib/attribution/types";

/**
 * The register of known sources: the one list every component and every
 * route consults, so a hostname is never spelled out twice.
 *
 * Each entry names the hosts it recognises and the canonical source the
 * visit is recorded under, so `www.google.nl`, `google.com` and
 * `google.co.uk` all become `google.com`, and `chat.openai.com` becomes
 * `chatgpt.com`. Matching is on the registrable host: an entry `bing.com`
 * matches `bing.com` and `www.bing.com`, never `notbing.com`. `google.*`
 * covers the country domains Google search uses.
 *
 * What is officially documented and what is community observation, as of
 * 23 September 2026: OpenAI documents that ChatGPT appends
 * `utm_source=chatgpt.com` to outbound links; Microsoft names
 * `copilot.microsoft.com` as its standalone host. The other AI hostnames are
 * what the analytics community consistently observes as referrers; none of
 * those companies documents them. They are recognised, but a source is only
 * ever recorded when the browser or the link actually said so.
 */
export type SourceEntry = {
  /** The value stored and shown: one canonical hostname per source. */
  source: string;
  trafficClass: Extract<TrafficClass, "organic_search" | "ai_assistant" | "social">;
  /** Hosts that identify this source; `google.*` matches any Google TLD. */
  hosts: readonly string[];
  /** Whether the hostname is documented by the platform itself. */
  documented: boolean;
};

export const sourceRegister: readonly SourceEntry[] = [
  /* Search engines. */
  { source: "google.com", trafficClass: "organic_search", hosts: ["google.*"], documented: true },
  { source: "bing.com", trafficClass: "organic_search", hosts: ["bing.com", "cn.bing.com"], documented: true },
  { source: "duckduckgo.com", trafficClass: "organic_search", hosts: ["duckduckgo.com"], documented: true },
  { source: "ecosia.org", trafficClass: "organic_search", hosts: ["ecosia.org"], documented: true },
  { source: "search.yahoo.com", trafficClass: "organic_search", hosts: ["search.yahoo.com", "yahoo.com"], documented: true },
  { source: "startpage.com", trafficClass: "organic_search", hosts: ["startpage.com"], documented: true },
  { source: "search.brave.com", trafficClass: "organic_search", hosts: ["search.brave.com"], documented: true },
  { source: "qwant.com", trafficClass: "organic_search", hosts: ["qwant.com"], documented: true },

  /* AI assistants. */
  { source: "chatgpt.com", trafficClass: "ai_assistant", hosts: ["chatgpt.com", "chat.openai.com", "openai.com"], documented: true },
  { source: "copilot.microsoft.com", trafficClass: "ai_assistant", hosts: ["copilot.microsoft.com"], documented: true },
  { source: "perplexity.ai", trafficClass: "ai_assistant", hosts: ["perplexity.ai"], documented: false },
  { source: "claude.ai", trafficClass: "ai_assistant", hosts: ["claude.ai"], documented: false },
  { source: "gemini.google.com", trafficClass: "ai_assistant", hosts: ["gemini.google.com"], documented: false },
  { source: "grok.com", trafficClass: "ai_assistant", hosts: ["grok.com"], documented: false },
  { source: "chat.deepseek.com", trafficClass: "ai_assistant", hosts: ["chat.deepseek.com"], documented: false },
  { source: "chat.mistral.ai", trafficClass: "ai_assistant", hosts: ["chat.mistral.ai"], documented: false },
  { source: "you.com", trafficClass: "ai_assistant", hosts: ["you.com"], documented: false },

  /* Social. */
  { source: "linkedin.com", trafficClass: "social", hosts: ["linkedin.com", "lnkd.in"], documented: true },
  { source: "facebook.com", trafficClass: "social", hosts: ["facebook.com", "fb.com", "l.facebook.com", "lm.facebook.com", "m.facebook.com"], documented: true },
  { source: "instagram.com", trafficClass: "social", hosts: ["instagram.com", "l.instagram.com"], documented: true },
  { source: "x.com", trafficClass: "social", hosts: ["x.com", "twitter.com", "t.co"], documented: true },
  { source: "youtube.com", trafficClass: "social", hosts: ["youtube.com", "youtu.be"], documented: true },
  { source: "reddit.com", trafficClass: "social", hosts: ["reddit.com", "out.reddit.com"], documented: true },
  { source: "threads.net", trafficClass: "social", hosts: ["threads.net", "threads.com"], documented: true },
  { source: "tiktok.com", trafficClass: "social", hosts: ["tiktok.com"], documented: true },
  { source: "pinterest.com", trafficClass: "social", hosts: ["pinterest.com", "pin.it"], documented: true },
];

/** `gemini.google.com` must win over `google.*`: the most specific host wins. */
function specificity(host: string): number {
  return host.endsWith(".*") ? 0 : host.split(".").length;
}

function hostMatches(pattern: string, hostname: string): boolean {
  if (pattern.endsWith(".*")) {
    const base = pattern.slice(0, -2);
    // google.nl, google.co.uk, www.google.com -- but not notgoogle.com or google.example.
    const stripped = hostname.replace(/^www\./, "");
    if (!stripped.startsWith(`${base}.`)) return false;
    const tld = stripped.slice(base.length + 1);
    return /^[a-z]{2,3}(\.[a-z]{2})?$/.test(tld);
  }
  return hostname === pattern || hostname.endsWith(`.${pattern}`);
}

/** The register entry for a hostname, or null when it is nobody we know. */
export function findSourceByHost(hostname: string): SourceEntry | null {
  const host = hostname.toLowerCase();
  let best: { entry: SourceEntry; score: number } | null = null;
  for (const entry of sourceRegister) {
    for (const pattern of entry.hosts) {
      if (!hostMatches(pattern, host)) continue;
      const score = specificity(pattern);
      if (!best || score > best.score) best = { entry, score };
    }
  }
  return best?.entry ?? null;
}

/**
 * The register entry for a UTM source value. ChatGPT sends
 * `utm_source=chatgpt.com`; other platforms may send their own hostname.
 * Only a value that is a known host counts; anything else stays a campaign.
 */
export function findSourceByUtm(utmSource: string): SourceEntry | null {
  const value = utmSource.trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(value)) return null;
  return findSourceByHost(value);
}

/** The AI sources, for the dashboard: every canonical source, whether seen yet or not. */
export const aiSources = sourceRegister.filter((entry) => entry.trafficClass === "ai_assistant").map((entry) => entry.source);
