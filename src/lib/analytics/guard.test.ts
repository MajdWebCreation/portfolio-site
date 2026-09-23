import { describe, expect, it } from "vitest";
import {
  analyticsEventNames,
  analyticsEvents,
  commonParamKeys,
  keyEventNames,
  type AllParams,
  type AnalyticsEventName,
  type ParamKey,
} from "@/lib/analytics/events";
import { guardEvent, looksLikePersonalData, paramShapes, unknownParamKeys } from "@/lib/analytics/guard";

/**
 * One valid value per parameter. Every event's sample is built from these,
 * so adding a parameter to the register without a sample fails the suite.
 */
const validSamples: { [K in ParamKey]: AllParams[K] } = {
  locale: "nl",
  page_type: "service",
  placement: "hero",
  cta_id: "home_hero_contact",
  cta_target: "contact",
  nav_item: "services",
  from_locale: "nl",
  to_locale: "en",
  service_id: "business-websites",
  service_family: "websites",
  service_kind: "package",
  package_id: "business",
  preselected_package: "none",
  article_slug: "wat-kost-een-website-in-2026",
  article_category: "websites",
  link_domain: "flexorabouw.nl",
  link_context: "project_live",
  form: "contact",
  error_kind: "validation",
  fields: "name,email",
  entry: "pricing_preselect",
  step_index: 2,
  step_name: "scope",
  direction: "next",
  project_type: "webshop",
  recommended_package: "platform",
  timeline_key: "1-2-months",
  priority_key: "design-quality",
  traffic_class: "ai_assistant",
  traffic_source: "chatgpt.com",
};

function sampleFor(name: AnalyticsEventName): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const key of [...commonParamKeys, ...analyticsEvents[name].params]) {
    raw[key] = validSamples[key];
  }
  return raw;
}

describe("the register", () => {
  it("has a runtime shape for every parameter of every event", () => {
    for (const name of analyticsEventNames) {
      for (const key of analyticsEvents[name].params) {
        expect(paramShapes[key], `${name}.${key}`).toBeDefined();
      }
    }
  });

  it("names contact_submit and planner_complete as the key events", () => {
    expect(keyEventNames).toEqual(["contact_submit", "planner_complete"]);
  });

  it("keeps every event and parameter name within GA4's 40 characters", () => {
    for (const name of analyticsEventNames) {
      expect(name.length).toBeLessThanOrEqual(40);
      for (const key of analyticsEvents[name].params) expect(key.length).toBeLessThanOrEqual(40);
    }
  });

  it("gives no event more than GA4's 25 parameters", () => {
    for (const name of analyticsEventNames) {
      expect(commonParamKeys.length + analyticsEvents[name].params.length).toBeLessThanOrEqual(25);
    }
  });
});

describe("guardEvent, per event", () => {
  for (const name of analyticsEventNames) {
    describe(name, () => {
      it("passes a valid sample through unchanged", () => {
        const sample = sampleFor(name);
        const result = guardEvent(name, sample);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.name).toBe(name);
          expect(result.params).toEqual(sample);
        }
      });

      it("drops a parameter the event does not list, and keeps the rest", () => {
        const sample = sampleFor(name);
        const result = guardEvent(name, { ...sample, event_label: "Neem contact op", value: 12 });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.params).toEqual(sample);
          expect(result.params).not.toHaveProperty("event_label");
          expect(result.params).not.toHaveProperty("value");
        }
        expect(unknownParamKeys(name, { ...sample, event_label: "x" })).toEqual(["event_label"]);
      });

      it("refuses the whole event when one value looks like personal data", () => {
        const sample = sampleFor(name);
        const [firstKey] = Object.keys(sample);
        expect(guardEvent(name, { ...sample, [firstKey]: "jan@example.com" }).ok).toBe(false);
        expect(guardEvent(name, { ...sample, [firstKey]: "0612345678" }).ok).toBe(false);
        expect(guardEvent(name, { ...sample, [firstKey]: "Neem contact op" }).ok).toBe(false);
      });

      it("refuses a value over 100 characters", () => {
        const sample = sampleFor(name);
        const stringKey = Object.keys(sample).find((key) => typeof sample[key] === "string");
        if (!stringKey) return;
        expect(guardEvent(name, { ...sample, [stringKey]: "a".repeat(101) }).ok).toBe(false);
      });

      it("ignores undefined and null values rather than failing on them", () => {
        const sample = sampleFor(name);
        const result = guardEvent(name, { ...sample, placement: undefined, cta_id: null });
        expect(result.ok).toBe(true);
      });
    });
  }
});

describe("guardEvent, shapes", () => {
  it("refuses an unknown event", () => {
    expect(guardEvent("primary_cta_click", { locale: "nl" })).toEqual({
      ok: false,
      reason: 'unknown event "primary_cta_click"',
    });
    expect(guardEvent("web_vital", {}).ok).toBe(false);
  });

  it("checks enums exactly", () => {
    expect(guardEvent("cta_click", { cta_id: "x", cta_target: "Contact", placement: "hero" }).ok).toBe(false);
    expect(guardEvent("cta_click", { cta_id: "x", cta_target: "contact", placement: "sidebar" }).ok).toBe(false);
    expect(guardEvent("language_switch", { from_locale: "de", to_locale: "nl", placement: "header" }).ok).toBe(false);
  });

  it("accepts lowercase identifiers with hyphens and underscores as tokens, nothing else", () => {
    expect(guardEvent("service_view", { service_id: "3d-configurators" }).ok).toBe(true);
    expect(guardEvent("service_view", { service_id: "Business Websites" }).ok).toBe(false);
    expect(guardEvent("service_view", { service_id: "business.websites" }).ok).toBe(false);
    expect(guardEvent("service_view", { service_id: "-leading" }).ok).toBe(false);
    expect(guardEvent("service_view", { service_id: "" }).ok).toBe(false);
  });

  it("takes step_index as an integer, from a number or a numeric string", () => {
    expect(guardEvent("planner_step", { step_index: 3 })).toMatchObject({ ok: true, params: { step_index: 3 } });
    expect(guardEvent("planner_step", { step_index: "3" })).toMatchObject({ ok: true, params: { step_index: 3 } });
    expect(guardEvent("planner_step", { step_index: 0 }).ok).toBe(false);
    expect(guardEvent("planner_step", { step_index: 2.5 }).ok).toBe(false);
    expect(guardEvent("planner_step", { step_index: "three" }).ok).toBe(false);
  });

  it("accepts a hostname for link_domain and refuses a URL", () => {
    expect(guardEvent("outbound_click", { link_domain: "www.taxidepolder.nl", link_context: "project_live" }).ok).toBe(true);
    expect(guardEvent("outbound_click", { link_domain: "https://taxidepolder.nl/boek?x=1", link_context: "other" }).ok).toBe(false);
    expect(guardEvent("outbound_click", { link_domain: "localhost", link_context: "other" }).ok).toBe(false);
  });

  it("accepts a comma separated list of field names and nothing that could be a value", () => {
    expect(guardEvent("contact_error", { form: "contact", error_kind: "validation", fields: "name,email,message" }).ok).toBe(true);
    expect(guardEvent("contact_error", { form: "contact", error_kind: "validation", fields: "none" }).ok).toBe(true);
    expect(guardEvent("contact_error", { form: "contact", error_kind: "validation", fields: "name=Jan" }).ok).toBe(false);
    expect(guardEvent("contact_error", { form: "contact", error_kind: "validation", fields: "name, email" }).ok).toBe(false);
  });

  it("refuses non-string values for string parameters", () => {
    expect(guardEvent("cta_click", { cta_id: 42 }).ok).toBe(false);
    expect(guardEvent("cta_click", { cta_id: { id: "x" } }).ok).toBe(false);
  });
});

describe("looksLikePersonalData", () => {
  it("flags addresses, phone-like digit runs and free text", () => {
    expect(looksLikePersonalData("jan@example.com")).toBe(true);
    expect(looksLikePersonalData("06 12 34 56 78")).toBe(true);
    expect(looksLikePersonalData("+31 6 12345678")).toBe(true);
    expect(looksLikePersonalData("Hallo, ik wil een website")).toBe(true);
  });

  it("leaves identifiers alone", () => {
    expect(looksLikePersonalData("home_hero_contact")).toBe(false);
    expect(looksLikePersonalData("1-2-months")).toBe(false);
    expect(looksLikePersonalData("wat-kost-een-website-in-2026")).toBe(false);
  });
});
