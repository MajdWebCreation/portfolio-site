import { renderToBuffer } from "@react-pdf/renderer";
import type { Invoice } from "@/lib/admin/invoices/types";
import InvoicePdf from "@/lib/admin/pdf/invoice-pdf";
import QuotePdf from "@/lib/admin/pdf/quote-pdf";
import type { Quote } from "@/lib/admin/quotes/types";

/**
 * The same PDF the admin previews, rendered on the server so it can be
 * attached to a mail.
 *
 * Exactly the components the browser uses — `QuotePdf` and `InvoicePdf` —
 * with no server-only variant, so what a customer receives is what the admin
 * saw. The document passed in already carries its definitive number, which is
 * why the "Conceptnummer" label is absent from a sent document.
 */
export function renderQuotePdf(quote: Quote): Promise<Buffer> {
  return renderToBuffer(<QuotePdf quote={quote} />);
}

export function renderInvoicePdf(invoice: Invoice): Promise<Buffer> {
  return renderToBuffer(<InvoicePdf invoice={invoice} />);
}

/** File name a customer sees on the attachment: the number, nothing else. */
export function documentFileName(number: string): string {
  return `${number}.pdf`;
}
