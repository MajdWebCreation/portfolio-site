import { emptyDoc, type ArticleDoc } from "@/lib/admin/articles/doc";
import { featuredImageFromJson } from "@/lib/admin/articles/media";
import type { Article, ArticleStatus, ArticleSummary } from "@/lib/admin/articles/types";
import type { BlogCategory } from "@/lib/content/blog";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The columns an article is read from. `search_text` is left out: the database
 * generates it for the list's search and nothing here ever reads it back.
 */
export type ArticleRow = Omit<Database["public"]["Tables"]["articles"]["Row"], "search_text">;

/** The columns the list reads, without the editor document. */
export type ArticleSummaryRow = Pick<
  ArticleRow,
  "id" | "title" | "slug" | "status" | "category" | "published_at" | "updated_at"
>;

export function articleSummaryFromRow(row: ArticleSummaryRow): ArticleSummary {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: row.status as ArticleStatus,
    category: row.category as BlogCategory,
    updatedAt: row.updated_at,
    ...(row.published_at ? { publishedAt: row.published_at } : {}),
  };
}

/**
 * Row to domain. `content` is the ProseMirror document as stored; the column
 * check guarantees it is a doc node, and an unreadable value falls back to an
 * empty document rather than breaking the editor.
 */
export function articleFromRow(row: ArticleRow): Article {
  const content = row.content as unknown;
  const doc =
    content && typeof content === "object" && !Array.isArray(content) && (content as { type?: unknown }).type === "doc"
      ? (content as ArticleDoc)
      : emptyDoc;

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    content: doc,
    status: row.status as ArticleStatus,
    category: row.category as BlogCategory,
    updatedAt: row.updated_at,
    seoTitle: row.seo_title,
    metaDescription: row.meta_description,
    featuredImage: featuredImageFromJson(row.featured_image),
    ...(row.author ? { author: row.author } : {}),
    ...(row.published_at ? { publishedAt: row.published_at } : {}),
  };
}
