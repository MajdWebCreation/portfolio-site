import { portalInvoicePath, portalQuotePath } from "@/lib/portal/paths";
import { invoiceSummary, type PortalInvoiceView } from "@/lib/portal/invoices/model";
import { portalQuoteState, type PortalQuote } from "@/lib/portal/quotes/model";
import { nextCollection, type PortalServiceView } from "@/lib/portal/services/model";

/**
 * The portal's overview, put together from the same three reads the
 * invoice, quote and service pages make. Nothing here is a figure of its
 * own: the open amount is the sum of what each invoice's ledger leaves
 * open, the next collection is the services' own schedule, and an offer
 * waits for a decision when its derived state says so.
 */
export type RecentItem = {
  kind: "invoice" | "quote" | "credit_note";
  id: string;
  /** Where the item is shown in the portal. */
  href: string;
  number: string;
  date: string;
};

export type PortalOverview = {
  invoices: ReturnType<typeof invoiceSummary>;
  /** The invoices with something still to pay, the most urgent first. */
  openInvoices: PortalInvoiceView[];
  awaitingQuotes: PortalQuote[];
  nextCollection?: ReturnType<typeof nextCollection>;
  activeServices: number;
  recent: RecentItem[];
};

export function portalOverview(input: {
  invoices: readonly PortalInvoiceView[];
  quotes: readonly PortalQuote[];
  services: readonly PortalServiceView[];
  todayKey: string;
}): PortalOverview {
  const openInvoices = input.invoices
    .filter((view) => view.openCents > 0)
    .sort((a, b) => a.invoice.dueDate.localeCompare(b.invoice.dueDate));

  const recent: RecentItem[] = [
    ...input.invoices.map((view) => ({
      kind: "invoice" as const,
      id: view.invoice.id,
      href: portalInvoicePath(view.invoice.id),
      number: view.invoice.number,
      date: view.invoice.issueDate,
    })),
    ...input.invoices.flatMap((view) =>
      view.creditNotes.map((note) => ({
        kind: "credit_note" as const,
        id: note.id,
        href: portalInvoicePath(view.invoice.id),
        number: note.number,
        date: note.issueDate,
      })),
    ),
    ...input.quotes.map((quote) => ({
      kind: "quote" as const,
      id: quote.id,
      href: portalQuotePath(quote.id),
      number: quote.number,
      date: quote.issueDate,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))
    .slice(0, 5);

  const upcoming = nextCollection(input.services);

  return {
    invoices: invoiceSummary(input.invoices),
    openInvoices,
    awaitingQuotes: input.quotes.filter((quote) => portalQuoteState(quote, input.todayKey) === "awaiting"),
    ...(upcoming ? { nextCollection: upcoming } : {}),
    activeServices: input.services.filter((view) => view.state === "active" || view.state === "cancellation_scheduled").length,
    recent,
  };
}
