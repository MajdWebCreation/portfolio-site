"use client";

import StoredDocument from "@/components/admin/documents/stored-document";
import { quoteDocumentFile } from "@/lib/admin/quotes/document-actions";
import type { QuoteDocumentFile } from "@/lib/admin/quotes/types";

/**
 * The sent PDF of a quote: the stored file, verified server-side against its
 * SHA-256, shown as those bytes. The same file every mail of this quote
 * attaches, because there is only one. The mechanics live in
 * documents/stored-document.tsx, shared with invoices and credit notes.
 */
export default function QuoteDocument({ quoteId, document }: { quoteId: string; document: QuoteDocumentFile }) {
  return <StoredDocument document={document} load={() => quoteDocumentFile(quoteId)} title="Verzonden offerte" />;
}
