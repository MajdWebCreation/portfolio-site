import type { SyncedProvider } from "@/lib/analytics-admin/synced-providers";

/**
 * The providers as an admin reads them. The keys are the stored provider
 * names; a provider added later (Clarity) is a new entry here and in the
 * sync's list, not a new status component.
 */
export const providerLabels: Record<SyncedProvider, string> = {
  ga4: "Google Analytics",
  gsc: "Google Search Console",
  bing: "Bing Webmaster Tools",
  clarity: "Microsoft Clarity",
};

/**
 * Clarity's own interface. Microsoft documents no deep link into a
 * project's recordings or heatmaps, so the link opens Clarity and the
 * project is chosen there.
 */
export const clarityUrl = "https://clarity.microsoft.com/";

/** Search Console's own interface for a property; for what its API does not offer. */
export function searchConsoleUrl(siteUrl: string | null): string {
  return siteUrl
    ? `https://search.google.com/search-console/performance/search-analytics?resource_id=${encodeURIComponent(siteUrl)}`
    : "https://search.google.com/search-console";
}

/** Bing Webmaster Tools; the site is chosen there. */
export const bingWebmasterUrl = "https://www.bing.com/webmasters/";
