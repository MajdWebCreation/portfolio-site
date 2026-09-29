import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* The options handed to Supabase, captured instead of opening a client. */
const createClient = vi.fn<(...args: unknown[]) => object>(() => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const { createSupabasePublicClient } = await import("@/lib/supabase/public");

type ClientOptions = { global?: { fetch?: typeof fetch } };
const passedOptions = () => createClient.mock.calls.at(-1)![2] as ClientOptions;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  createClient.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("createSupabasePublicClient", () => {
  it("puts every query in the data cache for the given number of seconds", async () => {
    const fetchMock = vi.fn<(...args: unknown[]) => Promise<Response>>(async () => new Response("[]"));
    vi.stubGlobal("fetch", fetchMock);

    createSupabasePublicClient({ revalidate: 3600 });
    const wrapped = passedOptions().global?.fetch;
    expect(wrapped).toBeTypeOf("function");

    await wrapped!("https://example.supabase.co/rest/v1/pricing_packages", {
      method: "GET",
      headers: { apikey: "sb_publishable_test" },
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { next?: unknown }];
    expect(url).toBe("https://example.supabase.co/rest/v1/pricing_packages");
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({ apikey: "sb_publishable_test" });
    expect(init.next).toEqual({ revalidate: 3600 });
  });

  it("leaves Next's defaults alone without the option", () => {
    createSupabasePublicClient();
    expect(passedOptions().global).toBeUndefined();
  });
});
