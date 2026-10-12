import { invoiceLedger, type CreditNoteState, type InvoiceLedger } from "@/lib/admin/credit-notes/settlement";
import { calculateTotals, type Cents, type DocumentTotals } from "@/lib/money";
import { invoiceOpenCents } from "@/lib/payments/customer-status";
import { integer, record, records, text, textOrNull, type JsonRecord } from "@/lib/portal/json";
import { linesFromJson, type PortalLine } from "@/lib/portal/lines";
import type { Database } from "@/lib/supabase/database.types";

/**
 * An invoice as the customer portal holds it: what portal_invoices and
 * portal_invoice return, and nothing else. No provider ids, no notes, no
 * finalization or activation fields -- the function does not return them,
 * so this type cannot carry them.
 *
 * Where it stands money-wise is not read from a column. It is the same
 * `invoiceLedger` the admin's payments page uses, over the same facts:
 * lines, successful payments, issued credit notes, live refunds. So the
 * customer is told exactly what the administration says.
 */
export type PortalInvoiceRow = Database["public"]["Functions"]["portal_invoices"]["Returns"][number];

export type PortalInvoiceStatus = "sent" | "overdue" | "paid";

export type PortalPayment = {
  amountCents: Cents;
  /** ISO timestamp; absent on a payment recorded without one. */
  paidAt: string | null;
  method: string | null;
  source: string;
};

export type PortalCreditNote = {
  id: string;
  number: string;
  issueDate: string;
  createdAt: string;
  subtotalCents: Cents;
  vatCents: Cents;
  totalCents: Cents;
};

export type PortalRefund = {
  creditNoteId: string;
  amountCents: Cents;
  status: "pending" | "processing" | "refunded";
  createdAt: string;
};

export type PortalAddress = {
  companyName: string;
  contactName: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  kvkNumber: string | null;
  vatNumber: string | null;
};

export type PortalInvoice = {
  id: string;
  number: string;
  issueDate: string;
  dueDate: string;
  status: PortalInvoiceStatus;
  paymentReference: string;
  billingPeriod?: { start: string; end: string };
  addressedTo: PortalAddress;
  lines: PortalLine[];
  payments: PortalPayment[];
  creditNotes: PortalCreditNote[];
  refunds: PortalRefund[];
};

function invoiceStatus(value: string): PortalInvoiceStatus {
  if (value === "sent" || value === "overdue" || value === "paid") return value;
  throw new Error(`factuurstatus ${value}`);
}

function refundStatus(value: string): PortalRefund["status"] {
  if (value === "pending" || value === "processing" || value === "refunded") return value;
  throw new Error(`terugbetaalstatus ${value}`);
}

function addressFrom(item: JsonRecord): PortalAddress {
  return {
    companyName: text(item, "company_name"),
    contactName: text(item, "contact_name"),
    street: text(item, "street"),
    postalCode: text(item, "postal_code"),
    city: text(item, "city"),
    country: text(item, "country"),
    kvkNumber: textOrNull(item, "kvk_number"),
    vatNumber: textOrNull(item, "vat_number"),
  };
}

export function invoiceFromPortalRow(row: PortalInvoiceRow): PortalInvoice {
  return {
    id: row.id,
    number: row.number,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    status: invoiceStatus(row.status),
    paymentReference: row.payment_reference || row.number,
    ...(row.billing_period_start && row.billing_period_end
      ? { billingPeriod: { start: row.billing_period_start, end: row.billing_period_end } }
      : {}),
    addressedTo: addressFrom(record(row.addressed_to, "adres")),
    lines: linesFromJson(row.lines),
    payments: records(row.payments, "betalingen").map((item) => ({
      amountCents: integer(item, "amount_cents"),
      paidAt: textOrNull(item, "paid_at"),
      method: textOrNull(item, "method"),
      source: text(item, "source"),
    })),
    creditNotes: records(row.credit_notes, "creditnota's").map((item) => ({
      id: text(item, "id"),
      number: text(item, "number"),
      issueDate: text(item, "issue_date"),
      createdAt: text(item, "created_at"),
      subtotalCents: integer(item, "subtotal_cents"),
      vatCents: integer(item, "vat_cents"),
      totalCents: integer(item, "total_cents"),
    })),
    refunds: records(row.refunds, "terugbetalingen").map((item) => ({
      creditNoteId: text(item, "credit_note_id"),
      amountCents: integer(item, "amount_cents"),
      status: refundStatus(text(item, "status")),
      createdAt: text(item, "created_at"),
    })),
  };
}

// ------------------------------------------------------------- the view

/**
 * The customer's word for where an invoice stands. Derived, never stored:
 *
 *   open            something is still to be paid, before the due date;
 *   partially_paid  part arrived, the rest is not due yet;
 *   overdue         something is still to be paid after the due date;
 *   paid            nothing is left to pay;
 *   credited        credit notes took the whole invoice off.
 */
export type PortalInvoiceState = "open" | "partially_paid" | "overdue" | "paid" | "credited";

export const portalInvoiceStateLabels: Record<PortalInvoiceState, string> = {
  open: "Openstaand",
  partially_paid: "Deels betaald",
  overdue: "Vervallen",
  paid: "Betaald",
  credited: "Gecrediteerd",
};

export const portalInvoiceStateTone: Record<PortalInvoiceState, "neutral" | "accent" | "success" | "danger"> = {
  open: "accent",
  partially_paid: "accent",
  overdue: "danger",
  paid: "success",
  credited: "neutral",
};

/** What a credit note means for the customer, from the ledger's state. */
export const portalCreditNoteStateLabels: Record<CreditNoteState, string> = {
  offset: "Verrekend met de factuur",
  refund_due: "Wordt aan u terugbetaald",
  in_progress: "Terugbetaling onderweg",
  processed: "Aan u terugbetaald",
};

export type PortalCreditNoteView = PortalCreditNote & { state: CreditNoteState; refundedCents: Cents };

export type PortalInvoiceView = {
  invoice: PortalInvoice;
  totals: DocumentTotals;
  ledger: InvoiceLedger;
  /** What is still to be paid on it: the ledger's outstanding amount, for a claim that is not marked paid. */
  openCents: Cents;
  state: PortalInvoiceState;
  creditNotes: PortalCreditNoteView[];
};

/* Only issued notes with their PDF reach the portal (see the migration), so each one counts. */
const storedDocument = true;

export function portalInvoiceView(invoice: PortalInvoice, todayKey: string): PortalInvoiceView {
  const ledger = invoiceLedger({
    invoice: { lines: invoice.lines },
    payments: invoice.payments.map((payment) => ({ status: "paid" as const, amountCents: payment.amountCents })),
    creditNotes: invoice.creditNotes.map((note) => ({
      id: note.id,
      issueDate: note.issueDate,
      createdAt: note.createdAt,
      totalCents: note.totalCents,
      issuedAt: note.createdAt,
      document: storedDocument,
    })),
    refunds: invoice.refunds,
  });

  const openCents = invoiceOpenCents(invoice, ledger);
  const state: PortalInvoiceState =
    openCents > 0
      ? invoice.dueDate < todayKey
        ? "overdue"
        : ledger.paidCents > 0
          ? "partially_paid"
          : "open"
      : ledger.creditedCents >= ledger.totalCents
        ? "credited"
        : "paid";

  return {
    invoice,
    totals: calculateTotals(invoice.lines),
    ledger,
    openCents,
    state,
    creditNotes: invoice.creditNotes.map((note) => {
      const own = ledger.notes.find((entry) => entry.creditNoteId === note.id);
      return { ...note, state: own?.state ?? "offset", refundedCents: own?.refundedCents ?? 0 };
    }),
  };
}

/** How a payment arrived, in the customer's words. */
export function paymentMethodLabel(payment: Pick<PortalPayment, "method" | "source">): string {
  if (payment.source === "manual_bank_transfer") return "Bankoverschrijving";
  switch (payment.method) {
    case "directdebit":
      return "Automatische incasso";
    case "ideal":
      return "iDEAL";
    case "creditcard":
      return "Creditcard";
    case "bancontact":
      return "Bancontact";
    case "banktransfer":
      return "Bankoverschrijving";
    default:
      return "Online betaling";
  }
}

/** The figures for a list or a summary: what is open, and how much of it is overdue. */
export function invoiceSummary(views: readonly PortalInvoiceView[]): {
  openCents: Cents;
  openCount: number;
  overdueCents: Cents;
  overdueCount: number;
} {
  const open = views.filter((view) => view.openCents > 0);
  const overdue = open.filter((view) => view.state === "overdue");
  return {
    openCents: open.reduce((sum, view) => sum + view.openCents, 0),
    openCount: open.length,
    overdueCents: overdue.reduce((sum, view) => sum + view.openCents, 0),
    overdueCount: overdue.length,
  };
}
