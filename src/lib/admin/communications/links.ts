import type { CommunicationLinks } from "@/lib/admin/communications/types";
import type { Invoice } from "@/lib/admin/invoices/types";
import type { Quote } from "@/lib/admin/quotes/types";

/**
 * What a document mail was about, read off the document itself.
 *
 * Written once rather than at each call site: a flow that fills in three of
 * the four links by hand is a flow that will fill in two after the next
 * change, and the missing link is invisible until somebody goes looking for
 * a mail that is filed under nothing.
 */
export function invoiceLinks(invoice: Invoice): CommunicationLinks {
  return {
    invoiceId: invoice.id,
    ...(invoice.quoteId ? { quoteId: invoice.quoteId } : {}),
    ...(invoice.projectId ? { projectId: invoice.projectId } : {}),
    ...(invoice.recurringServiceId ? { recurringServiceId: invoice.recurringServiceId } : {}),
  };
}

export function quoteLinks(quote: Quote): CommunicationLinks {
  return {
    quoteId: quote.id,
    ...(quote.projectId ? { projectId: quote.projectId } : {}),
  };
}
