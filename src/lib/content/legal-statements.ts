import type { ArticleBlock } from "@/lib/content/blog";
import type { Locale } from "@/lib/content/site-content";

/**
 * The shape both statements share: a title, an intro, the date the text was
 * last changed, and the running text as article blocks, so it is set by the
 * same renderer as everything else on the site.
 *
 * `indexable` follows the terms page: false keeps a statement out of search
 * results and the sitemap until it has been read and confirmed, while the
 * page itself is live and linked, because the consent card points at it.
 */
export type LegalStatement = {
  title: string;
  description: string;
  intro: string;
  updatedIso: string;
  updatedLabel: string;
  blocks: ArticleBlock[];
};

export type LegalStatementSet = {
  indexable: boolean;
  content: Record<Locale, LegalStatement>;
};

/** The two labels the page around a statement needs, shared by both statements. */
export const legalStatementLabels: Record<Locale, { kicker: string; updated: string }> = {
  nl: { kicker: "Juridisch", updated: "Laatst bijgewerkt" },
  en: { kicker: "Legal", updated: "Last updated" },
};
