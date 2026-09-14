import type { StatusTone } from "@/components/admin/status-badge";

/**
 * What YM Creations sent to a customer.
 *
 * One row is one send. Mailing the same invoice a second time is a second
 * communication, never an update of the first, because the customer really
 * did receive two mails and a history that hides one is not a history.
 *
 * Deliberately narrow: outbound e-mail from this system, and nothing else. No
 * phone calls, no WhatsApp, no notes an admin types. Those are a different
 * kind of record -- someone has to remember to write them, so they are never
 * complete -- and mixing them in would make this list look like the whole
 * story when it is only the part the machine can vouch for.
 */
export type CommunicationChannel = "email";

export type CommunicationDirection = "outbound";

/**
 * Which mail flow produced the message. Mirrors the check constraint on
 * `customer_communications.category`; the two lists are one list.
 */
export type CommunicationCategory =
  | "quote_sent"
  | "invoice_sent"
  | "invoice_activation_sent"
  | "recurring_invoice_prenotification"
  | "recurring_invoice_settled"
  | "direct_debit_activation"
  | "payment_reminder_first"
  | "payment_reminder_second"
  | "payment_final_notice";

export const communicationCategoryOrder: readonly CommunicationCategory[] = [
  "quote_sent",
  "invoice_sent",
  "invoice_activation_sent",
  "recurring_invoice_prenotification",
  "recurring_invoice_settled",
  "direct_debit_activation",
  "payment_reminder_first",
  "payment_reminder_second",
  "payment_final_notice",
];

export const communicationCategoryLabels: Record<CommunicationCategory, string> = {
  quote_sent: "Offerte",
  invoice_sent: "Factuur",
  invoice_activation_sent: "Factuur + incasso-activatie",
  recurring_invoice_prenotification: "Maandfactuur + vooraankondiging",
  recurring_invoice_settled: "Maandfactuur, reeds betaald",
  direct_debit_activation: "Incasso-activatielink",
  payment_reminder_first: "Eerste betalingsherinnering",
  payment_reminder_second: "Tweede betalingsherinnering",
  payment_final_notice: "Laatste aanmaning",
};

/**
 * Only what the provider says at the moment of sending. Resend either accepts
 * a message or refuses it; there is no delivery, open or click tracking in
 * this application, so there are no states here pretending otherwise.
 */
export type CommunicationStatus = "sent" | "failed";

export const communicationStatusLabels: Record<CommunicationStatus, string> = {
  sent: "Verzonden",
  failed: "Mislukt",
};

export const communicationStatusTone: Record<CommunicationStatus, StatusTone> = {
  sent: "success",
  failed: "danger",
};

/** What the mail was about, when it was about something with its own record. */
export type CommunicationLinks = {
  invoiceId?: string;
  quoteId?: string;
  projectId?: string;
  recurringServiceId?: string;
};

export type CustomerCommunication = CommunicationLinks & {
  id: string;
  customerId: string;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  category: CommunicationCategory;
  /** The address it went to, as it was at the time. */
  recipient: string;
  subject: string;
  bodyText: string;
  /** The HTML as sent, when the mail had an HTML part. */
  bodyHtml?: string;
  status: CommunicationStatus;
  /** Resend's own id for the message, when it gave one. */
  providerMessageId?: string;
  /** Why it failed; present only on a failed record. */
  error?: string;
  /** ISO timestamp; present exactly when the status is "sent". */
  sentAt?: string;
  createdAt: string;
};

/**
 * The four buckets the admin filters on.
 *
 * Grouped by what the customer received, not by what the system was doing
 * while sending it: every mail that carried an invoice PDF is a factuurmail,
 * including the monthly term that doubles as the SEPA pre-notification. The
 * only mail about money that carries no document is the activation link, and
 * that is what "Betalingen / incasso" holds.
 */
export type CommunicationFilter = "all" | "quotes" | "invoices" | "payments" | "other";

export const communicationFilterLabels: Record<CommunicationFilter, string> = {
  all: "Alle",
  quotes: "Offertes",
  invoices: "Facturen",
  payments: "Betalingen / incasso",
  other: "Overig",
};

export const communicationFilterOrder: readonly CommunicationFilter[] = [
  "all",
  "quotes",
  "invoices",
  "payments",
  "other",
];

const groups: Record<CommunicationCategory, Exclude<CommunicationFilter, "all" | "other">> = {
  quote_sent: "quotes",
  invoice_sent: "invoices",
  invoice_activation_sent: "invoices",
  recurring_invoice_prenotification: "invoices",
  recurring_invoice_settled: "invoices",
  direct_debit_activation: "payments",
  /* A reminder carries no document -- the invoice went out once, and this is
     about getting it paid. That puts it with the mandate link rather than
     with the mails that delivered a PDF. */
  payment_reminder_first: "payments",
  payment_reminder_second: "payments",
  payment_final_notice: "payments",
};

/**
 * The bucket a category belongs to. A category this build does not know --
 * a row written by a newer deployment, read by an older page -- lands in
 * "Overig" rather than disappearing from every filter.
 */
export function communicationGroup(category: string): Exclude<CommunicationFilter, "all"> {
  return groups[category as CommunicationCategory] ?? "other";
}

/** The label for a category, falling back to the stored value when unknown. */
export function communicationCategoryLabel(category: string): string {
  return communicationCategoryLabels[category as CommunicationCategory] ?? category;
}
