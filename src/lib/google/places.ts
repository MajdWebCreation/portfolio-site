import type { Locale } from "@/lib/content/site-content";

/**
 * YM Creations' own Google reviews, from the Places API (New).
 *
 * Server-side only: the API key is read from a non-public environment
 * variable, so Next never inlines it into a browser bundle, and the only
 * thing that leaves the server is the parsed result below.
 *
 * Nothing here is cached or stored. Google's service terms allow keeping the
 * place ID indefinitely and latitude/longitude for 30 days; reviews, ratings
 * and names have no such exception. So every call is a live request
 * (`cache: "no-store"`), and the place ID is the one value kept, as
 * configuration.
 */

const placesEndpoint = "https://places.googleapis.com/v1/places";

/**
 * Only what the review block shows. `reviews` returns each review's text,
 * rating, relative date, author attribution and its Google Maps and report
 * links, which the attribution rules require.
 */
export const placeFieldMask = "displayName,rating,userRatingCount,googleMapsUri,reviews";

/** How many reviews the block shows, at most. */
export const maxReviews = 3;

/* Place IDs are URL-safe tokens; anything else never reaches the request path. */
const placeIdPattern = /^[A-Za-z0-9_-]{10,}$/;

export type PlacesConfig = { apiKey: string; placeId: string };

/** Both values, or `null` when the reviews are not configured (the block then stays off). */
export function placesConfig(env: Record<string, string | undefined> = process.env): PlacesConfig | null {
  const apiKey = env.GOOGLE_PLACES_API_KEY?.trim();
  const placeId = env.GOOGLE_PLACE_ID?.trim();

  if (!apiKey || !placeId || !placeIdPattern.test(placeId)) return null;
  return { apiKey, placeId };
}

export type PlaceReview = {
  authorName: string;
  /** The author's Google Maps profile. */
  authorUri: string | null;
  /** The author's avatar, as Google hosts it. */
  authorPhotoUri: string | null;
  rating: number | null;
  /** The review in the author's own words. */
  text: string;
  /** "2 weken geleden", in the requested language. */
  relativeTime: string | null;
  /** The review itself on Google Maps. */
  reviewUri: string | null;
  /** Where a visitor reports the review to Google. */
  flagUri: string | null;
};

export type PlaceReviews = {
  placeName: string | null;
  rating: number | null;
  ratingCount: number | null;
  /** The place on Google Maps. */
  placeUri: string | null;
  /** In Google's order (relevance), without reviews that carry no text. */
  reviews: PlaceReview[];
};

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null;
const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const https = (value: unknown) => {
  const url = str(value);
  return url && url.startsWith("https://") ? url : null;
};
const textOf = (value: unknown) => (isObject(value) ? str(value.text) : null);

/**
 * A Places response as the block uses it. Defensive: a field that is missing
 * or of the wrong type is left out rather than guessed. Reviews keep Google's
 * order; one without text or without an author is skipped, never rewritten.
 */
export function reviewsFromPlace(body: unknown, limit = maxReviews): PlaceReviews | null {
  if (!isObject(body)) return null;

  const reviews: PlaceReview[] = [];
  for (const raw of Array.isArray(body.reviews) ? body.reviews : []) {
    if (reviews.length >= limit) break;
    if (!isObject(raw)) continue;

    const author = isObject(raw.authorAttribution) ? raw.authorAttribution : {};
    const authorName = str(author.displayName);
    /* The original wording first; `text` may be Google's translation of it. */
    const text = textOf(raw.originalText) ?? textOf(raw.text);
    if (!authorName || !text) continue;

    reviews.push({
      authorName,
      authorUri: https(author.uri),
      authorPhotoUri: https(author.photoUri),
      rating: num(raw.rating),
      text,
      relativeTime: str(raw.relativePublishTimeDescription),
      reviewUri: https(raw.googleMapsUri),
      flagUri: https(raw.flagContentUri),
    });
  }

  const result: PlaceReviews = {
    placeName: textOf(body.displayName),
    rating: num(body.rating),
    ratingCount: num(body.userRatingCount),
    placeUri: https(body.googleMapsUri),
    reviews,
  };

  /* Nothing to show is not a result. */
  return result.rating === null && reviews.length === 0 ? null : result;
}

/**
 * One live Places request. `null` when not configured or on any failure: the
 * page never depends on it, it only leaves the block out.
 */
export async function fetchPlaceReviews(
  locale: Locale,
  config: PlacesConfig | null = placesConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<PlaceReviews | null> {
  if (!config) return null;

  const url = `${placesEndpoint}/${config.placeId}?languageCode=${locale}`;

  try {
    const response = await fetchImpl(url, {
      headers: { "X-Goog-Api-Key": config.apiKey, "X-Goog-FieldMask": placeFieldMask },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.error(`Google-reviews laden: HTTP ${response.status}`);
      return null;
    }

    return reviewsFromPlace(await response.json());
  } catch (error) {
    console.error(`Google-reviews laden: ${error instanceof Error ? error.message : "onbekende fout"}`);
    return null;
  }
}

/* ---------- Author avatars ---------- */

/**
 * The avatar hosts Places hands out. The browser never loads these directly,
 * so a visitor's address does not reach Google without consent (see the
 * privacy statement); the site relays the image, see the avatar route.
 */
export function isGoogleAvatarUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "googleusercontent.com" || url.hostname.endsWith(".googleusercontent.com"));
  } catch {
    return false;
  }
}

export const avatarRoute = "/api/google-reviews/avatar";

export function avatarProxyPath(photoUri: string): string {
  return `${avatarRoute}?src=${encodeURIComponent(photoUri)}`;
}
