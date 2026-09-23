/**
 * What of a search query may be stored in our own database.
 *
 * Search Console and Bing hand over the text people typed. That is usually
 * a plain business search ("webshop laten maken amsterdam"), but nothing
 * stops someone from typing an e-mail address, a phone number, a link or a
 * code into a search box, and such a query can identify a person or hold a
 * secret. It is not treated as anonymous because the provider aggregated
 * it. Every query from either provider passes through `sanitizeSearchQuery`
 * before it becomes a fact; a query that looks like any of the following is
 * not stored at all (the row is dropped, not blanked):
 *
 *   - empty or whitespace only;
 *   - a control character (a newline, a tab, a NUL ...);
 *   - longer than `MAX_QUERY_LENGTH` characters;
 *   - an e-mail address;
 *   - a phone-like run of nine or more digits (phone numbers, and with
 *     them citizen-service numbers, bank account numbers and IBANs, whose
 *     account part is such a run);
 *   - a full URL (`https://…`, `www.…`); a bare domain such as
 *     `ymcreations.com` is a normal search and stays;
 *   - a JWT, a key with a well-known prefix (`sk_`, `ghp_`, `AKIA`, …), or
 *     one word of 20+ characters that mixes letters and digits, or of 32+
 *     hex characters: identifier- or token-like, not language.
 *
 * Long Dutch compounds ("arbeidsongeschiktheidsverzekering"), postcodes,
 * house numbers, years, prices and product names with a digit or two are
 * ordinary queries and are kept. A kept query is trimmed and its inner
 * whitespace collapsed; nothing else about it changes.
 *
 * A dropped query is counted, never logged, never returned.
 */
export const MAX_QUERY_LENGTH = 200;

const controlCharacter = /[\p{Cc}\p{Cf}]/u;
const email = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const phoneRun = /\+?\d[\d\s().\/-]{7,}\d/g;
const url = /(?:\b[a-z][a-z0-9+.-]*:\/\/|\bwww\.)\S+/i;
const jwt = /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/;
const keyPrefix = /\b(?:sk|pk|rk)_(?:live|test)_\w{8,}|\bgh[pousr]_\w{20,}|\bxox[abprs]-[\w-]{10,}|\bAKIA[0-9A-Z]{16}\b|\bAIza[\w-]{30,}/;

function identifierLike(word: string): boolean {
  if (/^[0-9a-f]{32,}$/i.test(word)) return true;
  return word.length >= 20 && /[a-z]/i.test(word) && /\d/.test(word);
}

function hasPhoneLikeRun(value: string): boolean {
  for (const match of value.matchAll(phoneRun)) {
    if (match[0].replace(/\D/g, "").length >= 9) return true;
  }
  return false;
}

export type QueryVerdict = { keep: true; query: string } | { keep: false };

export function sanitizeSearchQuery(raw: unknown): QueryVerdict {
  if (typeof raw !== "string") return { keep: false };
  if (controlCharacter.test(raw)) return { keep: false };
  const query = raw.trim().replace(/\s+/g, " ");
  if (query.length === 0 || query.length > MAX_QUERY_LENGTH) return { keep: false };
  if (email.test(query) || url.test(query) || jwt.test(query) || keyPrefix.test(query)) return { keep: false };
  if (hasPhoneLikeRun(query)) return { keep: false };
  if (query.split(" ").some(identifierLike)) return { keep: false };
  return { keep: true, query };
}
