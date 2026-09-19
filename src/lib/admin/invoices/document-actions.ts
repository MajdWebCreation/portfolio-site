"use server";

import type { ActionResult } from "@/lib/admin/action-result";
import { adminDb } from "@/lib/admin/db";
import { readInvoiceArtifact } from "@/lib/admin/invoices/artifact";
import { getInvoice } from "@/lib/admin/invoices/repository";
import { documentFileName } from "@/lib/admin/pdf/to-buffer";

/**
 * The definitive PDF, for the admin to look at.
 *
 * Deliberately not a render and not a signed URL to the bucket, but the same
 * read the send flow does -- `readInvoiceArtifact`, hash and all -- so the
 * preview and the attachment cannot come from different places or survive
 * different failures. If the file is missing or no longer matches what was
 * recorded, the admin is told exactly that instead of being shown a freshly
 * made PDF that looks right.
 *
 * Base64 because a server action's result is JSON on the wire. A four-thirds
 * blow-up of a hundred kilobytes is not worth a second delivery mechanism.
 */
export type InvoiceDocumentDownload = {
  fileName: string;
  /** The stored file, base64-encoded. */
  base64: string;
  /** SHA-256 of those bytes, as recorded when the invoice was issued. */
  sha256: string;
  bytes: number;
};

export async function invoiceDocumentFile(id: string): Promise<ActionResult<InvoiceDocumentDownload>> {
  const db = await adminDb();

  const invoice = await getInvoice(id);
  if (!invoice) return { ok: false, error: "Deze factuur bestaat niet (meer)." };

  const artifact = await readInvoiceArtifact(db, invoice);
  if (!artifact.ok) return { ok: false, error: artifact.reason };

  return {
    ok: true,
    value: {
      fileName: documentFileName(invoice.number.value),
      base64: artifact.pdf.toString("base64"),
      sha256: artifact.document.sha256,
      bytes: artifact.document.bytes,
    },
  };
}
