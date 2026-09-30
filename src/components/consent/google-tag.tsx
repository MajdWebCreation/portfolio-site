"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { flushPendingEvents } from "@/lib/analytics/track";
import { hydrateConsent, useConsentSnapshot } from "@/lib/consent/store";
import { syncGooglePage, syncGoogleTag, type GoogleTagConfig } from "@/lib/google/tag";

/**
 * Google Analytics and Google Ads, behind the visitor's choice, through one
 * gtag.js with Consent Mode v2 (see lib/google/tag.ts).
 *
 * Renders nothing. After every commit where the choice changed it hands the
 * choice to `syncGoogleTag`, which starts the tag only once a category the
 * deployment has a destination for is allowed. Before that there is no
 * script element, no data layer and no request to Google.
 *
 * Withdrawing statistics also flips Google's per-property kill switch and
 * removes the GA cookies (`decideConsent`); withdrawing marketing removes
 * the Ads cookies and reloads the page, so nothing keeps running.
 *
 * On every path change it also tells the tag which page this is
 * (`syncGooglePage`): without marketing, the address minus Google's ad click
 * identifiers, so GA never receives a `gclid` a visitor did not allow.
 */
export default function GoogleTag({ measurementId, adsId }: { measurementId?: string; adsId?: string }) {
  const { decision } = useConsentSnapshot();
  const pathname = usePathname();
  const analytics = decision?.analytics === true;
  const marketing = decision?.marketing === true;
  const decided = decision !== null;

  useEffect(() => {
    hydrateConsent();
  }, []);

  useEffect(() => {
    const config: GoogleTagConfig = { measurementId, adsId, labels: {} };
    syncGoogleTag({ config, choice: decided ? { analytics, marketing } : null, onLoad: flushPendingEvents });
    /* Events sent between the yes and this moment wait in track.ts; the tag queue exists now. */
    flushPendingEvents();
  }, [measurementId, adsId, decided, analytics, marketing]);

  useEffect(() => {
    syncGooglePage({ choice: decided ? { analytics, marketing } : null });
  }, [pathname, decided, analytics, marketing]);

  return null;
}
