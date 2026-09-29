import { isGoogleAvatarUrl } from "@/lib/google/places";
import { rateLimit, requestKey } from "@/lib/payments/rate-limit";

/*
  A review author's avatar, relayed. Loading it straight from Google would
  hand every visitor's address to Google before any consent; relaying keeps
  the request between the site and Google. Only Google's avatar host is
  accepted, nothing is stored, and the image is passed on as it came.
*/
export const dynamic = "force-dynamic";

const maxBytes = 512 * 1024;

export async function GET(request: Request): Promise<Response> {
  const limit = rateLimit(requestKey(request, "google-avatar"), 60, 60);
  if (!limit.allowed) return new Response(null, { status: 429 });

  const src = new URL(request.url).searchParams.get("src") ?? "";
  if (!isGoogleAvatarUrl(src)) return new Response(null, { status: 400 });

  try {
    const upstream = await fetch(src, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    const type = upstream.headers.get("content-type") ?? "";

    /* A redirect is followed, but must still land on Google's avatar host. */
    if (!upstream.ok || !type.startsWith("image/") || !isGoogleAvatarUrl(upstream.url || src)) {
      return new Response(null, { status: 502 });
    }

    const image = await upstream.arrayBuffer();
    if (image.byteLength > maxBytes) return new Response(null, { status: 502 });

    return new Response(image, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
