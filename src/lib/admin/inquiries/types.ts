import type { AdClickIds, Attribution } from "@/lib/attribution/types";
import type { ContactPayload } from "@/lib/contact/payload";
import { websiteUrlHost } from "@/lib/contact/website-url";
import { serviceKeys, type ServiceKey } from "@/lib/content/services";

/**
 * Incoming website requests. Three origins with different shapes: the
 * contact form sends name, email, company and a message; the project planner
 * adds a phone number and the structured `planner` block exactly as the
 * public form posts it to /api/contact (prices arrive pre-formatted as text,
 * so the admin never recalculates them); a websitecheck (the /websitecheck
 * landing page) carries the address of the website to look at, optionally a
 * phone number, and no message.
 *
 * The origin is the kind of request. Where the visit came from is the
 * attribution, a separate thing on every origin.
 *
 * The lifecycle is the business outcome: new -> contacted -> qualified ->
 * quote_sent -> won, or lost with a reason. Stages may be skipped; every
 * change is logged by the database (inquiry_status_events). Reporting
 * derives "a won lead was qualified" from the log; nothing here fabricates
 * a stage that was not recorded.
 */
export type InquiryOrigin = "contact" | "project_planner" | "websitecheck";

export type InquiryStatus = "new" | "contacted" | "qualified" | "quote_sent" | "won" | "lost";

export type LostReason =
  | "no_response"
  | "price"
  | "wrong_fit"
  | "chose_competitor"
  | "postponed"
  | "spam"
  | "duplicate"
  | "other";

/** The planner block as posted by the public project planner. */
export type PlannerSubmission = NonNullable<ContactPayload["planner"]>;

/**
 * The visitor's consent choice as the request carried it at capture:
 * provenance for any later sharing of an outcome with an advertising
 * platform. Absent when the request had no current choice.
 */
export type ConsentAtCapture = { marketing: boolean; version: number; decidedAt: string };

type InquiryBase = {
  id: string;
  status: InquiryStatus;
  /** ISO timestamp of the last status change. */
  statusChangedAt: string;
  /** Present exactly when the status is lost. */
  lostReason?: LostReason;
  /** The service the request is about, when known. */
  serviceInterest?: ServiceKey;
  /** CURRENT business values, EUR excluding VAT: convenience, not accounting; the moment's value is on the event. */
  quotedValueCents?: number;
  wonValueCents?: number;
  recurringMonthlyCents?: number;
  /** ISO timestamp of receipt. */
  receivedAt: string;
  locale: "nl" | "en";
  name: string;
  email: string;
  company?: string;
  message: string;
  internalNote?: string;
  /** Where the visit came from, when the website could establish it. */
  attribution?: Attribution;
  /** The Google Ads click identifiers, stored only with the visitor's marketing consent. */
  adClickIds?: AdClickIds;
  /** The id reported to Google Ads and Meta for the primary Lead of this request. */
  leadEventId?: string;
  consent?: ConsentAtCapture;
};

export type ContactInquiry = InquiryBase & {
  origin: "contact";
};

export type PlannerInquiry = InquiryBase & {
  origin: "project_planner";
  phone?: string;
  planner: PlannerSubmission;
};

export type WebsitecheckInquiry = InquiryBase & {
  origin: "websitecheck";
  /** The website to look at, as the route normalised it: an absolute http(s) URL. */
  websiteUrl: string;
  phone?: string;
};

export type Inquiry = ContactInquiry | PlannerInquiry | WebsitecheckInquiry;

/** One row of the immutable history, as the trigger wrote it. */
export type InquiryStatusEvent = {
  id: string;
  fromStatus?: InquiryStatus;
  toStatus: InquiryStatus;
  lostReason?: LostReason;
  /** quote_sent: the quoted value; won: the one-off value; EUR excluding VAT at that moment. */
  valueCents?: number;
  recurringMonthlyCents?: number;
  /** ISO timestamp. */
  changedAt: string;
  /** Display name of the admin, when the change was a person's. */
  changedBy?: string;
};

export const inquiryOriginLabels: Record<InquiryOrigin, string> = {
  contact: "Contactformulier",
  project_planner: "Projectplanner",
  websitecheck: "Websitecheck",
};

export const inquiryStatusOrder: readonly InquiryStatus[] = ["new", "contacted", "qualified", "quote_sent", "won", "lost"];

export const inquiryStatusLabels: Record<InquiryStatus, string> = {
  new: "Nieuw",
  contacted: "Benaderd",
  qualified: "Gekwalificeerd",
  quote_sent: "Offerte verstuurd",
  won: "Gewonnen",
  lost: "Verloren",
};

export const inquiryStatusTone: Record<InquiryStatus, "accent" | "neutral" | "success" | "danger"> = {
  new: "accent",
  contacted: "neutral",
  qualified: "success",
  quote_sent: "success",
  won: "success",
  lost: "danger",
};

/**
 * The stages in funnel order. `lost` is terminal and outside the chain: it
 * never implies an earlier stage. Used to raise a status without ever
 * lowering it ("Klant maken") and to tell what is still open.
 */
export const inquiryStageRank: Record<InquiryStatus, number> = {
  new: 0,
  contacted: 1,
  qualified: 2,
  quote_sent: 3,
  won: 4,
  lost: -1,
};

/** Statuses that still need work from YM's side. */
export const openInquiryStatuses: readonly InquiryStatus[] = ["new", "contacted", "qualified", "quote_sent"];

export const lostReasonOrder: readonly LostReason[] = [
  "no_response",
  "price",
  "wrong_fit",
  "chose_competitor",
  "postponed",
  "spam",
  "duplicate",
  "other",
];

export const lostReasonLabels: Record<LostReason, string> = {
  no_response: "Geen reactie",
  price: "Prijs",
  wrong_fit: "Past niet",
  chose_competitor: "Koos een ander",
  postponed: "Uitgesteld",
  spam: "Spam",
  duplicate: "Dubbel",
  other: "Anders",
};

/** Lost for a reason that means it never was a lead; excluded from every rate. */
export const notGenuineReasons: readonly LostReason[] = ["spam", "duplicate"];

export function isInquiryStatus(value: string): value is InquiryStatus {
  return (inquiryStatusOrder as readonly string[]).includes(value);
}

export function isLostReason(value: string): value is LostReason {
  return (lostReasonOrder as readonly string[]).includes(value);
}

export function isServiceKey(value: string): value is ServiceKey {
  return (serviceKeys as readonly string[]).includes(value);
}

/** One line for lists: the planner's project type, the websitecheck's site, or the start of the message. */
export function summarizeInquiry(inquiry: Inquiry): string {
  if (inquiry.origin === "project_planner") {
    const { selectedProjectType, startingPrice } = inquiry.planner;
    return [selectedProjectType, startingPrice].filter(Boolean).join(" · ");
  }
  if (inquiry.origin === "websitecheck") {
    return websiteUrlHost(inquiry.websiteUrl);
  }
  const text = inquiry.message.replace(/\s+/g, " ").trim();
  return text.length > 90 ? `${text.slice(0, 88).trimEnd()}…` : text;
}
