import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The proxy decides one thing: does this request carry a session? These tests
 * pin down how it gets that answer -- locally verified claims first, the Auth
 * server only when that cannot answer -- and that it never decides more.
 */

type Claims = { data: { claims: { sub: string } } | null; error: { message: string } | null };

type Fake = {
  claims: () => Promise<Claims>;
  user: { id: string } | null;
  /** Simulates a refresh during getClaims(): the SSR client hands new cookies to setAll. */
  rotates?: { name: string; value: string }[];
};

const calls = { getClaims: 0, getUser: 0, from: 0 };
let fake: Fake;

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (c: unknown[]) => void } }) => ({
    auth: {
      getClaims: async () => {
        calls.getClaims += 1;
        if (fake.rotates) {
          options.cookies.setAll(fake.rotates.map((cookie) => ({ ...cookie, options: { path: "/" } })));
        }
        return fake.claims();
      },
      getUser: async () => {
        calls.getUser += 1;
        return { data: { user: fake.user }, error: fake.user ? null : { message: "invalid token" } };
      },
    },
    from: () => {
      calls.from += 1;
      throw new Error("the proxy must not query tables");
    },
  }),
}));

const { updateAdminSession } = await import("@/lib/supabase/session");

const verified: Claims = { data: { claims: { sub: "user-1" } }, error: null };
const noSession: Claims = { data: null, error: null };
const rejected: Claims = { data: null, error: { message: "invalid JWT signature" } };

function request(path: string, options: { cookie?: boolean; prefetch?: boolean } = {}) {
  const headers = new Headers();
  if (options.cookie !== false) headers.set("cookie", "sb-test-auth-token=base64-abc");
  if (options.prefetch) {
    headers.set("RSC", "1");
    headers.set("Next-Router-Prefetch", "1");
  }
  return new NextRequest(`https://admin.test${path}`, { headers });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  calls.getClaims = 0;
  calls.getUser = 0;
  calls.from = 0;
  fake = { claims: async () => verified, user: { id: "user-1" } };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("updateAdminSession", () => {
  it("lets a verified session through without asking the Auth server", async () => {
    const response = await updateAdminSession(request("/admin/klanten"));

    expect(response.status).toBe(200);
    expect(calls.getClaims).toBe(1);
    expect(calls.getUser).toBe(0);
  });

  it("does the same for a prefetch request", async () => {
    const response = await updateAdminSession(request("/admin/facturen", { prefetch: true }));

    expect(response.status).toBe(200);
    expect(calls.getUser).toBe(0);
  });

  it("sends a request without a cookie to the login page, without a round trip", async () => {
    fake = { claims: async () => noSession, user: null };

    const response = await updateAdminSession(request("/admin/projecten", { cookie: false }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://admin.test/admin/login");
    expect(calls.getUser).toBe(0);
  });

  it("falls back to the Auth server when the claims are rejected, and then refuses", async () => {
    fake = { claims: async () => rejected, user: null };

    const response = await updateAdminSession(request("/admin/betalingen"));

    expect(calls.getUser).toBe(1);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://admin.test/admin/login");
  });

  it("falls back to the Auth server when verification itself fails, and accepts its answer", async () => {
    fake = {
      claims: async () => {
        throw new Error("fetch failed: jwks.json");
      },
      user: { id: "user-1" },
    };

    const response = await updateAdminSession(request("/admin"));

    expect(calls.getUser).toBe(1);
    expect(response.status).toBe(200);
  });

  it("persists a refreshed session on the response", async () => {
    fake = { claims: async () => verified, user: null, rotates: [{ name: "sb-test-auth-token", value: "base64-new" }] };

    const response = await updateAdminSession(request("/admin/klanten"));

    expect(response.status).toBe(200);
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("base64-new");
  });

  it("drops the query string when redirecting", async () => {
    fake = { claims: async () => noSession, user: null };

    const response = await updateAdminSession(request("/admin/klanten?next=https://elsewhere.test", { cookie: false }));

    expect(response.headers.get("location")).toBe("https://admin.test/admin/login");
  });

  it("leaves the login page reachable without a session", async () => {
    fake = { claims: async () => noSession, user: null };

    const response = await updateAdminSession(request("/admin/login", { cookie: false }));

    expect(response.status).toBe(200);
  });

  it("never consults a table: being signed in is all it decides", async () => {
    await updateAdminSession(request("/admin/klanten"));
    expect(calls.from).toBe(0);
  });
});
