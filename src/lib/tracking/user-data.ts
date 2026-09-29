/**
 * The user-provided data of a Google Ads enhanced conversion: what an
 * accepted enquiry already contains, normalised the way Google asks, and
 * nothing more.
 *
 * Only the email address and the phone number are used. The forms collect
 * one free "name" field, which cannot be split into first and last name
 * without guessing, and Google only matches on names together with a postal
 * code and country, which no form asks for; so no name and no address.
 *
 * Values are handed to the Google tag unhashed but normalised; the tag hashes
 * them (SHA-256) itself before anything is sent, which is Google's
 * documented method for gtag.js. A value that does not normalise cleanly is
 * left out -- an enquiry is never held up by it, and a guess is never sent.
 */

export type LeadContact = { email?: string; phone?: string };
export type GoogleUserData = { email?: string; phone_number?: string };

const emailShape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Trimmed and lowercased; for gmail.com and googlemail.com the dots in the
 * part before the @ are removed, as Google's normalisation rules require.
 */
export function normalizeEmail(raw: string | undefined): string | undefined {
  const value = raw?.trim().toLowerCase();
  if (!value || value.length > 254 || !emailShape.test(value)) return undefined;

  const at = value.lastIndexOf("@");
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    const undotted = local.replace(/\./g, "");
    return undotted ? `${undotted}@${domain}` : undefined;
  }
  return value;
}

/**
 * E.164: a plus, the country code and the number, 11 to 15 digits, nothing
 * else. Accepted input: an international number (`+31 6 …`, `0031 6 …`, with
 * the Dutch `(0)` written in or not) or a Dutch national number of ten
 * digits starting with 0 (`06 12 34 56 78`), which is the only form without
 * a country code this Dutch site takes as Dutch. Anything else is left out.
 */
export function normalizePhoneE164(raw: string | undefined): string | undefined {
  const compact = raw?.trim().replace(/\(0\)/g, "").replace(/[\s().-]/g, "");
  if (!compact) return undefined;

  let international: string;
  if (compact.startsWith("+")) international = compact;
  else if (compact.startsWith("00")) international = `+${compact.slice(2)}`;
  else if (/^0\d{9}$/.test(compact)) international = `+31${compact.slice(1)}`;
  else return undefined;

  return /^\+[1-9]\d{10,14}$/.test(international) ? international : undefined;
}

/** The fields Google gets, or null when none survives normalisation. */
export function googleUserData(contact: LeadContact | undefined): GoogleUserData | null {
  if (!contact) return null;
  const email = normalizeEmail(contact.email);
  const phone = normalizePhoneE164(contact.phone);
  if (!email && !phone) return null;
  return { ...(email ? { email } : {}), ...(phone ? { phone_number: phone } : {}) };
}
