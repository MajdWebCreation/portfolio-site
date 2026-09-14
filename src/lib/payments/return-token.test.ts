import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createPaymentReturnToken,
  hasPaymentReturnSecret,
  readPaymentReturnToken,
  returnTokenTtlSeconds,
} from "@/lib/payments/return-token";

/*
  The token that replaced `?doc=YM-F-2026-000001`.

  Two claims are being tested, and a thank-you page is only safe if both hold:
  the invoice cannot be read out of the URL, and a URL that was not made here
  is never believed. Every rejection is the same answer -- `undefined` -- so
  the tests check the answer rather than a reason, exactly as a visitor would
  see it.
*/
const invoiceId = "dd847d57-3cb1-4160-b848-2a43a53ac40f";
const secret = "test-payment-return-secret-value";

/* Set before the describes run: some of them issue a token while collecting. */
process.env.PAYMENT_RETURN_SECRET = secret;

/** Flips one bit in the byte at `index` of a base64url token. */
function tamper(token: string, index: number): string {
  const raw = Buffer.from(token, "base64url");
  raw[index] ^= 0x01;
  return raw.toString("base64url");
}

beforeEach(() => {
  process.env.PAYMENT_RETURN_SECRET = secret;
});

afterEach(() => {
  process.env.PAYMENT_RETURN_SECRET = secret;
});

describe("a token we issued ourselves", () => {
  it("names the invoice again when it comes back", () => {
    expect(readPaymentReturnToken(createPaymentReturnToken(invoiceId))).toEqual({ invoiceId });
  });

  /* The whole point: the URL must give a reader nothing. */
  it("shows no invoice id, number or other identifier", () => {
    const token = createPaymentReturnToken(invoiceId);

    expect(token).not.toContain(invoiceId);
    expect(token).not.toContain(invoiceId.slice(0, 8));
    // Nor after the obvious decoding attempt.
    const decoded = Buffer.from(token, "base64url").toString("latin1");
    expect(decoded).not.toContain(invoiceId);
    expect(decoded).not.toContain("YM-F");
    // URL-safe, so it survives a query string unescaped.
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  /* Same invoice, different bytes each time: a token is not an identifier. */
  it("differs on every issue, so two links cannot be matched up", () => {
    expect(createPaymentReturnToken(invoiceId)).not.toBe(createPaymentReturnToken(invoiceId));
  });

  it("refuses to be made for something that is not an invoice id", () => {
    expect(() => createPaymentReturnToken("YM-F-2026-000001")).toThrow();
    expect(() => createPaymentReturnToken("")).toThrow();
  });
});

describe("a token that was interfered with", () => {
  const token = createPaymentReturnToken(invoiceId);

  it("is refused when the payload is changed", () => {
    // A byte inside the ciphertext, past the 16-byte IV.
    expect(readPaymentReturnToken(tamper(token, 20))).toBeUndefined();
  });

  it("is refused when the signature is changed", () => {
    const raw = Buffer.from(token, "base64url");
    expect(readPaymentReturnToken(tamper(token, raw.length - 1))).toBeUndefined();
  });

  /* The IV is covered by the signature too; changing it rewrites a block. */
  it("is refused when the initialisation vector is changed", () => {
    expect(readPaymentReturnToken(tamper(token, 0))).toBeUndefined();
  });

  it("is refused when it is truncated or padded", () => {
    expect(readPaymentReturnToken(token.slice(0, -4))).toBeUndefined();
    expect(readPaymentReturnToken(`${token}AAAA`)).toBeUndefined();
  });

  it("is refused when it is not a token at all", () => {
    for (const value of [undefined, "", "   ", "YM-F-2026-000001", "../../etc/passwd", "a".repeat(600)]) {
      expect(readPaymentReturnToken(value)).toBeUndefined();
    }
  });
});

describe("a token from somewhere else", () => {
  it("is refused when it was signed with a different secret", () => {
    process.env.PAYMENT_RETURN_SECRET = "a-completely-different-secret";
    const foreign = createPaymentReturnToken(invoiceId);

    process.env.PAYMENT_RETURN_SECRET = secret;
    expect(readPaymentReturnToken(foreign)).toBeUndefined();
  });

  it("cannot be read at all without a secret", () => {
    const token = createPaymentReturnToken(invoiceId);
    delete process.env.PAYMENT_RETURN_SECRET;

    expect(hasPaymentReturnSecret()).toBe(false);
    expect(readPaymentReturnToken(token)).toBeUndefined();
  });
});

describe("how long a token lasts", () => {
  const issuedAt = new Date("2026-09-14T12:00:00.000Z");
  const token = createPaymentReturnToken(invoiceId, issuedAt);
  const at = (seconds: number) => new Date(issuedAt.getTime() + seconds * 1000);

  it("is accepted throughout its life", () => {
    expect(readPaymentReturnToken(token, issuedAt)).toEqual({ invoiceId });
    expect(readPaymentReturnToken(token, at(returnTokenTtlSeconds - 1))).toEqual({ invoiceId });
  });

  it("is refused once it has expired", () => {
    expect(readPaymentReturnToken(token, at(returnTokenTtlSeconds + 1))).toBeUndefined();
    expect(readPaymentReturnToken(token, at(returnTokenTtlSeconds * 2))).toBeUndefined();
  });

  /* A small clock difference between two machines is not a forgery. */
  it("tolerates a little clock skew but not a date in the future", () => {
    expect(readPaymentReturnToken(token, at(-60))).toEqual({ invoiceId });
    expect(readPaymentReturnToken(token, at(-3600))).toBeUndefined();
  });
});
