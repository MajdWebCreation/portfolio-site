import type { ContactPayload } from "@/lib/contact/payload";

/**
 * Incoming website requests. Two origins with different shapes: the contact
 * form sends name, email, company and a message; the project planner adds
 * a phone number and the structured `planner` block exactly as the public
 * form posts it to /api/contact (prices arrive pre-formatted as text, so the
 * admin never recalculates them).
 */
export type InquiryOrigin = "contact" | "project_planner";

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
};

export type ContactInquiry = InquiryBase & {
  origin: "contact";
};

export type PlannerInquiry = InquiryBase & {
  origin: "project_planner";
  phone?: string;
  planner: PlannerSubmission;
};

export type Inquiry = ContactInquiry | PlannerInquiry;

/** Local, non-persistent edits made in the admin session. */
export type InquiryEdits = Partial<Pick<Inquiry, "status" | "internalNote">>;

export const inquiryOriginLabels: Record<InquiryOrigin, string> = {
  contact: "Contactformulier",
  project_planner: "Projectplanner",
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

/** One line for lists: the planner's project type, or the start of the message. */
export function summarizeInquiry(inquiry: Inquiry): string {
  if (inquiry.origin === "project_planner") {
    const { selectedProjectType, startingPrice } = inquiry.planner;
    return [selectedProjectType, startingPrice].filter(Boolean).join(" · ");
  }
  const text = inquiry.message.replace(/\s+/g, " ").trim();
  return text.length > 90 ? `${text.slice(0, 88).trimEnd()}…` : text;
}
