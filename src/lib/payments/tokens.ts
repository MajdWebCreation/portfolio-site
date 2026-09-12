import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Activation links.
 *
 * The token travels in the link and nowhere else: the database stores only
 * its SHA-256 hash, so a leaked row cannot be turned back into a working
 * link. Lookup is by hash, which is a constant-length, indexed equality
 * check, and `timingSafeEqual` is used where two hashes are compared in
 * application code.
 *
 * 32 random bytes is far beyond guessing, and base64url keeps the link
 * copy-pasteable out of a mail.
 */
export const activationTokenBytes = 32;

/** How long an activation link stays usable. */
export const activationTokenTtlHours = 72;

export function createActivationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(activationTokenBytes).toString("base64url");
  return { token, tokenHash: hashActivationToken(token) };
}

export function hashActivationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Shape check before a hash is ever sent to the database. */
export function isActivationTokenShape(token: string): boolean {
  return /^[A-Za-z0-9_-]{20,200}$/.test(token);
}

export function activationTokenMatches(token: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashActivationToken(token), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

export function activationExpiry(from: Date = new Date()): string {
  return new Date(from.getTime() + activationTokenTtlHours * 3600 * 1000).toISOString();
}

export function isExpired(expiresAt: string, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}
