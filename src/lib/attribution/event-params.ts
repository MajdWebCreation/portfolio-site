import type { Attribution } from "@/lib/attribution/types";

/**
 * The two attribution parameters a key event carries, or nothing.
 *
 * Only a class that names an external source is worth sending: `direct`
 * and `internal` say "no source seen", and a key event without the pair
 * says exactly the same. Sending `direct` as a value would make it look
 * like a finding.
 */
export function attributionEventParams(attribution: Attribution | null): { traffic_class?: Attribution["trafficClass"]; traffic_source?: string } {
  if (!attribution || !attribution.trafficSource) return {};
  if (attribution.trafficClass === "campaign") {
    /* A UTM source is free text, not a host; the guard would refuse it. Send the class only when it is host-shaped. */
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(attribution.trafficSource)) return { traffic_class: "campaign" };
  }
  return { traffic_class: attribution.trafficClass, traffic_source: attribution.trafficSource };
}
