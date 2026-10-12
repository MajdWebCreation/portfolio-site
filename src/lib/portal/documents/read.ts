import { portalRoot } from "@/lib/portal/paths";
import { portalReader, portalResult, requireResourceId } from "@/lib/portal/rpc";

/**
 * A stored PDF, for a member.
 *
 * portal_document, under the member's own session, says whether this
 * document is the customer's and visible, and where it is stored. The bytes
 * are then read by the portal's privileged boundary (readPortalDocumentFile
 * in privileged.ts) on the system client, for exactly that object: members
 * hold no read on the bucket at all, so no member can sign a URL to a
 * document that outlives their access. The path never leaves the server.
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

export type PortalDocumentRecord = { number: string; path: string; sha256: string; bytes: number; generatedAt: string };

/** Where this customer's visible document is stored. Throws PortalDenied for anything else. */
export async function readPortalDocumentRecord(customerId: string, kind: PortalDocumentKind, id: string): Promise<PortalDocumentRecord> {
  const db = await portalReader();
  const rows = portalResult("Document laden", await db.rpc("portal_document", { p_customer_id: customerId, p_kind: kind, p_id: requireResourceId(id) }));
  const row = rows[0];
  if (!row) throw new Error("Document laden: geen antwoord");
  return { number: row.number, path: row.path, sha256: row.sha256, bytes: row.bytes, generatedAt: row.generated_at };
}
