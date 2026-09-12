import { describe, expect, it } from "vitest";
import {
  activationExpiry,
  activationTokenMatches,
  createActivationToken,
  hashActivationToken,
  isActivationTokenShape,
  isExpired,
} from "@/lib/payments/tokens";

describe("activation tokens", () => {
  it("never returns the same token twice", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => createActivationToken().token));
    expect(tokens.size).toBe(200);
  });

  /* The database stores the hash, so a leaked row is not a working link. */
  it("stores a hash that the token cannot be read back from", () => {
    const { token, tokenHash } = createActivationToken();
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(token);
    expect(hashActivationToken(token)).toBe(tokenHash);
  });

  it("matches only the token it was made from", () => {
    const { token, tokenHash } = createActivationToken();
    const other = createActivationToken();
    expect(activationTokenMatches(token, tokenHash)).toBe(true);
    expect(activationTokenMatches(other.token, tokenHash)).toBe(false);
  });

  it("refuses anything that is not shaped like a token before hashing it", () => {
    expect(isActivationTokenShape(createActivationToken().token)).toBe(true);
    expect(isActivationTokenShape("../../etc/passwd")).toBe(false);
    expect(isActivationTokenShape("short")).toBe(false);
    expect(isActivationTokenShape("")).toBe(false);
  });

  it("expires", () => {
    const start = new Date("2026-09-12T12:00:00.000Z");
    const expiry = activationExpiry(start);
    expect(isExpired(expiry, new Date("2026-09-14T12:00:00.000Z"))).toBe(false);
    expect(isExpired(expiry, new Date("2026-09-16T12:00:00.000Z"))).toBe(true);
  });
});
