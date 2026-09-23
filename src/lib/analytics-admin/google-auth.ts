import { createSign } from "node:crypto";
import { ProviderError } from "@/lib/analytics-admin/types";

/**
 * A Google access token for a service account, without a library.
 *
 * Google's service-account flow is two steps and both are small: sign a JWT
 * with the account's RSA key (RS256, `iss` the account e-mail, `scope` the
 * API scope, `aud` the token endpoint, one hour), and exchange it at the
 * token endpoint for a bearer token. Node's crypto signs RS256; fetch does
 * the exchange. A dependency would add a second HTTP client and its own
 * credential discovery for the same forty lines, so there is none.
 *
 * The private key is read here and nowhere else, in one of three forms the
 * deployment may hand it in: the PEM itself with real newlines, the PEM with
 * the newlines written as `\n` (how a single-line environment variable
 * usually carries it), or the PEM base64-encoded as a whole. It is never
 * logged, never part of an error, never sent anywhere but the signature.
 *
 * Server only: the guard below makes a browser import a crash rather than
 * a leak.
 */
export const googleEnv = {
  propertyId: "GA4_PROPERTY_ID",
  email: "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  privateKey: "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
} as const;

export const analyticsReadScope = "https://www.googleapis.com/auth/analytics.readonly";

const tokenEndpoint = "https://oauth2.googleapis.com/token";

export type GoogleConfig =
  | { ok: true; propertyId: string; email: string; privateKey: string }
  | { ok: false; missing: string[] };

/** The GA4 property id: digits only, whatever prefix a copy from the UI carried. */
export function normalizePropertyId(raw: string): string | null {
  const digits = raw.trim().replace(/^properties\//, "");
  return /^\d{1,20}$/.test(digits) ? digits : null;
}

export function normalizePrivateKey(raw: string): string | null {
  let key = raw.trim();
  if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
  if (!key.includes("-----BEGIN")) {
    try {
      key = Buffer.from(key, "base64").toString("utf8").trim();
    } catch {
      return null;
    }
  }
  key = key.replace(/\\n/g, "\n").trim();
  if (!/^-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]+-----END (RSA )?PRIVATE KEY-----$/.test(key)) return null;
  return `${key}\n`;
}

/** Reads and checks the three variables; names what is missing or malformed, never a value. */
export function readGoogleConfig(env: Record<string, string | undefined> = process.env): GoogleConfig {
  if (typeof window !== "undefined") {
    throw new Error("Google credentials were read in the browser. They are server-only.");
  }

  const missing: string[] = [];
  const propertyId = env[googleEnv.propertyId] ? normalizePropertyId(env[googleEnv.propertyId] as string) : null;
  if (!propertyId) missing.push(googleEnv.propertyId);

  const email = env[googleEnv.email]?.trim() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(email)) missing.push(googleEnv.email);

  const privateKey = env[googleEnv.privateKey] ? normalizePrivateKey(env[googleEnv.privateKey] as string) : null;
  if (!privateKey) missing.push(googleEnv.privateKey);

  if (missing.length > 0 || !propertyId || !privateKey) return { ok: false, missing };
  return { ok: true, propertyId, email, privateKey };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The signed assertion for the token endpoint. Exported for the tests, which verify it with the matching public key. */
export function signServiceAccountJwt(input: { email: string; privateKey: string; scope: string; now: Date }): string {
  const issuedAt = Math.floor(input.now.getTime() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({ iss: input.email, scope: input.scope, aud: tokenEndpoint, iat: issuedAt, exp: issuedAt + 3600 }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = base64url(signer.sign(input.privateKey));
  return `${header}.${claims}.${signature}`;
}

export type TokenSource = () => Promise<string>;

/**
 * A function that returns a valid bearer token, exchanging a fresh JWT when
 * there is none or the cached one is about to expire. One per process; the
 * token lives in memory only.
 */
export function createServiceAccountTokenSource(input: {
  email: string;
  privateKey: string;
  scope: string;
  fetch?: typeof fetch;
  now?: () => Date;
}): TokenSource {
  const doFetch = input.fetch ?? fetch;
  const now = input.now ?? (() => new Date());
  let cached: { token: string; expiresAt: number } | null = null;

  return async () => {
    const at = now();
    if (cached && cached.expiresAt - at.getTime() > 60_000) return cached.token;

    const assertion = signServiceAccountJwt({ email: input.email, privateKey: input.privateKey, scope: input.scope, now: at });
    let response: Response;
    try {
      response = await doFetch(tokenEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
      });
    } catch {
      throw new ProviderError("network");
    }

    if (!response.ok) {
      throw new ProviderError(response.status === 400 || response.status === 401 || response.status === 403 ? "auth" : "http", response.status);
    }

    let body: { access_token?: unknown; expires_in?: unknown };
    try {
      body = (await response.json()) as typeof body;
    } catch {
      throw new ProviderError("invalid_response");
    }
    if (typeof body.access_token !== "string" || body.access_token.length === 0) throw new ProviderError("invalid_response");

    const lifetime = typeof body.expires_in === "number" ? body.expires_in : 3600;
    cached = { token: body.access_token, expiresAt: at.getTime() + lifetime * 1000 };
    return cached.token;
  };
}
