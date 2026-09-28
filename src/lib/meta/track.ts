import { hasMarketingConsent } from "@/lib/consent/store";
import { isLeadEventId, type LeadForm } from "@/lib/meta/event-id";
import { sendMetaLead } from "@/lib/meta/pixel";

/**
 * Reports an accepted lead to Meta. Called by the three forms right after the
 * contact route confirmed the inquiry, with the `leadEventId` from its answer.
 *
 * Nothing is sent without marketing consent, without a running pixel, or
 * without a valid event id -- which the route only hands out on a real
 * success. There is no buffer: a lead that cannot be reported now is not
 * reported later. The form's identifier is the only parameter; nothing a
 * visitor typed reaches Meta.
 */
export function trackMetaLead(input: { form: LeadForm; eventId: unknown }): boolean {
  if (!hasMarketingConsent() || !isLeadEventId(input.eventId)) return false;
  return sendMetaLead(input.form, input.eventId);
}
