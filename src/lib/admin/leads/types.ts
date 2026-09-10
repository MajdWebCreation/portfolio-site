/**
 * Leads are prospects YM approaches itself (outbound or manually added).
 * They are a different thing from inquiries, which come in through the
 * website; the two never share a model or a list.
 */
export type LeadSource = "cold_email" | "cold_call" | "linkedin" | "referral" | "network" | "other";

export type LeadStatus =
  | "new"
  | "to_contact"
  | "contacted"
  | "follow_up"
  | "interested"
  | "quote"
  | "won"
  | "lost";

export type Lead = {
  id: string;
  companyName: string;
  contactName: string;
  email?: string;
  phone?: string;
  website?: string;
  source: LeadSource;
  status: LeadStatus;
  notes: string;
  /** ISO date (YYYY-MM-DD) of the last contact moment. */
  lastContactAt?: string;
  /** ISO date (YYYY-MM-DD) of the planned next follow-up. */
  nextFollowUpAt?: string;
  /** ISO timestamp. */
  createdAt: string;
};

/** Local, non-persistent edits made in the admin session. */
export type LeadEdits = Partial<Pick<Lead, "status" | "notes" | "lastContactAt" | "nextFollowUpAt">>;

export const leadSourceOrder: readonly LeadSource[] = [
  "cold_email",
  "cold_call",
  "linkedin",
  "referral",
  "network",
  "other",
];

export const leadSourceLabels: Record<LeadSource, string> = {
  cold_email: "Koude e-mail",
  cold_call: "Koud gebeld",
  linkedin: "LinkedIn",
  referral: "Doorverwijzing",
  network: "Netwerk",
  other: "Anders",
};

export const leadStatusOrder: readonly LeadStatus[] = [
  "new",
  "to_contact",
  "contacted",
  "follow_up",
  "interested",
  "quote",
  "won",
  "lost",
];

export const leadStatusLabels: Record<LeadStatus, string> = {
  new: "Nieuw",
  to_contact: "Te benaderen",
  contacted: "Benaderd",
  follow_up: "Opvolgen",
  interested: "Geïnteresseerd",
  quote: "Offerte",
  won: "Gewonnen",
  lost: "Verloren",
};

export const leadStatusTone: Record<LeadStatus, "accent" | "neutral" | "success" | "danger"> = {
  new: "accent",
  to_contact: "accent",
  contacted: "neutral",
  follow_up: "accent",
  interested: "success",
  quote: "success",
  won: "success",
  lost: "danger",
};

/** Statuses that still need work from YM's side. */
export const openLeadStatuses: readonly LeadStatus[] = [
  "new",
  "to_contact",
  "contacted",
  "follow_up",
  "interested",
  "quote",
];

export function isLeadStatus(value: string): value is LeadStatus {
  return (leadStatusOrder as readonly string[]).includes(value);
}

export function isLeadSource(value: string): value is LeadSource {
  return (leadSourceOrder as readonly string[]).includes(value);
}

export type FollowUpState = "overdue" | "today" | "planned" | "none";

/** How a lead's next follow-up relates to a calendar day (YYYY-MM-DD). */
export function getFollowUpState(lead: Pick<Lead, "nextFollowUpAt">, todayKey: string): FollowUpState {
  if (!lead.nextFollowUpAt) return "none";
  if (lead.nextFollowUpAt < todayKey) return "overdue";
  if (lead.nextFollowUpAt === todayKey) return "today";
  return "planned";
}
