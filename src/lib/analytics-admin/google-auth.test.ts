import { createVerify, generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyticsReadScope,
  createServiceAccountTokenSource,
  googleTokenSource,
  googleTokenSourceCount,
  normalizeGscSiteUrl,
  normalizePrivateKey,
  normalizePropertyId,
  normalizeScopes,
  readGa4Config,
  readGscConfig,
  readServiceAccountConfig,
  resetGoogleTokenSources,
  searchConsoleReadScope,
  signServiceAccountJwt,
} from "@/lib/analytics-admin/google-auth";

/* A throwaway key pair, generated per run: nothing real is ever in the repository. */
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const email = "analytics-reader@ym-creations.iam.gserviceaccount.com";

describe("Google configuration", () => {
  const account = { GOOGLE_SERVICE_ACCOUNT_EMAIL: email, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey.replace(/\n/g, "\\n") };

  it("names every missing shared variable, and never a value", () => {
    expect(readServiceAccountConfig({})).toEqual({ ok: false, missing: ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"] });
    expect(readGa4Config({ GA4_PROPERTY_ID: "1" })).toEqual({ ok: false, missing: ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"] });
    expect(readGscConfig({ GSC_SITE_URL: "sc-domain:ymcreations.com" })).toEqual({
      ok: false,
      missing: ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"],
    });
  });

  it("configures Search Console without a GA4 property", () => {
    expect(readGa4Config({ ...account, GSC_SITE_URL: "sc-domain:ymcreations.com" })).toEqual({ ok: false, missing: ["GA4_PROPERTY_ID"] });
    const gsc = readGscConfig({ ...account, GSC_SITE_URL: "sc-domain:ymcreations.com" });
    expect(gsc).toMatchObject({ ok: true, siteUrl: "sc-domain:ymcreations.com", account: { email } });
    if (gsc.ok) expect(gsc.account.privateKey).toBe(privateKey);
  });

  it("configures GA4 without a Search Console site", () => {
    expect(readGscConfig({ ...account, GA4_PROPERTY_ID: "properties/123456789" })).toEqual({ ok: false, missing: ["GSC_SITE_URL"] });
    expect(readGa4Config({ ...account, GA4_PROPERTY_ID: "properties/123456789" })).toMatchObject({ ok: true, propertyId: "123456789", account: { email } });
  });

  it("refuses a measurement id in place of the property id, and a non-service-account address", () => {
    expect(readGa4Config({ GA4_PROPERTY_ID: "G-ABC123", GOOGLE_SERVICE_ACCOUNT_EMAIL: email, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey })).toMatchObject({
      ok: false,
      missing: ["GA4_PROPERTY_ID"],
    });
    expect(readGa4Config({ GA4_PROPERTY_ID: "1", GOOGLE_SERVICE_ACCOUNT_EMAIL: "someone@gmail.com", GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey })).toMatchObject({
      ok: false,
      missing: ["GOOGLE_SERVICE_ACCOUNT_EMAIL"],
    });
  });

  it("reads a domain property and a URL-prefix property, and nothing else", () => {
    expect(normalizeGscSiteUrl("sc-domain:YMCreations.com")).toBe("sc-domain:ymcreations.com");
    expect(normalizeGscSiteUrl("https://www.ymcreations.com")).toBe("https://www.ymcreations.com/");
    expect(normalizeGscSiteUrl("https://ymcreations.com/nl/")).toBe("https://ymcreations.com/nl/");
    expect(normalizeGscSiteUrl("ymcreations.com")).toBeNull();
    expect(normalizeGscSiteUrl("ftp://ymcreations.com/")).toBeNull();
    expect(normalizeGscSiteUrl("https://ymcreations.com/?x=1")).toBeNull();
  });
});

describe("normalizers", () => {
  it("reads the key as PEM, as PEM with \\n, or as base64", () => {
    expect(normalizePrivateKey(privateKey)).toBe(privateKey);
    expect(normalizePrivateKey(privateKey.replace(/\n/g, "\\n"))).toBe(privateKey);
    expect(normalizePrivateKey(Buffer.from(privateKey).toString("base64"))).toBe(privateKey);
    expect(normalizePrivateKey(`"${privateKey.replace(/\n/g, "\\n")}"`)).toBe(privateKey);
    expect(normalizePrivateKey("not a key")).toBeNull();
    expect(normalizePrivateKey("")).toBeNull();
  });

  it("reads the property id with or without its prefix", () => {
    expect(normalizePropertyId("properties/42")).toBe("42");
    expect(normalizePropertyId(" 42 ")).toBe("42");
    expect(normalizePropertyId("G-42")).toBeNull();
  });
});

describe("signServiceAccountJwt", () => {
  it("produces an RS256 assertion the public key verifies, with the right claims", () => {
    const now = new Date("2026-09-23T06:00:00Z");
    const jwt = signServiceAccountJwt({ email, privateKey, scope: "https://www.googleapis.com/auth/analytics.readonly", now });
    const [header, claims, signature] = jwt.split(".");
    const decode = (part: string) => JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());

    expect(decode(header)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decode(claims)).toEqual({
      iss: email,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(now.getTime() / 1000) + 3600,
    });

    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${claims}`);
    expect(verifier.verify(publicKey, Buffer.from(signature.replace(/-/g, "+").replace(/_/g, "/"), "base64"))).toBe(true);
  });
});

describe("createServiceAccountTokenSource", () => {
  it("exchanges the assertion once and reuses the token until it nears expiry", async () => {
    let clock = new Date("2026-09-23T06:00:00Z");
    const fetchSpy = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
      expect(body.get("assertion")).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
      return new Response(JSON.stringify({ access_token: `tok-${fetchSpy.mock.calls.length}`, expires_in: 3600 }), { status: 200 });
    });
    const source = createServiceAccountTokenSource({ email, privateKey, scope: "s", fetch: fetchSpy as unknown as typeof fetch, now: () => clock });

    expect(await source()).toBe("tok-1");
    expect(await source()).toBe("tok-1");
    clock = new Date("2026-09-23T06:59:30Z");
    expect(await source()).toBe("tok-2");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[0][0])).toBe("https://oauth2.googleapis.com/token");
  });

  it("classes a refused exchange as auth and a broken one as invalid_response, without the body", async () => {
    const refused = createServiceAccountTokenSource({
      email,
      privateKey,
      scope: "s",
      fetch: (async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "secret" }), { status: 400 })) as unknown as typeof fetch,
    });
    await expect(refused()).rejects.toMatchObject({ kind: "auth", status: 400 });
    await expect(refused()).rejects.not.toThrow(/secret/);

    const broken = createServiceAccountTokenSource({
      email,
      privateKey,
      scope: "s",
      fetch: (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch,
    });
    await expect(broken()).rejects.toMatchObject({ kind: "invalid_response" });
  });
});

describe("token sources per scope", () => {
  const account = { email, privateKey };
  let clock = new Date("2026-09-23T06:00:00Z");
  const exchanged: string[] = [];
  const fakeFetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const assertion = new URLSearchParams(String(init?.body)).get("assertion") ?? "";
    const claims = JSON.parse(Buffer.from(assertion.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    exchanged.push(claims.scope);
    return new Response(JSON.stringify({ access_token: `tok-${exchanged.length}-${claims.scope.includes("webmasters") ? "gsc" : "ga"}`, expires_in: 3600 }), { status: 200 });
  }) as unknown as typeof fetch;

  beforeEach(() => {
    resetGoogleTokenSources();
    exchanged.length = 0;
    clock = new Date("2026-09-23T06:00:00Z");
  });

  it("normalises scope sets: deduplicated and sorted", () => {
    expect(normalizeScopes([searchConsoleReadScope, analyticsReadScope, analyticsReadScope])).toBe(`${analyticsReadScope} ${searchConsoleReadScope}`);
    expect(normalizeScopes(`  ${searchConsoleReadScope}   ${analyticsReadScope} `)).toBe(`${analyticsReadScope} ${searchConsoleReadScope}`);
  });

  it("keeps a separate token per scope, so an Analytics token never reaches Search Console", async () => {
    const ga = googleTokenSource(account, [analyticsReadScope], { fetch: fakeFetch, now: () => clock });
    const gsc = googleTokenSource(account, [searchConsoleReadScope], { fetch: fakeFetch, now: () => clock });
    expect(ga).not.toBe(gsc);
    expect(await ga()).toBe("tok-1-ga");
    expect(await gsc()).toBe("tok-2-gsc");
    expect(exchanged).toEqual([analyticsReadScope, searchConsoleReadScope]);
    expect(googleTokenSourceCount()).toBe(2);
  });

  it("reuses the source and its token for the same scope set, in any order", async () => {
    const first = googleTokenSource(account, [analyticsReadScope, searchConsoleReadScope], { fetch: fakeFetch, now: () => clock });
    const second = googleTokenSource(account, [searchConsoleReadScope, analyticsReadScope], { fetch: fakeFetch, now: () => clock });
    expect(second).toBe(first);
    expect(await first()).toBe(await second());
    expect(exchanged).toEqual([`${analyticsReadScope} ${searchConsoleReadScope}`]);
  });

  it("refreshes a token that nears expiry", async () => {
    const ga = googleTokenSource(account, [analyticsReadScope], { fetch: fakeFetch, now: () => clock });
    expect(await ga()).toBe("tok-1-ga");
    clock = new Date("2026-09-23T06:59:30Z");
    expect(await ga()).toBe("tok-2-ga");
  });

  it("keys on the account too", () => {
    const a = googleTokenSource(account, [analyticsReadScope], { fetch: fakeFetch });
    const b = googleTokenSource({ email: "other@ym-creations.iam.gserviceaccount.com", privateKey }, [analyticsReadScope], { fetch: fakeFetch });
    expect(a).not.toBe(b);
  });

  it("shares one exchange between concurrent callers", async () => {
    const ga = googleTokenSource(account, [analyticsReadScope], { fetch: fakeFetch, now: () => clock });
    const tokens = await Promise.all([ga(), ga(), ga()]);
    expect(new Set(tokens).size).toBe(1);
    expect(exchanged).toHaveLength(1);
  });

  it("gives up on a token exchange that hangs, as timeout, and caches nothing", async () => {
    const hanging = (() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;
    const source = createServiceAccountTokenSource({ email, privateKey, scope: analyticsReadScope, fetch: hanging, timeoutMs: 20 });
    await expect(source()).rejects.toMatchObject({ kind: "timeout" });
  });
});
