export type AnalyticsEventName =
  | "contact_form_submit_success"
  | "primary_cta_click"
  | "contact_cta_click"
  | "service_cta_click"
  | "article_cta_click"
  | "web_vital";

export type WebVitalMetric = {
  id: string;
  name: string;
  value: number;
};

export type AnalyticsEvent = {
  name: AnalyticsEventName;
  category?: string;
  label?: string;
  location?: string;
  value?: number | string;
  path?: string;
};

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (...args: unknown[]) => void;
  }
}

function pushToDataLayer(payload: Record<string, unknown>) {
  if (typeof window === "undefined") {
    return;
  }

  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(payload);
}

export function trackEvent(event: AnalyticsEvent) {
  if (typeof window === "undefined") {
    return;
  }

  const payload = {
    event: event.name,
    event_category: event.category,
    event_label: event.label,
    event_location: event.location,
    value: event.value,
    page_path: event.path ?? window.location.pathname,
  };

  pushToDataLayer(payload);

  if (typeof window.gtag === "function" && process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID) {
    window.gtag("event", event.name, {
      event_category: event.category,
      event_label: event.label,
      event_location: event.location,
      value: event.value,
      page_path: event.path ?? window.location.pathname,
    });
  }
}

export function trackWebVital(metric: WebVitalMetric) {
  trackEvent({
    name: "web_vital",
    category: "performance",
    label: metric.name,
    location: metric.id,
    value: metric.value,
  });
}
