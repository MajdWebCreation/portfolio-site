import type { BlogCategory } from "@/lib/content/blog";
import type { ArticleDoc } from "@/lib/admin/articles/doc";
import type { FeaturedImage } from "@/lib/admin/articles/media";

/**
 * Admin article record. Mirrors what the public Inzichten pages need
 * (`ArticleLocaleContent` in content/blog.ts): title, slug, meta title and
 * description, category, publication date and the body. The body is an
 * editor document instead of the markdown-ish text; the database phase
 * stores this record and the public pages read from it.
 */
export type ArticleStatus = "draft" | "published";

export type Article = {
  id: string;
  title: string;
  slug: string;
  /** Lede under the title on the public page, also the list intro. */
  excerpt: string;
  content: ArticleDoc;
  status: ArticleStatus;
  category: BlogCategory;
  author?: string;
  /** ISO date (YYYY-MM-DD) of publication, when set. */
  publishedAt?: string;
  /** ISO timestamp of the last change. */
  updatedAt: string;
  seoTitle: string;
  metaDescription: string;
  /** Object path in the article-media bucket plus its alt text. */
  featuredImage?: FeaturedImage | null;
};

export const articleStatusLabels: Record<ArticleStatus, string> = {
  draft: "Concept",
  published: "Gepubliceerd",
};

export const articleStatusTone: Record<ArticleStatus, "neutral" | "success"> = {
  draft: "neutral",
  published: "success",
};

export const articleStatusOrder: readonly ArticleStatus[] = ["draft", "published"];

export function isArticleStatus(value: string): value is ArticleStatus {
  return (articleStatusOrder as readonly string[]).includes(value);
}

/** Guidance for the SEO fields, as ranges rather than hard limits. */
export const seoGuidance = {
  title: { min: 30, max: 60 },
  description: { min: 110, max: 160 },
} as const;

/**
 * Ids of records that only exist in the browser session carry this prefix.
 * Server pages use it to tell "unknown id" (404) from "session-only id"
 * (render, and let the client look it up). Kept here, outside the "use
 * client" session module, so server components get the string itself.
 */
export const sessionArticlePrefix = "artikel-sessie-";
