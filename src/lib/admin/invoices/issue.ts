import type { SupabaseClient } from "@supabase/supabase-js";
import { invoiceDocument } from "@/lib/admin/documents/document-payload";
import type { IssuedActivation } from "@/lib/admin/documents/types";
import { storeInvoiceArtifact } from "@/lib/admin/invoices/artifact";
import { invoiceColumns, invoiceFromRow, type InvoiceRow } from "@/lib/admin/invoices/mapper";
import type { Invoice } from "@/lib/admin/invoices/types";
import { renderInvoicePdf } from "@/lib/admin/pdf/to-buffer";
import type { Database, Json } from "@/lib/supabase/database.types";

/**
 * Turning a numbered concept into a document with a file.
 *
 * Storage and Postgres are not one transaction, and no amount of wishing
 * makes them one. So the two things that have to be true together -- this
 * invoice is definitive, and this is its PDF -- are written by one statement
 * at the end, and everything that can fail happens before it:
 *
 *   1. `begin_invoice_finalization` takes the number, settles the payment
 *      reference and freezes the row. Idempotent: a second call returns the
 *      number the first one took.
 *   2. The row is read back, now numbered, and rendered. Once.
 *   3. The bytes go to the bucket under a path that contains their own hash,
 *      so no two renders can ever aim at the same object.
 *   4. `complete_invoice_finalization` records path, hash and size and
 *      stamps `issued_at`. It does that once. A caller offering a different
 *      artifact is refused, and is handed the one the invoice has.
 *
 * That is what makes two simultaneous finalizations safe, and the division
 * of labour is deliberate. Storage cannot arbitrate -- measured, not
 * assumed: two uploads issued at the same instant to one key are both
 * accepted there, and the later one wins. So storage is never asked to
 * arbitrate; it only ever stores bytes under their own hash, where nothing
 * can overwrite anything. Postgres arbitrates, in one statement, because it
 * can.
 *
 * The loser of that race leaves an object nothing points at. That is the
 * price, and it is the right way round: an unreferenced file costs storage,
 * while a referenced file that does not match its row costs an invoice.
 *
 * Between 1 and 4 the invoice is *finalizing*: it holds a number, it cannot
 * be edited, and it is not a document -- `issued_at` is null, so the send
 * flow refuses it and the screens say it is unfinished. Running this again
 * adopts whatever exists and finishes; the number does not move, because
 * step 1 hands back the one already taken.
 *
 * The cost of that design is honest and small: an abandoned finalization
 * leaves a number spent. A gap in an invoice series is a thing an accountant
 * understands. Two invoices with one number is not.
 */
export type IssueResult =
  | {
      ok: true;
      number: string;
      /** The document this invoice now has, whoever stored it. */
      document: { path: string; sha256: string; bytes: number };
      /** True when this call found the PDF already there instead of storing one. */
      adopted: boolean;
    }
  | { ok: false; error: string };

/** The jsonb `complete_invoice_finalization` hands back, read defensively. */
function completionResult(value: unknown): { number: string; path: string; sha256: string; bytes: number } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { number, path, sha256, bytes } = value as Record<string, unknown>;
  if (typeof number !== "string" || typeof path !== "string" || typeof sha256 !== "string" || typeof bytes !== "number") {
    return undefined;
  }
  return { number, path, sha256, bytes };
}

async function readInvoice(db: SupabaseClient<Database>, id: string): Promise<Invoice | undefined> {
  const { data, error } = await db.from("invoices").select(invoiceColumns).eq("id", id).maybeSingle();
  if (error) throw new Error(`Factuur laden: ${error.message}`);
  return data ? invoiceFromRow(data as unknown as InvoiceRow) : undefined;
}

export async function issueInvoiceDocument(
  db: SupabaseClient<Database>,
  invoiceId: string,
  activation?: IssuedActivation,
): Promise<IssueResult> {
  const numbered = await db.rpc("begin_invoice_finalization", {
    p_invoice_id: invoiceId,
    ...(activation ? { p_activation: activation as unknown as Json } : {}),
  });
  if (numbered.error || !numbered.data) {
    return { ok: false, error: numbered.error?.message ?? "Het factuurnummer kon niet worden toegekend." };
  }

  const invoice = await readInvoice(db, invoiceId);
  if (!invoice) return { ok: false, error: "Deze factuur bestaat niet (meer)." };

  /* Already a document. Its file is its file; nothing is rendered again. */
  if (invoice.issuedAt && invoice.document) {
    return { ok: true, number: invoice.number.value, document: invoice.document, adopted: true };
  }

  let pdf: Buffer;
  try {
    const document = invoiceDocument(invoice);
    pdf = await renderInvoicePdf(document.invoice, document.activates);
  } catch (error) {
    console.error("Invoice PDF render failed", { invoiceId, error });
    return { ok: false, error: "De PDF kon niet worden gemaakt. Controleer de regels en probeer opnieuw." };
  }

  let stored;
  try {
    stored = await storeInvoiceArtifact(db, invoice, pdf);
  } catch (error) {
    console.error("Invoice PDF upload failed", { invoiceId, error });
    return {
      ok: false,
      error: `De definitieve PDF kon niet worden opgeslagen, dus de factuur is nog niet uitgegeven: ${
        error instanceof Error ? error.message : "onbekende fout"
      }. Probeer het opnieuw; het factuurnummer ${invoice.number.value} blijft van deze factuur.`,
    };
  }

  const completed = await db.rpc("complete_invoice_finalization", {
    p_invoice_id: invoiceId,
    p_path: stored.path,
    p_sha256: stored.sha256,
    p_bytes: stored.bytes,
  });

  if (completed.error) {
    /*
      The invoice may have become a document while this call was rendering --
      another tab, a double click. The database refuses to swap one artifact
      for another, which is exactly right, and for this caller it is not a
      failure: the invoice is issued, just not with the file it happened to
      make. That file stays in the bucket, referenced by nothing.
    */
    const current = await readInvoice(db, invoiceId);
    if (current?.issuedAt && current.document) {
      console.info("Another finalization won; this render is unreferenced", {
        invoiceId,
        kept: current.document.path,
        discarded: stored.path,
      });
      return { ok: true, number: current.number.value, document: current.document, adopted: true };
    }
    return { ok: false, error: completed.error.message };
  }

  /*
    What the invoice ended up with, which is not necessarily what this call
    offered: a caller that lost the race is handed the artifact that won.
    The database refuses a mismatch outright, so anything returned here is
    the file in the bucket.
  */
  const result = completionResult(completed.data);
  if (!result) return { ok: false, error: "De factuur kon niet worden uitgegeven." };

  /*
    Worth a line in the log, and nothing more: this call rendered a PDF that
    was thrown away because the invoice already had one. It means two
    finalizations met -- two tabs, a double click, a retry after a timeout --
    which is handled, and is the sort of thing to be able to look up later.
  */
  if (stored.adopted) {
    console.info("Invoice already had a stored PDF; adopted it", { invoiceId, path: result.path });
  }

  return {
    ok: true,
    number: result.number,
    document: { path: result.path, sha256: result.sha256, bytes: result.bytes },
    adopted: stored.adopted,
  };
}
