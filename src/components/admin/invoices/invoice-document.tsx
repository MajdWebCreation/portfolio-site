"use client";

import StoredDocument from "@/components/admin/documents/stored-document";
import { invoiceDocumentFile } from "@/lib/admin/invoices/document-actions";
import type { InvoiceDocumentFile } from "@/lib/admin/invoices/types";

/**
 * The definitive PDF of an issued invoice: the stored file, verified
 * server-side against its SHA-256, shown as those bytes. The same file the
 * customer's mail attaches, because there is only one. The mechanics live in
 * documents/stored-document.tsx, shared with credit notes.
 */
export default function InvoiceDocument({ invoiceId, document }: { invoiceId: string; document: InvoiceDocumentFile }) {
  return <StoredDocument document={document} load={() => invoiceDocumentFile(invoiceId)} title="Definitieve factuur" />;
}
