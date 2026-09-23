import { createSign } from "node:crypto";
import { fetchWithTimeout, parseJson } from "@/lib/analytics-admin/http";
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
  gscSiteUrl: "GSC_SITE_URL",
  email: "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  privateKey: "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
} as const;

export const analyticsReadScope = "https://www.googleapis.com/auth/analytics.readonly";
export const searchConsoleReadScope = "https://www.googleapis.com/auth/webmasters.readonly";

const tokenEndpoint = "https://oauth2.googleapis.com/token";

type Env = Record<string, string | undefined>;
type Missing = { ok: false; missing: string[] };

/** The identity both Google providers share: one service account, one key. */
export type ServiceAccount = { email: string; privateKey: string };

export type ServiceAccountConfig = ({ ok: true } & ServiceAccount) | Missing;
export type Ga4Config = { ok: true; propertyId: string; account: ServiceAccount } | Missing;
export type GscConfig = { ok: true; siteUrl: string; account: ServiceAccount } | Missing;

/** The GA4 property id: digits only, whatever prefix a copy from the UI carried. */
export function normalizePropertyId(raw: string): string | null {
  const digits = raw.trim().replace(/^properties\//, "");
  return /^\d{1,20}$/.test(digits) ? digits : null;
}

/**
 * A Search Console property as the API names it: a domain property
 * (`sc-domain:example.com`) or a URL-prefix property
 * (`https://www.example.com/`, always with the trailing slash the API
 * expects). Which of the two production uses is not assumed; both are
 * accepted, anything else is refused.
 */
export function normalizeGscSiteUrl(raw: string): string | null {
  const value = raw.trim();
  const domain = /^sc-domain:([a-z0-9-]+(\.[a-z0-9-]+)+)$/i.exec(value);
  if (domain) return `sc-domain:${domain[1].toLowerCase()}`;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.search || url.hash || url.username || url.password) return null;
    return url.pathname.endsWith("/") ? url.toString() : `${url.toString()}/`;
  } catch {
    return null;
  }
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

function serverOnly() {
  if (typeof window !== "undefined") {
    throw new Error("Google credentials were read in the browser. They are server-only.");
  }
}

/** The shared service account: names what is missing or malformed, never a value. */
export function readServiceAccountConfig(env: Env = process.env): ServiceAccountConfig {
  serverOnly();
  const missing: string[] = [];

  const email = env[googleEnv.email]?.trim() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(email)) missing.push(googleEnv.email);

  const privateKey = env[googleEnv.privateKey] ? normalizePrivateKey(env[googleEnv.privateKey] as string) : null;
  if (!privateKey) missing.push(googleEnv.privateKey);

  if (missing.length > 0 || !privateKey) return { ok: false, missing };
  return { ok: true, email, privateKey };
}

/** GA4: its own property id plus the shared account. A missing Search Console site does not matter here. */
export function readGa4Config(env: Env = process.env): Ga4Config {
  const account = readServiceAccountConfig(env);
  const propertyId = env[googleEnv.propertyId] ? normalizePropertyId(env[googleEnv.propertyId] as string) : null;
  const missing = [...(propertyId ? [] : [googleEnv.propertyId]), ...(account.ok ? [] : account.missing)];
  if (!account.ok || !propertyId) return { ok: false, missing };
  return { ok: true, propertyId, account: { email: account.email, privateKey: account.privateKey } };
}

/** Search Console: its own site plus the shared account. A missing GA4 property does not matter here. */
export function readGscConfig(env: Env = process.env): GscConfig {
  const account = readServiceAccountConfig(env);
  const siteUrl = env[googleEnv.gscSiteUrl] ? normalizeGscSiteUrl(env[googleEnv.gscSiteUrl] as string) : null;
  const missing = [...(siteUrl ? [] : [googleEnv.gscSiteUrl]), ...(account.ok ? [] : account.missing)];
  if (!account.ok || !siteUrl) return { ok: false, missing };
  return { ok: true, siteUrl, account: { email: account.email, privateKey: account.privateKey } };
}

/** Scopes in one deterministic form: deduplicated, sorted, space-separated, as the JWT claim wants them. */
export function normalizeScopes(scopes: string | readonly string[]): string {
  const list = (typeof scopes === "string" ? scopes.split(/\s+/) : [...scopes]).map((scope) => scope.trim()).filter(Boolean);
  return [...new Set(list)].sort().join(" ");
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
  scope: string | readonly string[];
  fetch?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
}): TokenSource {
  const doFetch = input.fetch ?? fetch;
  const now = input.now ?? (() => new Date());
  const scope = normalizeScopes(input.scope);
  let cached: { token: string; expiresAt: number } | null = null;
  /* Reports run side by side: concurrent callers share one exchange instead of each starting their own. */
  let pending: Promise<string> | null = null;

  const exchange = async (at: Date): Promise<string> => {
    const assertion = signServiceAccountJwt({ email: input.email, privateKey: input.privateKey, scope, now: at });
    const response = await fetchWithTimeout(
      doFetch,
      tokenEndpoint,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
      },
      input.timeoutMs,
    );

    if (!response.ok) {
      throw new ProviderError(response.status === 400 || response.status === 401 || response.status === 403 ? "auth" : "http", response.status);
    }

    const body = parseJson<{ access_token?: unknown; expires_in?: unknown }>(response.text);
    if (typeof body.access_token !== "string" || body.access_token.length === 0) throw new ProviderError("invalid_response");

    const lifetime = typeof body.expires_in === "number" ? body.expires_in : 3600;
    cached = { token: body.access_token, expiresAt: at.getTime() + lifetime * 1000 };
    return cached.token;
  };

  return async () => {
    const at = now();
    if (cached && cached.expiresAt - at.getTime() > 60_000) return cached.token;
    pending ??= exchange(at).finally(() => {
      pending = null;
    });
    return pending;
  };
}

/**
 * One token source per account and scope set, for the life of the process.
 *
 * The key is the account e-mail plus the normalised scopes, so an
 * Analytics token is never handed to Search Console or the other way
 * round, and two requests for the same scopes share one exchange. A
 * source refreshes its own token when it nears expiry; a failed exchange
 * caches nothing.
 */
const tokenSources = new Map<string, TokenSource>();

export function googleTokenSource(
  account: ServiceAccount,
  scopes: string | readonly string[],
  options: { fetch?: typeof fetch; now?: () => Date; timeoutMs?: number } = {},
): TokenSource {
  const key = `${account.email}\n${normalizeScopes(scopes)}`;
  let source = tokenSources.get(key);
  if (!source) {
    source = createServiceAccountTokenSource({ email: account.email, privateKey: account.privateKey, scope: scopes, ...options });
    tokenSources.set(key, source);
  }
  return source;
}

/** For the tests: forget every cached source. */
export function resetGoogleTokenSources(): void {
  tokenSources.clear();
}

export function googleTokenSourceCount(): number {
  return tokenSources.size;
}
