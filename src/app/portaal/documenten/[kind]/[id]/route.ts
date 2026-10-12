import { NextResponse } from "next/server";
import { getPortalAccess } from "@/lib/portal/auth";
import { isPortalDocumentKind } from "@/lib/portal/documents/read";
import { readPortalDocumentFile } from "@/lib/portal/privileged";
import { PortalDenied } from "@/lib/portal/rpc";

/**
 * The stored PDF of an invoice, credit note or quote, for a portal member.
 *
 * The member's own session decides whether the document is theirs
 * (portal_document); only then does the privileged boundary read that one
 * object, and the bytes are checked against the recorded hash. Members hold
 * no read on the bucket, so there is no signed URL to outlive their access.
 * Anything the member may not have -- another customer's document, a
 * concept, an unknown id, a malformed kind -- gets the same 404. Never
 * cached: a revoked member must not find yesterday's copy anywhere between
 * here and the browser.
 */
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" };

function notFound(): NextResponse {
  return new NextResponse("Niet gevonden.", { status: 404, headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const access = await getPortalAccess();
  if (access.state !== "member") return notFound();

  const { kind, id } = await params;
  if (!isPortalDocumentKind(kind)) return notFound();

  try {
    const document = await readPortalDocumentFile({ customerId: access.member.current.customerId }, kind, id);
    return new NextResponse(new Uint8Array(document.pdf), {
      status: 200,
      headers: {
        ...noStore,
        "Content-Type": "application/pdf",
        "Content-Length": String(document.pdf.byteLength),
        "Content-Disposition": `attachment; filename="${document.fileName.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      },
    });
  } catch (error) {
    if (error instanceof PortalDenied) return notFound();
    console.error("Portal document could not be served", { kind, id, error: error instanceof Error ? error.message : error });
    return new NextResponse("Het document kon nu niet worden geladen. Probeer het later opnieuw.", {
      status: 503,
      headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
