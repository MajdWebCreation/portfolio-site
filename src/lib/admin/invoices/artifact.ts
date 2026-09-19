import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Invoice, InvoiceDocumentFile } from "@/lib/admin/invoices/types";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The one PDF an invoice is.
 *
 * A definitive invoice is not "some data that can be rendered into a PDF"; it
 * is a file. It is rendered once, when the invoice is issued, stored, and
 * from then on only ever read back -- by the admin's preview and by the mail
 * that attaches it. Rendering twice would give two files: `@react-pdf` writes
 * a creation date and an id into every document, so two renders of identical
 * data are identical documents and different bytes.
 *
 * The row keeps the path, the size and the SHA-256; the bytes stay in the
 * `invoice-documents` bucket, which is private. A hash in Postgres and bytes
 * in storage is the cheap half of an audit trail: the expensive half would be
 * putting megabytes of PDF in the database, which buys nothing that this does
 * not.
 */
export const invoiceDocumentBucket = "invoice-documents";

/** Lowercase hex, the form the column's check constraint expects. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Where an invoice's PDF lives: its number, and what is in it.
 *
 * The content hash is part of the path, and that is not decoration. Supabase
 * Storage was measured on this point rather than assumed: an upload with
 * `upsert: false` to an existing key is refused with 409, but two uploads
 * issued at the same instant to the same key are *both* accepted, and the
 * later write wins. Twenty-five out of twenty-five, against storage-api
 * v1.73.1.
 *
 * With one path per invoice that would be the corruption this whole design
 * exists to prevent: two finalizations render two different files, both are
 * told they stored theirs, one records its hash, and the bucket ends up
 * holding the other one's bytes. The invoice would be definitive with a row
 * and a file that disagree.
 *
 * Putting the hash in the path removes the shared key, so there is nothing
 * left to race for. Two different renders are two different objects, neither
 * can touch the other, and every recorded hash describes the bytes at its
 * own path forever. Which of them becomes the document is then decided where
 * it can be decided atomically: in Postgres, by
 * `complete_invoice_finalization`, which records one artifact and refuses
 * every other.
 *
 * It stays deterministic -- the same invoice and the same bytes always give
 * the same path -- so an upload that is genuinely repeated still collides
 * with itself and is adopted rather than duplicated.
 */
export function invoiceDocumentObjectPath(invoice: Pick<Invoice, "number" | "issueDate">, sha256: string): string {
  return `${invoice.issueDate.slice(0, 4)}/${invoice.number.value}-${sha256}.pdf`;
}

export type StoredArtifact = {
  path: string;
  sha256: string;
  bytes: number;
  /** True when this call did not write the object: one was already there. */
  adopted: boolean;
};

/**
 * A refusal because the object is already there.
 *
 * The real answer from Supabase Storage, captured against a local stack:
 *
 *   { name: "StorageApiError", status: 400, statusCode: "409",
 *     code: "KeyAlreadyExists", message: "The resource already exists" }
 *
 * Note that `status` is 400 and `statusCode` is the string "409" -- reading
 * the wrong one of those two would miss it. Three independent signals are
 * accepted, because this is the branch the whole race depends on and a
 * client release that renames one of them must not turn a handled collision
 * into a failed finalization.
 *
 * What it must *not* match is the other refusal this bucket produces, a
 * `403 AccessDenied` with "new row violates row-level security policy" when
 * something asks to overwrite. That is not a collision to adopt; it is the
 * bucket refusing to replace a document, and it belongs in the error path.
 */
function alreadyExists(error: { message?: string; statusCode?: string; status?: number; code?: string }): boolean {
  return (
    error.code === "KeyAlreadyExists" ||
    Number(error.statusCode) === 409 ||
    error.status === 409 ||
    /already exists/i.test(error.message ?? "")
  );
}

/** Exported for the regression test that pins the real responses above. */
export const storageSaysAlreadyExists = alreadyExists;

/**
 * Puts the rendered PDF in the bucket under its own content-addressed path.
 *
 * Nothing here can overwrite anything: the path contains the hash of the
 * bytes being written, so the only object it could collide with is one
 * holding those same bytes. A collision is therefore a repeat of this very
 * upload -- the same bytes, stored again -- and it is adopted rather than
 * treated as a failure, which makes storing idempotent.
 *
 * `upsert: false` all the same, so that a collision is visible instead of
 * being papered over, and so the request never asks for a permission the
 * bucket deliberately does not grant. `invoice-documents` has no update
 * policy: an overwrite is refused by the database itself.
 *
 * Before writing, the bucket is asked whether this invoice already has a
 * render lying about. It does when a finalization stored its PDF and died
 * before recording it: that file is this invoice's document as far as
 * anything can tell, and adding a second one would make the earlier attempt
 * worthless for no reason. So it is adopted -- read, checked against the
 * hash in its own name, and handed back.
 *
 * Adopted bytes are always hashed again rather than assumed. The path says
 * what should be in that object, and a file that does not hash to its own
 * name is not a document to hand to a customer.
 */
async function existingRender(
  db: SupabaseClient<Database>,
  invoice: Pick<Invoice, "number" | "issueDate">,
): Promise<string | undefined> {
  const folder = invoice.issueDate.slice(0, 4);
  const prefix = `${invoice.number.value}-`;

  const { data, error } = await db.storage.from(invoiceDocumentBucket).list(folder, { search: prefix });
  if (error) throw new Error(`Factuur-PDF zoeken: ${error.message}`);

  const found = (data ?? []).filter((item) => item.name.startsWith(prefix) && item.name.endsWith(".pdf"));
  /*
    More than one means two finalizations raced and both stored a render.
    Neither is more this invoice's document than the other, and it is not
    this function's decision: the row says which one counts, and the caller
    is about to ask it.
  */
  return found.length === 1 ? `${folder}/${found[0]!.name}` : undefined;
}

export async function storeInvoiceArtifact(
  db: SupabaseClient<Database>,
  invoice: Pick<Invoice, "number" | "issueDate">,
  pdf: Uint8Array,
): Promise<StoredArtifact> {
  const sha256 = sha256Hex(pdf);
  const path = invoiceDocumentObjectPath(invoice, sha256);

  const earlier = await existingRender(db, invoice);
  if (earlier && earlier !== path) return adopt(db, earlier);

  const { error } = await db.storage.from(invoiceDocumentBucket).upload(path, pdf, {
    contentType: "application/pdf",
    upsert: false,
  });

  if (!error) return { path, sha256, bytes: pdf.byteLength, adopted: false };
  if (!alreadyExists(error)) throw new Error(`Factuur-PDF opslaan: ${error.message}`);

  /* These exact bytes are already stored: the same upload, once more. */
  return adopt(db, path);
}

/** Reads a stored render and checks it against the hash in its own name. */
async function adopt(db: SupabaseClient<Database>, path: string): Promise<StoredArtifact> {
  const expected = path.slice(path.lastIndexOf("-") + 1, -".pdf".length);

  const existing = await db.storage.from(invoiceDocumentBucket).download(path);
  if (existing.error || !existing.data) {
    throw new Error(
      `Factuur-PDF opslaan: er ligt al een document op ${path}, maar het kon niet worden gelezen: ${
        existing.error?.message ?? "geen bestand"
      }`,
    );
  }

  const stored = Buffer.from(await existing.data.arrayBuffer());
  const sha256 = sha256Hex(stored);
  if (sha256 !== expected) {
    throw new Error(`Factuur-PDF opslaan: het bestand op ${path} komt niet overeen met zijn eigen controlesom.`);
  }

  return { path, sha256, bytes: stored.byteLength, adopted: true };
}

export type ArtifactRead =
  | { ok: true; pdf: Buffer; document: InvoiceDocumentFile }
  | { ok: false; reason: string };

/**
 * The stored PDF, checked against what was recorded when it was stored.
 *
 * Both readers -- the admin's preview and the send flow -- come through here,
 * so neither can end up with a file the other would have rejected. The hash
 * is verified on every read rather than trusted: bytes that no longer match
 * the hash are not "probably fine", they are a document nobody approved, and
 * the answer is to refuse rather than to render a replacement and pass it off
 * as the original.
 */
export async function readInvoiceArtifact(
  db: SupabaseClient<Database>,
  invoice: Pick<Invoice, "number" | "document">,
): Promise<ArtifactRead> {
  const document = invoice.document;
  if (!document) {
    return {
      ok: false,
      reason: `Van factuur ${invoice.number.value} is geen definitieve PDF opgeslagen.`,
    };
  }

  const { data, error } = await db.storage.from(invoiceDocumentBucket).download(document.path);
  if (error || !data) {
    return { ok: false, reason: `De opgeslagen PDF kon niet worden gelezen: ${error?.message ?? "geen bestand"}.` };
  }

  const pdf = Buffer.from(await data.arrayBuffer());

  if (pdf.byteLength !== document.bytes || sha256Hex(pdf) !== document.sha256) {
    return {
      ok: false,
      reason: `De opgeslagen PDF van ${invoice.number.value} komt niet overeen met de vastgelegde controlesom.`,
    };
  }

  return { ok: true, pdf, document };
}
