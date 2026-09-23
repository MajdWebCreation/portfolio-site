"use client";

import Script from "next/script";
import { useEffect } from "react";
import { hydrateConsent, useConsentSnapshot } from "@/lib/consent/store";

/**
 * Google Analytics, behind the visitor's choice.
 *
 * The two tags used to sit in the locale layout unconditionally. They now
 * exist only while the store says analytics was granted: before that there is
 * no script element, no request to googletagmanager.com and no data layer to
 * speak of. This is the whole guarantee, and it is a rendering guarantee, not
 * a runtime flag inside a script that already loaded.
 *
 * Withdrawing consent does not unload a script that is already running --
 * nothing can -- so the store also flips Google's per-property kill switch;
 * see `decideConsent`. Granting again in the same session re-renders these
 * tags, which next/script de-duplicates, and clears the switch.
 */
/**
 * How long Google's own cookies (`_ga`, `_ga_<id>`) live: ninety days rather
 * than gtag's default of two years, and with `cookie_update` off so a return
 * visit does not push the expiry out again. Stated in the cookie statement
 * (lib/content/cookies.ts); keep the two in step.
 */
export const GA_COOKIE_MAX_AGE_DAYS = 90;
const GA_COOKIE_MAX_AGE_SECONDS = GA_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;

export default function AnalyticsScripts({ measurementId }: { measurementId: string }) {
  const { decision } = useConsentSnapshot();

  useEffect(() => {
    hydrateConsent();
  }, []);

  if (!decision?.analytics) {
    return null;
  }

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
      <Script id="ym-ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${measurementId}', {
            anonymize_ip: true,
            cookie_expires: ${GA_COOKIE_MAX_AGE_SECONDS},
            cookie_update: false
          });
        `}
      </Script>
    </>
  );
}
