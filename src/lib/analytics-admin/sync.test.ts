import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetGoogleTokenSources } from "@/lib/analytics-admin/google-auth";
import { executeAnalyticsSync, providerConfigStatus } from "@/lib/analytics-admin/sync";
import type { FactsStore } from "@/lib/analytics-admin/types";

/*
  The whole path from environment to summary, with one fake fetch standing
  in for Google's token endpoint, the two Google APIs and Bing. Nothing
  leaves the process; the tests read which hosts were asked.
*/
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const google = { GOOGLE_SERVICE_ACCOUNT_EMAIL: "reader@ym-creations.iam.gserviceaccount.com", GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: Buffer.from(privateKey).toString("base64") };
const ga4 = { GA4_PROPERTY_ID: "123456789" };
const gsc = { GSC_SITE_URL: "sc-domain:ymcreations.com" };
const bing = { BING_WEBMASTER_API_KEY: "0123456789abcdef0123456789abcdef", BING_SITE_URL: "https://ymcreations.com/" };

/* A Tuesday: the weekly reports are not due, so the counts stay small. */
const now = new Date("2026-09-22T06:00:00Z");
const day = "2026-09-21";

function fakeProviders(options: { refuse?: "token" | "gsc" | "bing" } = {}) {
  const hosts: string[] = [];
  const doFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    hosts.push(url.host);
    if (url.host === "oauth2.googleapis.com") {
      if (options.refuse === "token") return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
    }
    if (url.host === "analyticsdata.googleapis.com") {
      if (url.pathname.endsWith(":checkCompatibility")) return new Response(JSON.stringify({}), { status: 200 });
      return new Response(JSON.stringify({ rows: [], rowCount: 0 }), { status: 200 });
    }
    if (url.host === "www.googleapis.com") {
      if (options.refuse === "gsc") return new Response("{}", { status: 403 });
      const dimensions = (JSON.parse(String(init?.body)) as { dimensions: string[] }).dimensions;
      const keys = dimensions.map((dimension) => (dimension === "date" ? day : `value-${dimension}`));
      return new Response(JSON.stringify({ rows: [{ keys, clicks: 2, impressions: 30, ctr: 0.066, position: 6 }] }), { status: 200 });
    }
    if (url.host === "ssl.bing.com") {
      if (options.refuse === "bing") return new Response(JSON.stringify({ ErrorCode: 3, Message: "Invalid API key" }), { status: 400 });
      return new Response(JSON.stringify({ d: [{ Clicks: 1, Impressions: 9, Date: `/Date(${Date.parse(`${day}T07:00:00Z`)}-0700)/` }] }), { status: 200 });
    }
    return new Response("unexpected host", { status: 599 });
  });
  return { hosts, fetch: doFetch as unknown as typeof fetch };
}

function spyStore(): FactsStore & { calls: string[] } {
  const calls: string[] = [];
  let id = 0;
  return {
    calls,
    upsert: async (rows) => {
      calls.push("upsert");
      return rows.length;
    },
    deleteStale: async () => {
      calls.push("deleteStale");
      return 0;
    },
    startRun: async () => {
      calls.push("startRun");
      id += 1;
      return `run-${id}`;
    },
    finishRun: async () => {
      calls.push("finishRun");
    },
    failStaleRuns: async () => {
      calls.push("failStaleRuns");
      return 0;
    },
    deleteOlderThan: async () => {
      calls.push("deleteOlderThan");
      return 0;
    },
  };
}

beforeEach(() => resetGoogleTokenSources());

describe("executeAnalyticsSync", () => {
  it("runs Search Console and Bing without a GA4 property, in a dry run that writes nothing", async () => {
    const api = fakeProviders();
    const outcome = await executeAnalyticsSync({ env: { ...google, ...gsc, ...bing }, fetch: api.fetch, now });
    if (!outcome.ok) throw new Error("expected a run");

    expect(outcome.summary.mode).toBe("dry-run");
    expect(outcome.summary.providers).toEqual([
      { provider: "ga4", health: "not_configured", missing: ["GA4_PROPERTY_ID"] },
      { provider: "gsc", health: "ok" },
      { provider: "bing", health: "ok" },
      { provider: "clarity", health: "not_configured", missing: ["CLARITY_API_TOKEN"] },
    ]);
    expect(api.hosts).not.toContain("analyticsdata.googleapis.com");
    expect(api.hosts).toContain("www.googleapis.com");
    expect(api.hosts).toContain("ssl.bing.com");
    expect(outcome.summary.results.find((r) => r.report === "gsc.totals")).toMatchObject({ status: "ok", rows: 1 });
    expect(outcome.summary.results.filter((r) => r.provider === "bing").map((r) => [r.report, r.status])).toEqual([
      ["bing.traffic", "ok"],
      ["bing.queries", "skipped"],
      ["bing.pages", "skipped"],
      ["bing.crawl", "skipped"],
    ]);
  });

  it("runs GA4 and Bing without a Search Console site", async () => {
    const api = fakeProviders();
    const outcome = await executeAnalyticsSync({ env: { ...google, ...ga4, ...bing }, fetch: api.fetch, now });
    if (!outcome.ok) throw new Error("expected a run");
    expect(outcome.summary.providers.map((p) => [p.provider, p.health])).toEqual([
      ["ga4", "ok"],
      ["gsc", "not_configured"],
      ["bing", "ok"],
      ["clarity", "not_configured"],
    ]);
    expect(api.hosts).not.toContain("www.googleapis.com");
  });

  it("still runs Bing when the shared Google account is missing", async () => {
    const api = fakeProviders();
    const outcome = await executeAnalyticsSync({ env: { ...ga4, ...gsc, ...bing }, fetch: api.fetch, now });
    if (!outcome.ok) throw new Error("expected a run");
    expect(outcome.summary.providers).toEqual([
      { provider: "ga4", health: "not_configured", missing: ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"] },
      { provider: "gsc", health: "not_configured", missing: ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"] },
      { provider: "bing", health: "ok" },
      { provider: "clarity", health: "not_configured", missing: ["CLARITY_API_TOKEN"] },
    ]);
    expect(api.hosts).toEqual(["ssl.bing.com"]);
  });

  it("isolates a refused Google token from Bing, and a refused Bing key from Google", async () => {
    const token = await executeAnalyticsSync({ env: { ...google, ...ga4, ...gsc, ...bing }, fetch: fakeProviders({ refuse: "token" }).fetch, now });
    if (!token.ok) throw new Error("expected a run");
    expect(token.summary.providers.map((p) => p.health)).toEqual(["auth_failed", "auth_failed", "ok", "not_configured"]);

    resetGoogleTokenSources();
    const gscRefused = await executeAnalyticsSync({ env: { ...google, ...ga4, ...gsc, ...bing }, fetch: fakeProviders({ refuse: "gsc" }).fetch, now });
    if (!gscRefused.ok) throw new Error("expected a run");
    expect(gscRefused.summary.providers.map((p) => p.health)).toEqual(["ok", "auth_failed", "ok", "not_configured"]);

    resetGoogleTokenSources();
    const bingRefused = await executeAnalyticsSync({ env: { ...google, ...ga4, ...gsc, ...bing }, fetch: fakeProviders({ refuse: "bing" }).fetch, now });
    if (!bingRefused.ok) throw new Error("expected a run");
    expect(bingRefused.summary.providers.map((p) => p.health)).toEqual(["ok", "ok", "auth_failed", "not_configured"]);
    expect(JSON.stringify(bingRefused.summary)).not.toContain("Invalid API key");
  });

  it("plans the weekly reports too when the cadence is ignored", async () => {
    const outcome = await executeAnalyticsSync({ env: { ...bing }, fetch: fakeProviders().fetch, now, ignoreCadence: true });
    if (!outcome.ok) throw new Error("expected a run");
    expect(outcome.summary.results.map((r) => r.report)).toEqual(["bing.traffic", "bing.queries", "bing.pages", "bing.crawl"]);
    expect(outcome.summary.results.some((r) => r.status === "skipped")).toBe(false);
  });

  it("writes through the store only when the switch is exactly true", async () => {
    const store = spyStore();
    const dry = await executeAnalyticsSync({ env: { ...bing, ANALYTICS_SYNC_ENABLED: "yes" }, fetch: fakeProviders().fetch, now, store });
    expect(dry.ok && dry.summary.mode).toBe("dry-run");
    expect(store.calls).toEqual([]);

    const applied = await executeAnalyticsSync({ env: { ...bing, ANALYTICS_SYNC_ENABLED: "true" }, fetch: fakeProviders().fetch, now, store });
    expect(applied.ok && applied.summary.mode).toBe("applied");
    expect(store.calls).toEqual(["failStaleRuns", "startRun", "upsert", "deleteStale", "finishRun", "deleteOlderThan", "deleteOlderThan", "deleteOlderThan"]);
  });

  it("refuses the whole run only when writing is on and there is no key to write with", async () => {
    const previous = process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
    const outcome = await executeAnalyticsSync({ env: { ...bing, ANALYTICS_SYNC_ENABLED: "true" }, fetch: fakeProviders().fetch, now });
    expect(outcome).toEqual({ ok: false, reason: "store_not_configured", missing: ["SUPABASE_SECRET_KEY"] });
    if (previous !== undefined) process.env.SUPABASE_SECRET_KEY = previous;
  });

  it("never has more than three requests in flight per provider, nine in all", async () => {
    const inFlight = new Map<string, number>();
    let peakTotal = 0;
    const peakPerHost = new Map<string, number>();
    const base = fakeProviders();
    const slow = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const host = new URL(String(input)).host;
      inFlight.set(host, (inFlight.get(host) ?? 0) + 1);
      peakPerHost.set(host, Math.max(peakPerHost.get(host) ?? 0, inFlight.get(host) ?? 0));
      peakTotal = Math.max(peakTotal, [...inFlight.values()].reduce((a, b) => a + b, 0));
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight.set(host, (inFlight.get(host) ?? 1) - 1);
      return base.fetch(input, init);
    }) as unknown as typeof fetch;
    const outcome = await executeAnalyticsSync({ env: { ...google, ...ga4, ...gsc, ...bing }, fetch: slow, now, ignoreCadence: true });
    expect(outcome.ok).toBe(true);
    for (const host of ["analyticsdata.googleapis.com", "www.googleapis.com", "ssl.bing.com"]) expect(peakPerHost.get(host), host).toBeLessThanOrEqual(3);
    expect(peakPerHost.get("www.googleapis.com")).toBe(3);
    /* Nine provider requests plus at most one token exchange per Google scope. */
    expect(peakTotal).toBeLessThanOrEqual(11);
  });

  it("sends no provider request once the run is past its deadline, and fails the work as deadline", async () => {
    const api = fakeProviders();
    const outcome = await executeAnalyticsSync({ env: { ...bing, ...google, ...gsc }, fetch: api.fetch, now, pastDeadline: () => true });
    if (!outcome.ok) throw new Error("expected a run");
    expect(api.hosts.filter((host) => host !== "oauth2.googleapis.com")).toEqual([]);
    const ran = outcome.summary.results.filter((r) => r.status !== "skipped");
    expect(ran.length).toBeGreaterThan(0);
    expect(new Set(ran.map((r) => r.error))).toEqual(new Set(["deadline"]));
  });

  it("reports configuration per provider without calling anything", () => {
    expect(providerConfigStatus({ ...google, ...gsc, NEXT_PUBLIC_CLARITY_PROJECT_ID: "abc123xyz" })).toEqual([
      { provider: "ga4", configured: false, missing: ["GA4_PROPERTY_ID"] },
      { provider: "gsc", configured: true, missing: [] },
      { provider: "bing", configured: false, missing: ["BING_WEBMASTER_API_KEY", "BING_SITE_URL"] },
      {
        provider: "clarity",
        configured: false,
        missing: ["CLARITY_API_TOKEN"],
        parts: [
          { label: "Tracking op de website", configured: true, variable: "NEXT_PUBLIC_CLARITY_PROJECT_ID" },
          { label: "Export-API", configured: false, variable: "CLARITY_API_TOKEN" },
        ],
      },
    ]);
  });
});
