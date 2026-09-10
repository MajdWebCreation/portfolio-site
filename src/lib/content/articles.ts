import { cache } from "react";
import { blocksFromDoc, emptyDoc, readingTimeLabel, type ArticleDoc } from "@/lib/admin/articles/doc";
import { featuredImageFromJson, type FeaturedImage } from "@/lib/admin/articles/media";
import {
  getArticleExtras,
  getArticlePath,
  type ArticleBlock,
  type ArticleExtras,
  type BlogCategory,
} from "@/lib/content/blog";
import { type Locale } from "@/lib/content/site-content";
import { createSupabasePublicClient } from "@/lib/supabase/public";

/**
 * The published articles, read from Supabase as `anon`.
 *
 * What is public is decided by the database, not here: the RLS policy on
 * `public.articles` returns only rows that are published and whose date has
 * arrived, so a draft or a future-dated article is not merely hidden by this
 * module -- it never leaves the database. There is deliberately no status
 * filter in the queries below; adding one would suggest the guarantee lives
 * in application code.
 *
 * Articles are Dutch, as they have always been. The English overview shows
 * its empty state and there are no English article routes, so a request for
 * another locale returns nothing without querying.
 *
 * Server-side only: it queries Supabase.
 */
export type PublicArticle = ArticleExtras & {
  slug: string;
  title: string;
  /** The lede above the body, stored as the article's excerpt. */
  intro: string;
  metaTitle: string;
  metaDescription: string;
  category: BlogCategory;
  readingTime: string;
  publishedAt?: string;
  author?: string;
  bodyBlocks: ArticleBlock[];
  path: string;
  /**
   * Only a published article ever reaches this module, so a draft's image
   * path is never handed out either.
   */
  featuredImage?: FeaturedImage;
};

/** The locale the articles are written in. */
const articleLocale: Locale = "nl";

const columns =
  "slug, title, excerpt, content, category, author, published_at, seo_title, meta_description, featured_image";

type ArticleRow = {
  slug: string;
  title: string;
  excerpt: string;
  content: unknown;
  category: string;
  author: string | null;
  published_at: string | null;
  seo_title: string;
  meta_description: string;
  featured_image: unknown;
};

function docFromJson(value: unknown): ArticleDoc {
  return value && typeof value === "object" && !Array.isArray(value) && (value as { type?: unknown }).type === "doc"
    ? (value as ArticleDoc)
    : emptyDoc;
}

function toPublicArticle(row: ArticleRow, locale: Locale): PublicArticle {
  const doc = docFromJson(row.content);
  const extras = getArticleExtras(locale, row.slug);
  const featuredImage = featuredImageFromJson(row.featured_image);

  return {
    ...extras,
    slug: row.slug,
    title: row.title,
    intro: row.excerpt,
    metaTitle: row.seo_title,
    metaDescription: row.meta_description,
    category: row.category as BlogCategory,
    readingTime: extras.readingTime ?? readingTimeLabel(doc),
    bodyBlocks: blocksFromDoc(doc),
    path: getArticlePath(locale, row.slug),
    ...(row.author ? { author: row.author } : {}),
    ...(row.published_at ? { publishedAt: row.published_at } : {}),
    ...(featuredImage ? { featuredImage } : {}),
  };
}

/** Newest first, the way the overview has always listed them. */
export const getPublishedArticles = cache(async (locale: Locale): Promise<PublicArticle[]> => {
  if (locale !== articleLocale) return [];

  const db = createSupabasePublicClient();
  const { data, error } = await db
    .from("articles")
    .select(columns)
    .order("published_at", { ascending: false });

  if (error) throw new Error(`Artikelen laden: ${error.message}`);

  return (data ?? []).map((row) => toPublicArticle(row, locale));
});

export const getArticleBySlug = cache(
  async (locale: Locale, slug: string): Promise<PublicArticle | null> => {
    if (locale !== articleLocale) return null;

    const db = createSupabasePublicClient();
    const { data, error } = await db.from("articles").select(columns).eq("slug", slug).maybeSingle();

    if (error) throw new Error(`Artikel laden: ${error.message}`);

    return data ? toPublicArticle(data, locale) : null;
  },
);

export async function getPublishedArticlePaths(locale: Locale): Promise<string[]> {
  return (await getPublishedArticles(locale)).map((article) => article.path);
}

export function getArticleMetadataInput(locale: Locale, article: PublicArticle) {
  return {
    title: article.metaTitle,
    description: article.metaDescription,
    pathname: getArticlePath(locale, article.slug),
  };
}
