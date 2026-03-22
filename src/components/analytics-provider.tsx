"use client";

import { useEffect } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { trackEvent, trackWebVital } from "@/lib/analytics";

export default function AnalyticsProvider() {
  useReportWebVitals((metric) => {
    trackWebVital(metric);
  });

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-track-event]")
          : null;

      if (!target) {
        return;
      }

      const name = target.dataset.trackEvent;

      if (!name) {
        return;
      }

      trackEvent({
        name: name as
          | "contact_form_submit_success"
          | "primary_cta_click"
          | "contact_cta_click"
          | "service_cta_click"
          | "article_cta_click"
          | "web_vital",
        category: target.dataset.trackCategory,
        label: target.dataset.trackLabel,
        location: target.dataset.trackLocation,
      });
    }

    document.addEventListener("click", handleClick, { capture: true });

    return () => {
      document.removeEventListener("click", handleClick, { capture: true });
    };
  }, []);

  return null;
}
