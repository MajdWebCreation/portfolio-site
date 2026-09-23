import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createServiceAccountTokenSource,
  normalizePrivateKey,
  normalizePropertyId,
  readGoogleConfig,
  signServiceAccountJwt,
} from "@/lib/analytics-admin/google-auth";

/* A throwaway key pair, generated per run: nothing real is ever in the repository. */
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const email = "analytics-reader@ym-creations.iam.gserviceaccount.com";

describe("readGoogleConfig", () => {
  it("names every missing variable, and never a value", () => {
    const result = readGoogleConfig({});
    expect(result).toEqual({ ok: false, missing: ["GA4_PROPERTY_ID", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"] });
  });

  it("accepts the three values in their usual forms", () => {
    const result = readGoogleConfig({
      GA4_PROPERTY_ID: "properties/123456789",
      GOOGLE_SERVICE_ACCOUNT_EMAIL: email,
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey.replace(/\n/g, "\\n"),
    });
    expect(result).toMatchObject({ ok: true, propertyId: "123456789", email });
    if (result.ok) expect(result.privateKey).toBe(privateKey);
  });

  it("refuses a measurement id in place of the property id, and a non-service-account address", () => {
    expect(readGoogleConfig({ GA4_PROPERTY_ID: "G-ABC123", GOOGLE_SERVICE_ACCOUNT_EMAIL: email, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey })).toMatchObject({
      ok: false,
      missing: ["GA4_PROPERTY_ID"],
    });
    expect(readGoogleConfig({ GA4_PROPERTY_ID: "1", GOOGLE_SERVICE_ACCOUNT_EMAIL: "someone@gmail.com", GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey })).toMatchObject({
      ok: false,
      missing: ["GOOGLE_SERVICE_ACCOUNT_EMAIL"],
    });
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
