"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/attribution/capture";
import { trackedElementFromDataset } from "@/lib/analytics/dataset";
import { linkContexts, type LinkContext } from "@/lib/analytics/events";
import { trackEvent, trackUntypedEvent } from "@/lib/analytics/track";

/**
 * One listener for every tracked click on the public site.
 *
 * Two things are read off the element a click lands in:
 *
 *  - `data-track-event` with its `data-track-*` parameters, on links and
 *    buttons that server components mark up (they cannot call `trackEvent`
 *    themselves). The attributes are handed to the guard, which knows the
 *    register; nothing in here does.
 *  - an `href` to another host, which becomes an `outbound_click` with the
 *    hostname and a context the markup may name (`data-track-link-context`).
 *    The path, query and fragment of the external URL are never sent.
 *
 * It also reads the visit's origin once (lib/attribution/capture.ts): the
 * referrer and the UTM values of the first page, kept in memory for the two
 * forms to send along with a request. Nothing is stored before consent.
 *
 * Capture phase, so a click that navigates away is still seen. Web Vitals
 * are deliberately not reported here any more: they were sent as one event
 * per metric per page view with the value in GA's reserved `value`
 * parameter, which drowned the real events and made "event value" mean
 * nothing.
 */
function isLinkContext(value: string | undefined): value is LinkContext {
  return value !== undefined && (linkContexts as readonly string[]).includes(value);
}

export default function AnalyticsProvider() {
  useEffect(() => {
    captureAttribution();
  }, []);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;

      const tracked = event.target.closest<HTMLElement>("[data-track-event]");
      if (tracked) {
        const read = trackedElementFromDataset(tracked.dataset);
        if (read) trackUntypedEvent(read.name, read.params);
      }

      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      if (url.hostname === window.location.hostname) return;

      const context = anchor.dataset.trackLinkContext;
      trackEvent("outbound_click", {
        link_domain: url.hostname.toLowerCase(),
        link_context: isLinkContext(context) ? context : "other",
      });
    }

    document.addEventListener("click", handleClick, { capture: true });

    return () => {
      document.removeEventListener("click", handleClick, { capture: true });
    };
  }, []);

  return null;
}
