import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
  The live check runs against a key that moves real money. "It only reads" is
  therefore not a thing to promise in a comment -- it has to be observable at
  the one place every Mollie request passes through: `fetch`.

  So these tests replace `fetch` itself, run the real action, and look at what
  actually went over the wire. Nothing is stubbed between the action and the
  network, which is what makes the assertions worth anything.
*/
const requireAdminAccess = vi.fn(async () => {});
vi.mock("@/lib/admin/access", () => ({
  requireAdminAccess: () => requireAdminAccess(),
  requireAdmin: () => requireAdminAccess(),
}));

const { runMollieLiveCheck } = await import("@/lib/payments/live-check-actions");
const { createPayment } = await import("@/lib/mollie/client");

type Call = { url: string; method: string; body: unknown; headers: Record<string, string> };

let calls: Call[];

/** Mollie's answers, in the shape the documented endpoints return them. */
function respond(url: string): unknown {
  if (url.includes("/profiles/me")) {
    return { resource: "profile", id: "pfl_v9hTwCvYqw", mode: "live", name: "YM Creations", status: "verified" };
  }
  if (url.includes("/methods/all")) {
    return {
      _embedded: {
        methods: [
          { resource: "method", id: "ideal", description: "iDEAL", status: "activated" },
          { resource: "method", id: "directdebit", description: "SEPA Direct Debit", status: "activated" },
        ],
      },
    };
  }
  if (url.includes("sequenceType=recurring")) {
    return { _embedded: { methods: [{ resource: "method", id: "directdebit", description: "SEPA Direct Debit" }] } };
  }
  if (url.includes("sequenceType=first")) {
    return { _embedded: { methods: [{ resource: "method", id: "ideal", description: "iDEAL" }] } };
  }
  return {};
}

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  process.env.MOLLIE_API_KEY = "live_dummy_key_for_tests";
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";

  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    calls.push({
      url: String(url),
      method: init.method ?? "GET",
      body: init.body,
      headers: (init.headers ?? {}) as Record<string, string>,
    });
    return new Response(JSON.stringify(respond(String(url))), { status: 200 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MOLLIE_API_KEY;
  delete process.env.PAYMENT_RETURN_SECRET;
});

describe("the live check is read-only", () => {
  it("issues nothing but GET", async () => {
    await runMollieLiveCheck();

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.method).toBe("GET");
    }
    expect(calls.map((call) => call.method)).toEqual(["GET", "GET", "GET", "GET"]);
  });

  it("sends no request body and no idempotency key", async () => {
    await runMollieLiveCheck();

    for (const call of calls) {
      expect(call.body).toBeUndefined();
      expect(call.headers["Idempotency-Key"]).toBeUndefined();
    }
  });

  /*
    The endpoints, spelled out. If someone later points this at a different
    path, that is a decision that should have to be made on purpose.
  */
  it("touches only the four documented read endpoints", async () => {
    await runMollieLiveCheck();

    expect(calls.map((call) => call.url).sort()).toEqual([
      "https://api.mollie.com/v2/methods/all",
      "https://api.mollie.com/v2/methods?sequenceType=first",
      "https://api.mollie.com/v2/methods?sequenceType=recurring",
      "https://api.mollie.com/v2/profiles/me",
    ]);
  });

  /* None of the write endpoints, named one by one. */
  it("never reaches a resource that would create or change anything", async () => {
    await runMollieLiveCheck();

    const urls = calls.map((call) => call.url).join(" ");
    for (const path of ["/payments", "/payment-links", "/customers", "/subscriptions", "/mandates", "/refunds"]) {
      expect(urls).not.toContain(path);
    }
  });

  /*
    Proof that the assertions above are not vacuous: the same fetch spy does
    catch a write, so "all GET" means the check made none.
  */
  it("detects a write when one is actually made", async () => {
    await createPayment({
      amountCents: 1,
      description: "control",
      redirectUrl: "https://example.test/nl",
      webhookUrl: "https://example.test/api/mollie/webhook",
      metadata: {},
      idempotencyKey: "control",
    });

    expect(calls.map((call) => call.method)).toEqual(["POST"]);
    expect(calls[0]?.body).toBeDefined();
  });
});

describe("what the live check reports", () => {
  it("summarises a healthy live account", async () => {
    const result = await runMollieLiveCheck();

    expect(result).toMatchObject({
      keyValid: true,
      profileName: "YM Creations",
      profileMatchesCompany: true,
      mode: "live",
      ideal: { activated: true, usable: true },
      directDebit: { activated: true, usable: true },
      blockers: [],
    });
  });

  it("requires an admin before anything is asked of Mollie", async () => {
    await runMollieLiveCheck();
    expect(requireAdminAccess).toHaveBeenCalledTimes(1);
  });

  /* A test key answers about the test account, which says nothing about live. */
  it("refuses on a test key, without calling Mollie at all", async () => {
    process.env.MOLLIE_API_KEY = "test_dummy";

    const result = await runMollieLiveCheck();

    expect(result).toMatchObject({ keyValid: false });
    expect(calls).toHaveLength(0);
  });

  it("refuses when Mollie is not configured, without calling Mollie at all", async () => {
    delete process.env.MOLLIE_API_KEY;

    const result = await runMollieLiveCheck();

    expect(result).toMatchObject({ keyValid: false });
    expect(calls).toHaveLength(0);
  });

  /* A rejected key is a different problem from an account that is not ready. */
  it("says the key itself was refused on a 401", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ detail: "Unauthorized" }), { status: 401 }));

    const result = await runMollieLiveCheck();

    expect(result).toMatchObject({ keyValid: false });
    if (!result.keyValid) expect(result.reason).toContain("accepteert deze sleutel niet");
  });

  it("never puts the key in the reason it reports", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ detail: "Something went wrong" }), { status: 422 }));

    const result = await runMollieLiveCheck();

    expect(result.keyValid).toBe(false);
    if (!result.keyValid) expect(result.reason).not.toContain("live_dummy_key_for_tests");
  });
});
