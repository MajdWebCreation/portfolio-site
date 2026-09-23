import { trafficClasses } from "@/lib/attribution/types";
import {
  analyticsEvents,
  commonParamKeys,
  ctaTargets,
  errorKinds,
  isAnalyticsEventName,
  linkContexts,
  pageTypes,
  placements,
  plannerEntries,
  plannerStepNames,
  type AnalyticsEventName,
  type ParamKey,
} from "@/lib/analytics/events";

/**
 * The last check before anything reaches Google.
 *
 * `trackEvent` is typed, but the click delegation reads plain attributes
 * from the DOM and the planner sends values a visitor chose, so the types
 * alone prove nothing at runtime. This module decides, for one event with
 * one bag of values, exactly what may go out:
 *
 *  - only an event from the register;
 *  - only the parameters that event lists (plus the two common ones); an
 *    unknown key is dropped, never forwarded;
 *  - every value in the shape its parameter demands: a member of a fixed
 *    list, a short lowercase token, a small integer, a hostname or a list
 *    of field names -- and at most 100 characters, GA4's limit;
 *  - nothing that looks like a person: an address with an @, a run of
 *    digits long enough to be a phone number, or whitespace, which no
 *    identifier has and every sentence does.
 *
 * A value that fails drops the whole event rather than a cleaned version
 * of it: a call site that produced it has a bug, and half an event would
 * hide that. In development the reason is logged; in production the event
 * is silently absent. Both are better than a wrong value in a report.
 */

const MAX_VALUE_LENGTH = 100;

type Shape =
  | { kind: "enum"; values: readonly string[] }
  | { kind: "token" }
  | { kind: "int"; min: number; max: number }
  | { kind: "hostname" }
  | { kind: "fields" };

const locales = ["nl", "en"] as const;

/**
 * Registers that live in large content modules (services, pricing, the
 * planner, routes) are checked as tokens rather than imported: their exact
 * unions are enforced by TypeScript at the call site, and importing them
 * here would pull the whole content into the public bundle.
 */
export const paramShapes: Record<ParamKey, Shape> = {
  locale: { kind: "enum", values: locales },
  page_type: { kind: "enum", values: pageTypes },
  placement: { kind: "enum", values: placements },
  cta_id: { kind: "token" },
  cta_target: { kind: "enum", values: ctaTargets },
  nav_item: { kind: "token" },
  from_locale: { kind: "enum", values: locales },
  to_locale: { kind: "enum", values: locales },
  service_id: { kind: "token" },
  service_family: { kind: "token" },
  service_kind: { kind: "enum", values: ["package", "custom", "improve"] },
  package_id: { kind: "token" },
  preselected_package: { kind: "token" },
  article_slug: { kind: "token" },
  article_category: { kind: "token" },
  link_domain: { kind: "hostname" },
  link_context: { kind: "enum", values: linkContexts },
  form: { kind: "enum", values: ["contact"] },
  error_kind: { kind: "enum", values: errorKinds },
  fields: { kind: "fields" },
  entry: { kind: "enum", values: plannerEntries },
  step_index: { kind: "int", min: 1, max: 9 },
  step_name: { kind: "enum", values: plannerStepNames },
  direction: { kind: "enum", values: ["next", "back"] },
  project_type: { kind: "token" },
  recommended_package: { kind: "token" },
  timeline_key: { kind: "token" },
  priority_key: { kind: "token" },
  traffic_class: { kind: "enum", values: trafficClasses },
  traffic_source: { kind: "hostname" },
};

/* Lowercase identifiers: letters, digits, hyphen, underscore. No dots, no spaces, no @. */
const tokenShape = /^[a-z0-9][a-z0-9_-]*$/;
/* A registrable hostname, lowercased. */
const hostnameShape = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
/* Field names of a form, comma separated: `name,email`. */
const fieldsShape = /^[a-z][a-z_]*(,[a-z][a-z_]*)*$/;

const emailLike = /@/;
/* Eight or more digits in a row, allowing the separators people put in numbers. */
const phoneLike = /(?:\d[\s().-]*){8,}/;

/** True for a string that could be about a person rather than the site. */
export function looksLikePersonalData(value: string): boolean {
  return emailLike.test(value) || phoneLike.test(value) || /\s/.test(value);
}

export type GuardResult =
  | { ok: true; name: AnalyticsEventName; params: Record<string, string | number> }
  | { ok: false; reason: string };

function checkValue(key: ParamKey, raw: unknown): { ok: true; value: string | number } | { ok: false; reason: string } {
  const shape = paramShapes[key];

  if (shape.kind === "int") {
    const number = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
    if (!Number.isInteger(number) || number < shape.min || number > shape.max) {
      return { ok: false, reason: `${key}: expected an integer between ${shape.min} and ${shape.max}` };
    }
    return { ok: true, value: number };
  }

  if (typeof raw !== "string") {
    return { ok: false, reason: `${key}: expected a string` };
  }
  if (raw.length === 0 || raw.length > MAX_VALUE_LENGTH) {
    return { ok: false, reason: `${key}: expected 1 to ${MAX_VALUE_LENGTH} characters` };
  }
  if (looksLikePersonalData(raw)) {
    return { ok: false, reason: `${key}: value looks like personal data or free text` };
  }

  switch (shape.kind) {
    case "enum":
      return shape.values.includes(raw) ? { ok: true, value: raw } : { ok: false, reason: `${key}: "${raw}" is not one of ${shape.values.join("|")}` };
    case "token":
      return tokenShape.test(raw) ? { ok: true, value: raw } : { ok: false, reason: `${key}: "${raw}" is not a lowercase identifier` };
    case "hostname":
      return hostnameShape.test(raw) ? { ok: true, value: raw } : { ok: false, reason: `${key}: "${raw}" is not a hostname` };
    case "fields":
      return fieldsShape.test(raw) ? { ok: true, value: raw } : { ok: false, reason: `${key}: "${raw}" is not a list of field names` };
  }
}

/**
 * Decides what may be sent for one event. `raw` is whatever the call site
 * or the DOM produced; the result carries only allowed keys with checked
 * values, or the reason nothing may go.
 */
export function guardEvent(name: string, raw: Record<string, unknown>): GuardResult {
  if (!isAnalyticsEventName(name)) {
    return { ok: false, reason: `unknown event "${name}"` };
  }

  const allowed = new Set<string>([...commonParamKeys, ...analyticsEvents[name].params]);
  const params: Record<string, string | number> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null) continue;
    if (!allowed.has(key)) {
      // Dropped, not forwarded: a key outside the register never reaches GA.
      continue;
    }
    const checked = checkValue(key as ParamKey, value);
    if (!checked.ok) {
      return { ok: false, reason: `${name}: ${checked.reason}` };
    }
    params[key] = checked.value;
  }

  return { ok: true, name, params };
}

/** The keys `guardEvent` would drop for this event: for tests and dev logging. */
export function unknownParamKeys(name: AnalyticsEventName, raw: Record<string, unknown>): string[] {
  const allowed = new Set<string>([...commonParamKeys, ...analyticsEvents[name].params]);
  return Object.keys(raw).filter((key) => !allowed.has(key));
}
