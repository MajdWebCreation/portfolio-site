import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Featured images for articles, stored in Supabase Storage.
 *
 * The article row keeps the object path and the alt text, nothing else: no
 * data URI, no absolute URL. The URL is derived here at render time, so
 * moving the project or renaming the bucket does not mean rewriting rows.
 *
 * The limits below are the same ones the bucket enforces (see the
 * article_media_storage migration). Checking them in the browser too is a
 * courtesy — it turns a rejected upload into a sentence instead of an error —
 * not the boundary. The boundary is the bucket and its policies.
 */
export const articleMediaBucket = "article-media";

export const maxArticleImageBytes = 5 * 1024 * 1024;

export const allowedArticleImageTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

export const allowedArticleImageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export type FeaturedImage = { path: string; alt: string };

/** Human-readable version of the limits, for the editor. */
export const articleImageHint = "JPG, PNG, WebP of AVIF, maximaal 5 MB.";

/**
 * Why a file cannot be uploaded, or null when it can. Type and size only:
 * anything else is the bucket's business.
 */
export function articleImageRejection(file: { type: string; size: number }): string | null {
  if (!(allowedArticleImageTypes as readonly string[]).includes(file.type)) {
    return `Dit bestandstype kan niet. ${articleImageHint}`;
  }
  if (file.size > maxArticleImageBytes) {
    return `Deze afbeelding is te groot. ${articleImageHint}`;
  }
  return null;
}

/**
 * A fresh object path. Stable once written — an article that is renamed keeps
 * pointing at the same object — and unique, so replacing an image never
 * overwrites the one a published article is still showing.
 */
export function articleImageObjectPath(contentType: string): string {
  const extension = allowedArticleImageExtensions[contentType] ?? "bin";
  return `featured/${crypto.randomUUID()}.${extension}`;
}

/** Public CDN URL of a stored object. */
export function articleImageUrl(path: string): string {
  const { url } = getSupabaseEnv();
  return `${url}/storage/v1/object/public/${articleMediaBucket}/${path}`;
}

/** A stored value read back as a featured image, or null when it is not one. */
export function featuredImageFromJson(value: unknown): FeaturedImage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { path, alt } = value as Record<string, unknown>;
  return typeof path === "string" && path.length > 0 && typeof alt === "string" ? { path, alt } : null;
}
