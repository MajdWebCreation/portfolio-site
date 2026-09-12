import { beforeEach, describe, expect, it } from "vitest";
import { rateLimit, requestKey, resetRateLimits } from "@/lib/payments/rate-limit";

beforeEach(resetRateLimits);

describe("rate limiting the public routes", () => {
  it("allows up to the limit and refuses the next one", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i += 1) {
      expect(rateLimit("k", 5, 60, now).allowed).toBe(true);
    }
    const refused = rateLimit("k", 5, 60, now);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("starts over once the window has passed", () => {
    const now = 1_000_000;
    rateLimit("k", 1, 60, now);
    expect(rateLimit("k", 1, 60, now).allowed).toBe(false);
    expect(rateLimit("k", 1, 60, now + 61_000).allowed).toBe(true);
  });

  it("counts callers apart", () => {
    const now = 1_000_000;
    rateLimit("a", 1, 60, now);
    expect(rateLimit("b", 1, 60, now).allowed).toBe(true);
  });

  it("takes the first address from a forwarded chain", () => {
    const request = new Request("https://example.test", { headers: { "x-forwarded-for": "203.0.113.5, 70.41.3.18" } });
    expect(requestKey(request, "p")).toBe("p:203.0.113.5");
    expect(requestKey(new Request("https://example.test"), "p")).toBe("p:unknown");
  });
});
