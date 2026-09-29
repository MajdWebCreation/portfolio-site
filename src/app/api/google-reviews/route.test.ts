import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/payments/rate-limit";

const fetchPlaceReviews = vi.fn();
vi.mock("@/lib/google/places", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/google/places")>()),
  fetchPlaceReviews,
}));

const { GET } = await import("@/app/api/google-reviews/route");
const { GET: getAvatar } = await import("@/app/api/google-reviews/avatar/route");

const request = (url: string, ip = "203.0.113.1") =>
  new Request(url, { headers: { "x-forwarded-for": ip } });

beforeEach(() => {
  resetRateLimits();
  fetchPlaceReviews.mockReset();
});

describe("GET /api/google-reviews", () => {
  it("hands over the reviews with avatars on the site's relay, never cached", async () => {
    fetchPlaceReviews.mockResolvedValue({
      placeName: "YM Creations",
      rating: 5,
      ratingCount: 3,
      placeUri: "https://maps.google.com/?cid=1",
      reviews: [
        {
          authorName: "A",
          authorUri: null,
          authorPhotoUri: "https://lh3.googleusercontent.com/a/x",
          rating: 5,
          text: "Goed",
          relativeTime: null,
          reviewUri: null,
          flagUri: null,
        },
      ],
    });

    const response = await GET(request("https://ymcreations.com/api/google-reviews?locale=en"));
    const body = await response.json();

    expect(fetchPlaceReviews).toHaveBeenCalledWith("en");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.available).toBe(true);
    expect(body.reviews[0].authorPhotoUri).toBe(
      "/api/google-reviews/avatar?src=https%3A%2F%2Flh3.googleusercontent.com%2Fa%2Fx",
    );
    expect(JSON.stringify(body)).not.toMatch(/key/i);
  });

  it("says unavailable when Google gives nothing, so the block stays away", async () => {
    fetchPlaceReviews.mockResolvedValue(null);
    const response = await GET(request("https://ymcreations.com/api/google-reviews"));

    expect(fetchPlaceReviews).toHaveBeenCalledWith("nl");
    expect(await response.json()).toEqual({ available: false });
  });

  it("stops a caller that loops it", async () => {
    fetchPlaceReviews.mockResolvedValue(null);
    for (let index = 0; index < 20; index += 1) await GET(request("https://ymcreations.com/api/google-reviews"));

    const response = await GET(request("https://ymcreations.com/api/google-reviews"));
    expect(response.status).toBe(429);
    expect(fetchPlaceReviews).toHaveBeenCalledTimes(20);
  });
});

describe("GET /api/google-reviews/avatar", () => {
  it("refuses anything but Google's avatar host, without fetching it", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    for (const src of ["https://example.com/a.png", "http://lh3.googleusercontent.com/a", ""]) {
      const response = await getAvatar(
        request(`https://ymcreations.com/api/google-reviews/avatar?src=${encodeURIComponent(src)}`),
      );
      expect(response.status).toBe(400);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("relays an image from Google without letting it be cached", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Object.defineProperty(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }), "url", {
        value: "https://lh3.googleusercontent.com/a/x",
      }),
    );

    const response = await getAvatar(
      request(`https://ymcreations.com/api/google-reviews/avatar?src=${encodeURIComponent("https://lh3.googleusercontent.com/a/x")}`),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
    fetchSpy.mockRestore();
  });

  it("refuses what is not an image", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Object.defineProperty(new Response("<html>", { headers: { "content-type": "text/html" } }), "url", {
        value: "https://lh3.googleusercontent.com/a/x",
      }),
    );
    const response = await getAvatar(
      request(`https://ymcreations.com/api/google-reviews/avatar?src=${encodeURIComponent("https://lh3.googleusercontent.com/a/x")}`),
    );
    expect(response.status).toBe(502);
    fetchSpy.mockRestore();
  });
});
