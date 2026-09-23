"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { EventParams } from "@/lib/analytics/events";
import { trackEvent } from "@/lib/analytics/track";
import { useConsentSnapshot } from "@/lib/consent/store";
import { isPackageId } from "@/lib/pricing";

/**
 * One "this was looked at" event per page, from a server component.
 *
 * A service page, the pricing page and an article render one of these with
 * the identifiers it knows (the service key, the article slug). The event
 * fires once per path: React may run the effect twice in development, and a
 * client-side navigation to the same component with new props is a new
 * path, so the path is the key.
 *
 * Consent is part of the key as well. A visitor who lands, reads, and then
 * says yes has not been measured until that moment; the view event for the
 * page they are on fires then, once, so the first measured page is not
 * silently missing from the reports. Before the yes nothing is sent or
 * kept, as everywhere else.
 */
type ViewEventName = "service_view" | "article_view";

type ViewEventProps<N extends ViewEventName> = {
  event: N;
  params: EventParams<N>;
};

function useViewEvent(key: string, send: () => void) {
  const { decision } = useConsentSnapshot();
  const granted = decision?.analytics === true;
  const firedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!granted) return;
    if (firedFor.current === key) return;
    firedFor.current = key;
    send();
    // `send` closes over props that are part of `key`; the key is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [granted, key]);
}

export function ViewEvent<N extends ViewEventName>({ event, params }: ViewEventProps<N>) {
  const pathname = usePathname();
  useViewEvent(`${pathname}|${event}`, () => trackEvent(event, params));
  return null;
}

/**
 * The pricing page's view event reads the package that was preselected
 * through the URL hash (the selector mirrors its choice there), which only
 * the browser knows.
 */
export function PricingViewEvent() {
  const pathname = usePathname();
  useViewEvent(`${pathname}|pricing_view`, () => {
    const hash = window.location.hash.slice(1);
    trackEvent("pricing_view", { preselected_package: isPackageId(hash) ? hash : "none" });
  });
  return null;
}
