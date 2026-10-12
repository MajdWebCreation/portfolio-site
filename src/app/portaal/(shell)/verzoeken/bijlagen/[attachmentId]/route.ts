import { NextResponse } from "next/server";
import { getPortalAccess } from "@/lib/portal/auth";
import { readRequestAttachment } from "@/lib/portal/privileged";
import { PortalDenied } from "@/lib/portal/rpc";
import { contentDisposition } from "@/lib/requests/model";

/**
 * A request's attachment, for a member of its customer. The member's own
 * session asks the database whether it is theirs; only then is the object
 * read, on the server -- members have no read on the bucket themselves;
 * anything else -- another customer's, an unknown id, a malformed one --
 * is the same 404. Always a download, never rendered as a page here, under
 * the stored type and never sniffed, and never cached.
 */
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };

function notFound(): NextResponse {
  return new NextResponse("Niet gevonden.", { status: 404, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  const access = await getPortalAccess();
  if (access.state !== "member") return notFound();
  const { attachmentId } = await params;

  try {
    const file = await readRequestAttachment({ customerId: access.member.current.customerId }, attachmentId);
    return new NextResponse(file.bytes, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": file.mimeType,
        "Content-Length": String(file.bytes.byteLength),
        "Content-Disposition": contentDisposition(file.fileName, false),
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof PortalDenied) return notFound();
    console.error("Portal attachment could not be served", { attachmentId, error: error instanceof Error ? error.message : error });
    return new NextResponse("De bijlage kon nu niet worden geladen.", { status: 503, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
  }
}
