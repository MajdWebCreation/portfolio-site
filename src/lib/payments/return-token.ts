import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The opaque state token in a payment return URL.
 *
 * The return URL used to carry the invoice number (`?doc=YM-F-2026-000001`).
 * Those numbers run in sequence, so anyone could count through them and read
 * off, from the four messages the page can show, whether an invoice existed
 * and roughly where it stood. A thank-you page has no business being that
 * oracle.
 *
 * So the URL now carries a token that says nothing to the person holding it.
 * Two properties are needed, and neither is optional:
 *
 *   unreadable    the invoice identity must not be recoverable from the URL.
 *                 A signed-but-plain payload would not do: signing proves a
 *                 value was ours, it does not hide it, and base64 is not a
 *                 secret. The payload is therefore encrypted.
 *
 *   unforgeable   a visitor must not be able to make a token for an invoice
 *                 of their choosing, or bend one they were given into
 *                 another. Encryption alone does not give that, so the
 *                 ciphertext is authenticated.
 *
 * Encrypt-then-MAC, the textbook construction: AES-256-CBC for the payload,
 * HMAC-SHA256 over the IV and the ciphertext, checked with `timingSafeEqual`
 * before anything is decrypted. Both keys are derived from one secret through
 * HKDF with different `info` strings, so the encryption key and the signing
 * key are never the same bytes.
 *
 * Stateless on purpose: nothing is written when a link is made and nothing is
 * looked up when one comes back, so this adds no table, no row per payment
 * and no cleanup, and it changes nothing about how payments themselves work.
 *
 * The secret is its own: not the Mollie key, not the Supabase key, not the
 * cron secret. A value that signs public URLs must not be one whose leak
 * would cost anything else.
 */
const version = 1;

/** How long a return URL stays meaningful. Invoices are due in 14 days. */
export const returnTokenTtlSeconds = 30 * 24 * 3600;

/** A token dated further ahead than this is not a clock difference. */
const maxClockSkewSeconds = 300;

const ivBytes = 16;
const macBytes = 32;

export class PaymentReturnSecretMissing extends Error {
  constructor() {
    super("PAYMENT_RETURN_SECRET ontbreekt; betaal-return-URL's kunnen niet worden ondertekend.");
    this.name = "PaymentReturnSecretMissing";
  }
}

/** True when tokens can be made and read at all; lets callers degrade. */
export function hasPaymentReturnSecret(): boolean {
  return typeof window === "undefined" && Boolean(process.env.PAYMENT_RETURN_SECRET);
}

/**
 * Read at call time rather than at import, so a deployment that sets the
 * variable later does not need a rebuild, and so tests can vary it.
 */
function secret(): string {
  if (typeof window !== "undefined") {
    throw new Error("The payment return secret was read in the browser. It is server-only.");
  }
  const value = process.env.PAYMENT_RETURN_SECRET;
  if (!value) throw new PaymentReturnSecretMissing();
  return value;
}

/*
  Two keys from one secret. Same input, different `info`, so a weakness in one
  use cannot be carried into the other -- and so the signing key is never also
  the key that decrypts.
*/
function keys(): { encryption: Buffer; signing: Buffer } {
  const material = secret();
  const derive = (info: string) => Buffer.from(hkdfSync("sha256", material, "", info, 32));
  return { encryption: derive("payment-return-encryption-v1"), signing: derive("payment-return-signature-v1") };
}

/** What a token carries: which invoice, and when it was issued. */
type TokenPayload = { v: number; i: string; t: number };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The token for one invoice's return URL.
 *
 * `issuedAt` is a parameter so the expiry rule can be tested without waiting
 * a month; nothing in the application passes it.
 */
export function createPaymentReturnToken(invoiceId: string, issuedAt: Date = new Date()): string {
  if (!uuidPattern.test(invoiceId)) throw new Error("A payment return token needs an invoice id.");

  const { encryption, signing } = keys();
  const payload: TokenPayload = { v: version, i: invoiceId, t: Math.floor(issuedAt.getTime() / 1000) };

  const iv = randomBytes(ivBytes);
  const cipher = createCipheriv("aes-256-cbc", encryption, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);

  // Over the IV as well as the ciphertext: an unauthenticated IV is a way to
  // change the first block of what comes out.
  const mac = createHmac("sha256", signing).update(iv).update(ciphertext).digest();

  return Buffer.concat([iv, ciphertext, mac]).toString("base64url");
}

/**
 * The invoice a token names, or nothing at all.
 *
 * Every rejection returns `undefined` rather than a reason. The caller has
 * one safe thing to render in all of these cases, and telling a visitor which
 * part of their forgery failed would only help the next attempt.
 */
export function readPaymentReturnToken(token: string | undefined, now: Date = new Date()): { invoiceId: string } | undefined {
  if (!token || !hasPaymentReturnSecret()) return undefined;
  // Base64url of at least an IV, one cipher block and a MAC. Cheap shape
  // check before any crypto touches attacker-controlled input.
  if (!/^[A-Za-z0-9_-]{80,512}$/.test(token)) return undefined;

  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length <= ivBytes + macBytes) return undefined;

    const iv = raw.subarray(0, ivBytes);
    const ciphertext = raw.subarray(ivBytes, raw.length - macBytes);
    const mac = raw.subarray(raw.length - macBytes);

    const { encryption, signing } = keys();

    /*
      Authenticate first, decrypt second. Decrypting something unverified
      means running a padding check on attacker-chosen bytes, which is the
      oracle this ordering exists to avoid.
    */
    const expected = createHmac("sha256", signing).update(iv).update(ciphertext).digest();
    if (expected.length !== mac.length || !timingSafeEqual(expected, mac)) return undefined;

    const decipher = createDecipheriv("aes-256-cbc", encryption, iv);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");

    const payload = JSON.parse(plain) as Partial<TokenPayload>;
    if (payload.v !== version) return undefined;
    if (typeof payload.i !== "string" || !uuidPattern.test(payload.i)) return undefined;
    if (typeof payload.t !== "number" || !Number.isFinite(payload.t)) return undefined;

    const age = Math.floor(now.getTime() / 1000) - payload.t;
    if (age > returnTokenTtlSeconds) return undefined;
    // Dated in the future by more than a clock difference: not one of ours.
    if (age < -maxClockSkewSeconds) return undefined;

    return { invoiceId: payload.i };
  } catch {
    // Malformed base64, a bad block length, broken padding, unparseable JSON:
    // all of it is one answer, and none of it is worth a log line a visitor
    // can fill at will.
    return undefined;
  }
}
