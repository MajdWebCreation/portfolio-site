import type { RecipientResult } from "@/lib/admin/communications/recipient";
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

/**
 * What the send panel tells the admin: the address a send goes to, or why it
 * cannot go yet.
 *
 * The address is the resolved recipient the page read from the customer
 * record -- never `customer.email` on the document, which is only the copy
 * taken when the document was written. A customer picked in the form but not
 * saved is not who the server would send to, so that asks for a save first.
 */
export function sendTarget(view: DocumentView, addressed: RecipientResult): { recipient: string; blocked: string | null } {
  const document = documentRecord(view);
  const kindLabel = view.kind === "quote" ? "offerte" : "factuur";

  if (!document.id) return { recipient: "", blocked: `Sla de ${kindLabel} eerst op.` };
  if (!addressed.ok) return { recipient: "", blocked: addressed.reason };
  if (addressed.recipient.customerId !== document.customer.customerId) {
    return { recipient: "", blocked: `Sla de ${kindLabel} eerst op.` };
  }
  return { recipient: addressed.recipient.email, blocked: null };
}
