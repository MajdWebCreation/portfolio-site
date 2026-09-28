"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { hydrateConsent, useConsentSnapshot } from "@/lib/consent/store";
import { syncMetaPixel } from "@/lib/meta/pixel";

/**
 * The Meta Pixel, behind its own consent category.
 *
 * Renders nothing. After every commit where the marketing choice or the path
 * changed, it hands both to `syncMetaPixel` (lib/meta/pixel.ts), which starts
 * the pixel once -- only with a yes to marketing and on an allowed route --
 * and sends one PageView per new path. A yes given in the dialog during the
 * visit therefore starts the pixel on the page the visitor is on, without a
 * reload; a later "no" reloads the page (see `decideConsent`), so a running
 * pixel is never trusted to stop by itself.
 */
export default function MetaPixel({ pixelId }: { pixelId: string }) {
  const { decision } = useConsentSnapshot();
  const pathname = usePathname() ?? "/";
  const marketingConsent = decision?.marketing === true;

  useEffect(() => {
    hydrateConsent();
  }, []);

  useEffect(() => {
    syncMetaPixel({ pixelId, marketingConsent, pathname });
  }, [pixelId, marketingConsent, pathname]);

  return null;
}
