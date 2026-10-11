"use server";

import type { ActionResult } from "@/lib/admin/action-result";
import { adminDb } from "@/lib/admin/db";
import { readInvoiceArtifact } from "@/lib/admin/invoices/artifact";
import type { InvoiceDocumentDownload } from "@/lib/admin/invoices/document-actions";
import { documentFileName } from "@/lib/admin/pdf/to-buffer";
import { getQuote } from "@/lib/admin/quotes/repository";

/**
 * The sent PDF of a quote, for the admin to look at.
 *
 * The same read the send flow does -- `readInvoiceArtifact`, hash and all --
 * so the preview and the attachment cannot come from different places or
 * survive different failures. A quote without a stored file (a concept, or
 * one sent before files were stored) is refused rather than rendered afresh.
 */
export async function quoteDocumentFile(id: string): Promise<ActionResult<InvoiceDocumentDownload>> {
  const db = await adminDb();

  const quote = await getQuote(id);
  if (!quote) return { ok: false, error: "Deze offerte bestaat niet (meer)." };

  const artifact = await readInvoiceArtifact(db, quote, "offerte");
  if (!artifact.ok) return { ok: false, error: artifact.reason };

  return {
    ok: true,
    value: {
      fileName: documentFileName(quote.number.value),
      base64: artifact.pdf.toString("base64"),
      sha256: artifact.document.sha256,
      bytes: artifact.document.bytes,
    },
  };
}
