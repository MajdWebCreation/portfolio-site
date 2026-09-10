import { adminDb, failed } from "@/lib/admin/db";
import { articleFromRow } from "@/lib/admin/articles/mapper";
import type { Article } from "@/lib/admin/articles/types";

/** Read access to articles; see inquiries/repository.ts for the access rules. */
const columns =
  "id, title, slug, excerpt, content, status, category, author, published_at, seo_title, meta_description, featured_image, created_at, updated_at";

export async function listArticles(): Promise<Article[]> {
  const db = await adminDb();
  const { data, error } = await db.from("articles").select(columns).order("updated_at", { ascending: false });
  failed("Artikelen laden", error);
  return (data ?? []).map(articleFromRow);
}

export async function getArticle(id: string): Promise<Article | undefined> {
  const db = await adminDb();
  const { data, error } = await db.from("articles").select(columns).eq("id", id).maybeSingle();
  failed("Artikel laden", error);
  return data ? articleFromRow(data) : undefined;
}
