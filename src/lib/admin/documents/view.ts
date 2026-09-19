import type { InvoiceDocument } from "@/lib/admin/documents/document-payload";
import type { Invoice } from "@/lib/admin/invoices/types";
import type { Quote } from "@/lib/admin/quotes/types";

/**
 * A quote or an invoice, for the screens that treat the two the same: the PDF
 * panel and the send panel. Kept apart from both so the light half of that
 * panel can name the shape without importing the half that carries the PDF
 * renderer with it.
 *
 * The invoice arm is an `InvoiceDocument`, the one shape both the preview and
 * the send flow render: what it carries about a monthly service is part of
 * the document, not something a screen adds on its own.
 */
export type DocumentView =
  | { kind: "quote"; quote: Quote }
  | ({ kind: "invoice" } & InvoiceDocument);

export function documentRecord(view: DocumentView): Quote | Invoice {
  return view.kind === "quote" ? view.quote : view.invoice;
}
