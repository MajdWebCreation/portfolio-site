/**
 * The providers this deployment syncs, in the order the dashboard shows
 * them. Kept apart from sync.ts so the dashboard's pure code can name them
 * without importing the server-side sync.
 */
export const syncedProviders = ["ga4", "gsc", "bing", "clarity"] as const;
export type SyncedProvider = (typeof syncedProviders)[number];

/**
 * A provider's configuration for the dashboard. `configured` is what the
 * sync needs; `parts` names separate pieces a provider has besides that
 * (Clarity: the browser tag and the export API are configured apart).
 */
export type ProviderConfigStatus = {
  provider: SyncedProvider;
  configured: boolean;
  missing: string[];
  parts?: Array<{ label: string; configured: boolean; variable: string }>;
};
