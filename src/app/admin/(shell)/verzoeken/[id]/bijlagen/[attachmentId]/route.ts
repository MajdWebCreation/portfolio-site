import { NextResponse } from "next/server";
import { getAdminAccess } from "@/lib/admin/auth";
import { adminDb } from "@/lib/admin/db";
import { contentDisposition } from "@/lib/requests/model";

/**
 * A request's attachment, for the admin: read under the admin's own session,
 * whose row level security and storage policy decide. The attachment has to
 * belong to the request in the URL. Always a download, never sniffed, never
 * cached.
 */
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound(): NextResponse {
  return new NextResponse("Niet gevonden.", { status: 404, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const access = await getAdminAccess();
  if (access.state !== "admin") return notFound();
  const { id, attachmentId } = await params;
  if (!uuid.test(id) || !uuid.test(attachmentId)) return notFound();

  const db = await adminDb();
  const { data: attachment } = await db
    .from("customer_request_attachments")
    .select("storage_path, file_name, mime_type")
    .eq("id", attachmentId)
    .eq("request_id", id)
    .maybeSingle();
  if (!attachment) return notFound();

  const { data, error } = await db.storage.from("request-attachments").download(attachment.storage_path);
  if (error || !data) {
    console.error("Admin attachment could not be served", { attachmentId });
    return new NextResponse("De bijlage kon nu niet worden geladen.", { status: 503, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
  }
  const bytes = await data.arrayBuffer();
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      ...headers,
      "Content-Type": attachment.mime_type,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": contentDisposition(attachment.file_name, false),
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
