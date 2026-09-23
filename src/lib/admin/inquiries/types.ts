import type { Attribution } from "@/lib/attribution/types";
import type { ContactPayload } from "@/lib/contact/payload";
import { websiteUrlHost } from "@/lib/contact/website-url";

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
 */
export type InquiryOrigin = "contact" | "project_planner" | "websitecheck";

export type InquiryStatus =
  | "new"
  | "viewed"
  | "follow_up"
  | "qualified"
  | "completed"
  | "rejected";

/** The planner block as posted by the public project planner. */
export type PlannerSubmission = NonNullable<ContactPayload["planner"]>;

type InquiryBase = {
  id: string;
  status: InquiryStatus;
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

/** Local, non-persistent edits made in the admin session. */
export type InquiryEdits = Partial<Pick<Inquiry, "status" | "internalNote">>;

export const inquiryOriginLabels: Record<InquiryOrigin, string> = {
  contact: "Contactformulier",
  project_planner: "Projectplanner",
  websitecheck: "Websitecheck",
};

export const inquiryStatusOrder: readonly InquiryStatus[] = [
  "new",
  "viewed",
  "follow_up",
  "qualified",
  "completed",
  "rejected",
];

export const inquiryStatusLabels: Record<InquiryStatus, string> = {
  new: "Nieuw",
  viewed: "Bekeken",
  follow_up: "Opvolgen",
  qualified: "Gekwalificeerd",
  completed: "Afgerond",
  rejected: "Afgewezen",
};

export const inquiryStatusTone: Record<InquiryStatus, "accent" | "neutral" | "success" | "danger"> = {
  new: "accent",
  viewed: "neutral",
  follow_up: "accent",
  qualified: "success",
  completed: "neutral",
  rejected: "danger",
};

export function isInquiryStatus(value: string): value is InquiryStatus {
  return (inquiryStatusOrder as readonly string[]).includes(value);
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
