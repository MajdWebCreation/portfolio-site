"use server";

import { revalidatePath } from "next/cache";
import { actionFailed, type ActionResult } from "@/lib/admin/action-result";
import type { ArticleDoc } from "@/lib/admin/articles/doc";
import { slugify } from "@/lib/admin/articles/doc";
import { articleMediaBucket, featuredImageFromJson, type FeaturedImage } from "@/lib/admin/articles/media";
import { isArticleStatus } from "@/lib/admin/articles/types";
import { adminDb, orNull } from "@/lib/admin/db";
import { isDateKey } from "@/lib/admin/format";
import { getArticlePath, getBlogOverviewPath } from "@/lib/content/blog";
import { locales } from "@/lib/content/site-content";
import type { Json } from "@/lib/supabase/database.types";

export type ArticleInput = {
  title: string;
  slug: string;
  excerpt: string;
  content: ArticleDoc;
  status: string;
  category: string;
  author?: string;
  publishedAt?: string;
  seoTitle: string;
  metaDescription: string;
  /** Object path plus alt text, or null when the article has no image. */
  featuredImage?: FeaturedImage | null;
};

const categories = ["kosten", "seo", "webapplicaties", "performance"];

function validate(input: ArticleInput): string | null {
  if (!input.title.trim()) return "Vul een titel in.";
  if (!slugify(input.slug)) return "De slug is leeg of bevat geen bruikbare tekens.";
  if (!isArticleStatus(input.status)) return "Kies een geldige status.";
  if (!categories.includes(input.category)) return "Kies een geldige categorie.";
  if (input.publishedAt && !isDateKey(input.publishedAt)) return "Publicatiedatum is geen geldige datum.";
  if (input.status === "published" && !input.publishedAt) return "Een gepubliceerd artikel heeft een publicatiedatum nodig.";
  if (input.featuredImage) {
    if (!input.featuredImage.path.trim()) return "De afbeelding is onvolledig opgeslagen. Kies hem opnieuw.";
    if (!input.featuredImage.alt.trim()) return "Vul een alt-tekst in bij de uitgelichte afbeelding.";
    if (input.featuredImage.alt.length > 300) return "De alt-tekst is te lang (maximaal 300 tekens).";
  }
  return null;
}

function toRow(input: ArticleInput) {
  return {
    title: input.title.trim(),
    slug: slugify(input.slug),
    excerpt: input.excerpt,
    content: input.content as unknown as Json,
    status: input.status,
    category: input.category,
    author: orNull(input.author),
    published_at: orNull(input.publishedAt),
    seo_title: input.seoTitle,
    meta_description: input.metaDescription,
    featured_image: input.featuredImage
      ? ({ path: input.featuredImage.path.trim(), alt: input.featuredImage.alt.trim() } as unknown as Json)
      : null,
  };
}

/** Creates the article, or updates it when `id` is an existing record. */
export async function saveArticle(id: string | null, input: ArticleInput): Promise<ActionResult<string>> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const db = await adminDb();
  const row = toRow(input);

  // What the article looked like before this save: the slug, so a rename can
  // invalidate the URL it is leaving behind, and the image, so an object that
  // is no longer referenced can be removed from storage afterwards.
  const previous = id
    ? (await db.from("articles").select("slug, featured_image").eq("id", id).maybeSingle()).data
    : null;
  const previousSlug = previous?.slug ?? null;
  const previousImagePath = featuredImageFromJson(previous?.featured_image)?.path ?? null;

  const query = id
    ? db.from("articles").update(row).eq("id", id).select("id").single()
    : db.from("articles").insert(row).select("id").single();

  const { data, error } = await query;
  if (error || !data) {
    // A duplicate slug is the one failure worth naming; the rest is generic.
    const message = error?.code === "23505" ? "Er bestaat al een artikel met deze slug." : undefined;
    return message ? { ok: false, error: message } : actionFailed(error, "Opslaan mislukt.");
  }

  // The image the article no longer points at is deleted only now, after the
  // row that referenced it is gone. Never before: a failed save would then
  // have destroyed the image of a published article.
  const currentImagePath = input.featuredImage?.path.trim() ?? null;
  if (previousImagePath && previousImagePath !== currentImagePath) {
    const { error: removeError } = await db.storage.from(articleMediaBucket).remove([previousImagePath]);
    if (removeError) console.error("Replaced article image not removed", { path: previousImagePath, removeError });
  }

  revalidatePath("/admin/artikelen");
  revalidatePath(`/admin/artikelen/${data.id}`);

  // The public pages read the same rows, so publishing, unpublishing or
  // renaming has to invalidate what they cached. Both slugs are revalidated
  // when one save renames an article: the new URL has to appear and the old
  // one has to stop resolving.
  for (const locale of locales) {
    revalidatePath(getBlogOverviewPath(locale));
    revalidatePath(getArticlePath(locale, row.slug));
    if (previousSlug && previousSlug !== row.slug) {
      revalidatePath(getArticlePath(locale, previousSlug));
    }
  }
  revalidatePath("/sitemap.xml");

  return { ok: true, value: data.id };
}
