import type { Invoice } from "@/lib/admin/invoices/types";
import type { Quote } from "@/lib/admin/quotes/types";

/**
 * A quote or an invoice, for the screens that treat the two the same: the PDF
 * panel and the send panel. Kept apart from both so the light half of that
 * panel can name the shape without importing the half that carries the PDF
 * renderer with it.
 */
export type DocumentView = { kind: "quote"; quote: Quote } | { kind: "invoice"; invoice: Invoice };

export function documentRecord(view: DocumentView): Quote | Invoice {
  return view.kind === "quote" ? view.quote : view.invoice;
}
