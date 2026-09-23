/**
 * Whether a search query names the business, for the branded /
 * non-branded split of aggregated search data.
 *
 * Deliberately plain: lower case, Unicode-normalised, punctuation that
 * joins words (`-`, `.`, `_`, `/`) read as a space, whitespace collapsed,
 * and then one of the brand terms as whole words. "ym creations",
 * "YM-Creations", "ymcreations.com" and "website ym creations amsterdam"
 * are branded; "ym" alone, "creations" alone or a near-miss spelling are
 * not. No fuzzy matching: a false "branded" hides a real search demand.
 *
 * Only aggregated queries pass through here; nothing is linked to a
 * person or an inquiry.
 */
export const brandTerms = ["ym creations", "ymcreations"] as const;

export function normalizeQuery(query: string): string {
  return query
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[-._/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isBrandedQuery(query: string): boolean {
  const normalized = ` ${normalizeQuery(query)} `;
  return brandTerms.some((term) => normalized.includes(` ${term} `));
}
