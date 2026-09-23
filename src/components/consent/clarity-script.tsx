"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { clarityAllowedOnPath, clarityLoaderScript, shouldLoadClarity } from "@/lib/clarity/client";
import { hydrateConsent, useConsentSnapshot } from "@/lib/consent/store";

/**
 * Microsoft Clarity, behind its own consent category.
 *
 * Rendered only when the visitor said yes to behaviour recordings and the
 * route is one Clarity may run on (lib/clarity/client.ts). Before that there
 * is no script element and so no request to clarity.ms at all; a yes to
 * statistics alone never gets here. The loader queues the Consent V2 signal
 * (analytics granted, advertising denied) before the tag runs.
 *
 * Once loaded, a script cannot be unloaded. Two situations therefore end in
 * a full page load instead of trusting a running tag: withdrawing consent
 * (handled by the consent dialog), and a client-side navigation from a page
 * where Clarity runs to one where it must not (the payment and direct-debit
 * pages), handled here.
 */
export default function ClarityScript({ projectId }: { projectId: string }) {
  const { decision } = useConsentSnapshot();
  const pathname = usePathname() ?? "/";
  const [everLoaded, setEverLoaded] = useState(false);

  useEffect(() => {
    hydrateConsent();
  }, []);

  const load = shouldLoadClarity({ projectId, recordingsConsent: decision?.recordings === true, pathname });
  /* Remembered once the tag was rendered in this page; state derived during render, the way React asks. */
  if (load && !everLoaded) setEverLoaded(true);

  useEffect(() => {
    if (everLoaded && !clarityAllowedOnPath(pathname)) window.location.reload();
  }, [everLoaded, pathname]);

  if (!load) return null;

  return (
    <Script id="ym-clarity" strategy="afterInteractive">
      {clarityLoaderScript(projectId)}
    </Script>
  );
}
