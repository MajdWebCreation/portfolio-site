import { afterEach, describe, expect, it, vi } from "vitest";
import {
  avatarProxyPath,
  fetchPlaceReviews,
  isGoogleAvatarUrl,
  maxReviews,
  placeFieldMask,
  placesConfig,
  reviewsFromPlace,
} from "@/lib/google/places";

const review = (name: string, text: string | null, extra: Record<string, unknown> = {}) => ({
  rating: 5,
  relativePublishTimeDescription: "2 weken geleden",
  ...(text === null ? {} : { originalText: { text, languageCode: "nl" }, text: { text: `vertaald: ${text}` } }),
  authorAttribution: {
    displayName: name,
    uri: `https://www.google.com/maps/contrib/${name}`,
    photoUri: `https://lh3.googleusercontent.com/a/${name}=s128`,
  },
  googleMapsUri: `https://www.google.com/maps/reviews/${name}`,
  flagContentUri: `https://www.google.com/local/review/rap/report?${name}`,
  ...extra,
});

const place = {
  displayName: { text: "YM Creations", languageCode: "nl" },
  rating: 4.9,
  userRatingCount: 12,
  googleMapsUri: "https://maps.google.com/?cid=1",
  reviews: [review("a", "Heel fijn"), review("b", null), review("c", "Snel en duidelijk"), review("d", "Top"), review("e", "Aanrader")],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("placesConfig", () => {
  it("needs both the key and a well-formed place ID", () => {
    expect(placesConfig({})).toBeNull();
    expect(placesConfig({ GOOGLE_PLACES_API_KEY: "k" })).toBeNull();
    expect(placesConfig({ GOOGLE_PLACES_API_KEY: "k", GOOGLE_PLACE_ID: "../../etc" })).toBeNull();
    expect(placesConfig({ GOOGLE_PLACES_API_KEY: " k ", GOOGLE_PLACE_ID: "ChIJN1t_tDeuEmsRUsoyG83frY4" })).toEqual({
      apiKey: "k",
      placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
    });
  });
});

describe("reviewsFromPlace", () => {
  it("keeps Google's order, skips reviews without text and stops at the limit", () => {
    const result = reviewsFromPlace(place)!;
    expect(result.reviews.map((item) => item.authorName)).toEqual(["a", "c", "d"]);
    expect(result.reviews).toHaveLength(maxReviews);
  });

  it("shows the author's own words, not Google's translation", () => {
    expect(reviewsFromPlace(place)!.reviews[0].text).toBe("Heel fijn");
  });

  it("keeps every attribution field Google provides", () => {
    expect(reviewsFromPlace(place)!.reviews[0]).toEqual({
      authorName: "a",
      authorUri: "https://www.google.com/maps/contrib/a",
      authorPhotoUri: "https://lh3.googleusercontent.com/a/a=s128",
      rating: 5,
      text: "Heel fijn",
      relativeTime: "2 weken geleden",
      reviewUri: "https://www.google.com/maps/reviews/a",
      flagUri: "https://www.google.com/local/review/rap/report?a",
    });
  });

  it("carries the place rating and count", () => {
    expect(reviewsFromPlace(place)).toMatchObject({
      placeName: "YM Creations",
      rating: 4.9,
      ratingCount: 12,
      placeUri: "https://maps.google.com/?cid=1",
    });
  });

  it("drops links that are not https rather than passing them on", () => {
    const result = reviewsFromPlace({ reviews: [review("x", "Goed", { googleMapsUri: "javascript:alert(1)" })] })!;
    expect(result.reviews[0].reviewUri).toBeNull();
  });

  it("returns fewer reviews when Google has fewer, and nothing when there is nothing", () => {
    expect(reviewsFromPlace({ rating: 5, reviews: [review("a", "Goed")] })!.reviews).toHaveLength(1);
    expect(reviewsFromPlace({})).toBeNull();
    expect(reviewsFromPlace({ reviews: [review("b", null)] })).toBeNull();
    expect(reviewsFromPlace("nonsense")).toBeNull();
  });
});

describe("fetchPlaceReviews", () => {
  const config = { apiKey: "secret-key", placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4" };

  it("asks for the place with only the needed fields, uncached", async () => {
    const fetchMock = vi.fn<(...args: unknown[]) => Promise<Response>>(async () => Response.json(place));
    const result = await fetchPlaceReviews("nl", config, fetchMock as unknown as typeof fetch);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places/ChIJN1t_tDeuEmsRUsoyG83frY4?languageCode=nl");
    expect(init.headers).toEqual({ "X-Goog-Api-Key": "secret-key", "X-Goog-FieldMask": placeFieldMask });
    expect(placeFieldMask).toBe("displayName,rating,userRatingCount,googleMapsUri,reviews");
    expect(init.cache).toBe("no-store");
    expect(result?.reviews).toHaveLength(3);
  });

  it("gives nothing, and never throws, when Google fails or is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = vi.fn(async () => new Response("quota", { status: 429 }));
    const offline = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(fetchPlaceReviews("nl", config, failing as unknown as typeof fetch)).resolves.toBeNull();
    await expect(fetchPlaceReviews("nl", config, offline as unknown as typeof fetch)).resolves.toBeNull();
  });

  it("makes no request without configuration", async () => {
    const fetchMock = vi.fn();
    await expect(fetchPlaceReviews("nl", null, fetchMock as unknown as typeof fetch)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("avatars", () => {
  it("accepts Google's avatar host only", () => {
    expect(isGoogleAvatarUrl("https://lh3.googleusercontent.com/a/x=s128")).toBe(true);
    expect(isGoogleAvatarUrl("http://lh3.googleusercontent.com/a/x")).toBe(false);
    expect(isGoogleAvatarUrl("https://googleusercontent.com.evil.example/a")).toBe(false);
    expect(isGoogleAvatarUrl("https://example.com/?u=googleusercontent.com")).toBe(false);
    expect(isGoogleAvatarUrl("not a url")).toBe(false);
  });

  it("points the browser at the site's own relay", () => {
    expect(avatarProxyPath("https://lh3.googleusercontent.com/a/x=s128")).toBe(
      "/api/google-reviews/avatar?src=https%3A%2F%2Flh3.googleusercontent.com%2Fa%2Fx%3Ds128",
    );
  });
});
