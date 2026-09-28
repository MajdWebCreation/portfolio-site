import type { ContactMode } from "@/lib/contact/payload";

/**
 * The id that names one accepted lead, for Meta.
 *
 * Created by the contact route only after an inquiry is stored and both
 * mails went out, and returned with that `{ ok: true }` as `leadEventId`. It
 * is the one thing that turns a 2xx into a Lead in the browser: the honeypot
 * answer, a validation error or a failure carries none.
 *
 * The same id is meant to travel twice: as the browser pixel's `eventID`
 * (lib/meta/pixel.ts) and, once the Conversions API is added, as the server
 * event's `event_id`, so Meta counts the lead once. The id is random and says
 * nothing about the visitor or the inquiry.
 */
export type LeadForm = ContactMode;

export function createLeadEventId(): string {
  return crypto.randomUUID();
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isLeadEventId(value: unknown): value is string {
  return typeof value === "string" && uuid.test(value);
}
