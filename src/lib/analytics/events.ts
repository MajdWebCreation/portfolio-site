import type { ServiceFamilyKey, ServiceKey, ServiceKind } from "@/lib/content/services";
import type { PackageId } from "@/lib/pricing";
import type { PlannerPriority, PlannerTimeline } from "@/lib/content/project-planner";
import type { StaticRouteKey } from "@/lib/content/routes";
import type { BlogCategory } from "@/lib/content/blog";
import type { Locale } from "@/lib/content/site-content";
import type { TrafficClass } from "@/lib/attribution/types";

/**
 * The analytics vocabulary, in one place.
 *
 * Every event the site can send is listed here with the parameters it may
 * carry. `trackEvent` accepts nothing else at compile time, and the runtime
 * guard (guard.ts) accepts nothing else from the `data-track-*` attributes
 * either. What is not in this file is not measured.
 *
 * Values are identifiers from registers that already exist in the code --
 * a service's `ServiceKey`, a package's `PackageId`, a route's
 * `StaticRouteKey`, the planner's own option keys -- never text a visitor
 * reads. So the same action gives the same parameters in Dutch and English,
 * and a change of wording never breaks a series.
 *
 * Nothing here is a person: no free text, no names, no addresses, no
 * numbers that could be a phone. The guard refuses such values even if a
 * call site tried.
 *
 * Only `import type` from the content modules: this file is loaded on every
 * public page through the click delegation, and must not drag the service
 * copy or the pricing tables into that bundle.
 */

export const pageTypes = [
  "home",
  "services",
  "service",
  "pricing",
  "planner",
  "contact",
  "blog",
  "article",
  "projects",
  "case",
  "process",
  "legal",
  "payment",
  "other",
] as const;
export type PageType = (typeof pageTypes)[number];

/** Where a link leads, as a class rather than an address. */
export const ctaTargets = [
  "contact",
  "planner",
  "pricing",
  "projects",
  "case",
  "services",
  "service",
  "process",
  "blog",
  "article",
  "home",
  "other",
] as const;
export type CtaTarget = (typeof ctaTargets)[number];

/** Where on the page a control sits. */
export const placements = [
  "hero",
  "collaboration",
  "pointer",
  "header",
  "footer",
  "mobile_menu",
  "contact_cta",
  "build_overview",
  "service_index",
  "services_cta",
  "service_header",
  "service_proof",
  "related",
  "next_step",
  "process_cta",
  "contact_block",
  "project_row",
  "case_header",
  "article_list",
  "article_related",
  "pricing_selector",
  "pricing_closing",
  "planner_header",
  "banner",
  "settings",
] as const;
export type Placement = (typeof placements)[number];

export const linkContexts = ["project_live", "article", "terms_pdf", "other"] as const;
export type LinkContext = (typeof linkContexts)[number];

export const errorKinds = ["validation", "server", "network"] as const;
export type ErrorKind = (typeof errorKinds)[number];

export const plannerStepNames = ["project_type", "scope", "planning", "contact"] as const;
export type PlannerStepName = (typeof plannerStepNames)[number];

export const plannerEntries = ["direct", "pricing_preselect"] as const;
export type PlannerEntry = (typeof plannerEntries)[number];

/**
 * Every parameter any event may carry, with its type. The runtime shape of
 * each (enum, token, integer, hostname, field list) is declared in guard.ts;
 * the two files are kept in step by the guard's tests.
 */
export type AllParams = {
  /* Added to every event by `trackEvent` itself. */
  locale: Locale;
  page_type: PageType;

  placement: Placement;
  cta_id: string;
  cta_target: CtaTarget;
  nav_item: StaticRouteKey;
  from_locale: Locale;
  to_locale: Locale;

  service_id: ServiceKey;
  service_family: ServiceFamilyKey;
  service_kind: ServiceKind;

  package_id: PackageId | "none";
  preselected_package: PackageId | "none";

  article_slug: string;
  article_category: BlogCategory;

  link_domain: string;
  link_context: LinkContext;

  form: "contact";
  error_kind: ErrorKind;
  /** Names of the fields that failed, comma separated. Never their values. */
  fields: string;

  entry: PlannerEntry;
  step_index: number;
  step_name: PlannerStepName;
  direction: "next" | "back";
  project_type: PackageId | "none";
  recommended_package: PackageId;
  timeline_key: Exclude<PlannerTimeline, "">;
  priority_key: Exclude<PlannerPriority, "">;

  /* Own attribution (lib/attribution), only on the two key events. */
  traffic_class: TrafficClass;
  traffic_source: string;
};

export type ParamKey = keyof AllParams;

/** The parameters every event carries, filled in by `trackEvent`. */
export const commonParamKeys = ["locale", "page_type"] as const satisfies readonly ParamKey[];

type EventSpec = {
  /** Parameters this event may carry, on top of the common ones. */
  readonly params: readonly ParamKey[];
  /** Candidate for "mark as key event" in the GA4 property. */
  readonly keyEvent?: true;
};

export const analyticsEvents = {
  /* Interest in services. */
  service_view: { params: ["service_id", "service_family", "service_kind"] },
  service_cta_click: { params: ["service_id", "cta_id", "cta_target", "placement"] },

  /* Interest in prices and packages. */
  pricing_view: { params: ["preselected_package"] },
  pricing_package_select: { params: ["package_id"] },
  pricing_cta_click: { params: ["package_id", "cta_target", "placement"] },

  /* Every other call to action, by stable id. */
  cta_click: { params: ["cta_id", "cta_target", "placement"] },

  /* Moving through the site. */
  navigation_click: { params: ["nav_item", "placement"] },
  language_switch: { params: ["from_locale", "to_locale", "placement"] },
  outbound_click: { params: ["link_domain", "link_context"] },

  /* Content. */
  article_view: { params: ["article_slug", "article_category"] },
  article_cta_click: { params: ["article_slug", "cta_target", "placement"] },

  /* Contact form funnel. */
  contact_start: { params: ["form"] },
  contact_submit: { params: ["form", "traffic_class", "traffic_source"], keyEvent: true },
  contact_error: { params: ["form", "error_kind", "fields"] },

  /* Project planner funnel. */
  planner_start: { params: ["entry", "package_id"] },
  planner_step: { params: ["step_index", "step_name", "direction", "project_type"] },
  planner_error: { params: ["step_index", "step_name", "error_kind", "fields"] },
  planner_complete: {
    params: ["project_type", "recommended_package", "timeline_key", "priority_key", "traffic_class", "traffic_source"],
    keyEvent: true,
  },

  /* A positive cookie choice. A refusal is, by definition, never sent. */
  consent_granted: { params: ["placement"] },
} as const satisfies Record<string, EventSpec>;

export type AnalyticsEventName = keyof typeof analyticsEvents;

export const analyticsEventNames = Object.keys(analyticsEvents) as AnalyticsEventName[];

/**
 * Parameters a call site may leave out: the attribution pair exists only
 * when a source was actually seen, and an event without it is still whole.
 */
export type OptionalParamKey = "traffic_class" | "traffic_source";

/** The parameters a call site must supply for one event. */
export type EventParams<N extends AnalyticsEventName> = {
  [K in Exclude<(typeof analyticsEvents)[N]["params"][number], OptionalParamKey>]: AllParams[K];
} & {
  [K in Extract<(typeof analyticsEvents)[N]["params"][number], OptionalParamKey>]?: AllParams[K];
};

export function isAnalyticsEventName(value: string): value is AnalyticsEventName {
  return Object.prototype.hasOwnProperty.call(analyticsEvents, value);
}

/** The events to mark as key events in the GA4 property (by hand, see the phase 0 report). */
export const keyEventNames = analyticsEventNames.filter(
  (name) => (analyticsEvents[name] as EventSpec).keyEvent === true,
);
