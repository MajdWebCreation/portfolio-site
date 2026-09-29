import { avatarProxyPath, fetchPlaceReviews, type PlaceReviews } from "@/lib/google/places";
import { rateLimit, requestKey } from "@/lib/payments/rate-limit";

/*
  The Google reviews for the review block, fetched live on every call. The
  API key stays on the server; the browser gets the parsed reviews with each
  avatar pointed at the site's own relay.

  No caching anywhere: Google's terms allow storing the place ID, not the
  reviews or the rating, so the response says `no-store` to the browser and
  to Vercel's edge alike.
*/
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

export type ReviewsResponse = ({ available: true } & PlaceReviews) | { available: false };

export async function GET(request: Request): Promise<Response> {
  /* A page view makes one call; this only stops someone looping it against the quota. */
  const limit = rateLimit(requestKey(request, "google-reviews"), 20, 60);
  if (!limit.allowed) {
    return Response.json({ available: false } satisfies ReviewsResponse, {
      status: 429,
      headers: { ...noStore, "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  const locale = new URL(request.url).searchParams.get("locale") === "en" ? "en" : "nl";
  const place = await fetchPlaceReviews(locale);

  if (!place) {
    return Response.json({ available: false } satisfies ReviewsResponse, { headers: noStore });
  }

  const body: ReviewsResponse = {
    available: true,
    ...place,
    reviews: place.reviews.map((review) => ({
      ...review,
      authorPhotoUri: review.authorPhotoUri ? avatarProxyPath(review.authorPhotoUri) : null,
    })),
  };

  return Response.json(body, { headers: noStore });
}
