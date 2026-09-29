import { clarityProjectId } from "@/lib/clarity/client";
import { googleTagConfig } from "@/lib/google/tag";
import { metaPixelId } from "@/lib/meta/pixel";

/**
 * Which consent categories this deployment actually has a tool for, read
 * from the build's configuration. The consent card offers exactly these, and
 * the footer's "Cookie-instellingen" exists whenever the card does -- one
 * answer for both, so a visitor who could be asked can always change the
 * answer.
 */
export type ConsentTools = { analytics: boolean; recordings: boolean; marketing: boolean };

export function configuredConsentTools(): ConsentTools {
  const google = googleTagConfig();
  return {
    analytics: Boolean(google.measurementId),
    recordings: Boolean(clarityProjectId()),
    marketing: Boolean(metaPixelId() || google.adsId),
  };
}

/** Whether there is anything to ask about at all. */
export function hasConsentTools(tools: ConsentTools = configuredConsentTools()): boolean {
  return tools.analytics || tools.recordings || tools.marketing;
}
