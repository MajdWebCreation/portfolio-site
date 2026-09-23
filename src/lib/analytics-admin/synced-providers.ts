/**
 * The providers this deployment syncs, in the order the dashboard shows
 * them. Kept apart from sync.ts so the dashboard's pure code can name them
 * without importing the server-side sync.
 */
export const syncedProviders = ["ga4", "gsc", "bing"] as const;
export type SyncedProvider = (typeof syncedProviders)[number];

export type ProviderConfigStatus = { provider: SyncedProvider; configured: boolean; missing: string[] };
