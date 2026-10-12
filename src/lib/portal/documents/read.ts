import { readInvoiceArtifact } from "@/lib/admin/invoices/artifact";
import { portalRoot } from "@/lib/portal/paths";
import { portalReader, portalResult, requireResourceId } from "@/lib/portal/rpc";

/**
 * A stored PDF, for a member, read under the member's own session.
 *
 * Two independent locks. portal_document says whether this document is the
 * customer's and visible, and where it is stored; then the bucket is read
 * with the member's session, and the storage policy asks the database the
 * same question about the object path. The path never leaves the server,
 * and knowing it would not help: another customer's member asking for the
 * same object is refused by the policy. The bytes are checked against the
 * recorded hash on the way out, the same check the admin's preview and the
 * mail make (readInvoiceArtifact).
 */
export type PortalDocumentKind = "invoice" | "credit_note" | "quote";

export const portalDocumentKinds: readonly PortalDocumentKind[] = ["invoice", "credit_note", "quote"];

export function isPortalDocumentKind(value: string): value is PortalDocumentKind {
  return (portalDocumentKinds as readonly string[]).includes(value);
}

/** Where a member downloads a document; the route is the only reader. */
export function portalDocumentHref(kind: PortalDocumentKind, id: string): string {
  return `${portalRoot}/documenten/${kind}/${id}`;
}

export type PortalDocument = { fileName: string; pdf: Buffer };

/** Throws PortalDenied for anything that is not this customer's visible document; throws an Error when the file does not check out. */
export async function readPortalDocument(customerId: string, kind: PortalDocumentKind, id: string): Promise<PortalDocument> {
  const db = await portalReader();
  const rows = portalResult("Document laden", await db.rpc("portal_document", { p_customer_id: customerId, p_kind: kind, p_id: requireResourceId(id) }));
  const row = rows[0];
  if (!row) throw new Error("Document laden: geen antwoord");

  const artifact = await readInvoiceArtifact(
    db,
    { number: { value: row.number, provisional: false }, document: { path: row.path, sha256: row.sha256, bytes: row.bytes, generatedAt: row.generated_at } },
    kind === "quote" ? "offerte" : kind === "credit_note" ? "creditnota" : "factuur",
  );
  if (!artifact.ok) throw new Error(artifact.reason);

  return { fileName: `${row.number}.pdf`, pdf: artifact.pdf };
}
