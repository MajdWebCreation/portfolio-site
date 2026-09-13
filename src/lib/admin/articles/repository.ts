import { adminDb, failed } from "@/lib/admin/db";
import { articleFromRow, articleSummaryFromRow, type ArticleSummaryRow } from "@/lib/admin/articles/mapper";
import type { Article, ArticleSummary } from "@/lib/admin/articles/types";

/** Read access to articles; see inquiries/repository.ts for the access rules. */
const columns =
  "id, title, slug, excerpt, content, status, category, author, published_at, seo_title, meta_description, featured_image, created_at, updated_at";

/** The list renders a table, not an article: no excerpt, no editor document. */
const summaryColumns = "id, title, slug, status, category, published_at, updated_at";

/**
 * The articles for the list, newest change first, optionally narrowed by a
 * search term.
 *
 * The search runs here rather than in the browser. `search_text` is a stored
 * generated column holding the article's title, slug, excerpt and body as
 * lowercase plain text -- the database keeps it in step with `content`,
 * whatever writes it -- with a trigram index for the substring match. What
 * used to cost half a megabyte of editor documents per page load is now a
 * `like` the database answers.
 */
export async function listArticles(search?: string): Promise<ArticleSummary[]> {
  const db = await adminDb();
  const needle = search?.trim().toLowerCase();

  let query = db.from("articles").select(summaryColumns).order("updated_at", { ascending: false });

  if (needle) {
    // `%` and `_` are wildcards in `like` and a lone backslash is a dangling
    // escape, so someone typing one of them means the character itself.
    const escaped = needle.replace(/[\\%_]/g, (character) => `\\${character}`);
    query = query.like("search_text", `%${escaped}%`);
  }

  const { data, error } = await query;
  failed("Artikelen laden", error);
  return ((data ?? []) as ArticleSummaryRow[]).map(articleSummaryFromRow);
}

/**
 * Status and publication date of every article. The page header counts what
 * is live and what is scheduled, and that is a statement about the library --
 * it should not change while someone types in the search field. Two columns
 * over the whole table is cheaper than making the search answer a question it
 * was not asked.
 */
export async function listArticleStates(): Promise<Pick<ArticleSummary, "status" | "publishedAt">[]> {
  const db = await adminDb();
  const { data, error } = await db.from("articles").select("status, published_at");
  failed("Artikelen tellen", error);
  return (data ?? []).map((row) => ({
    status: row.status as ArticleSummary["status"],
    ...(row.published_at ? { publishedAt: row.published_at } : {}),
  }));
}

export async function getArticle(id: string): Promise<Article | undefined> {
  const db = await adminDb();
  const { data, error } = await db.from("articles").select(columns).eq("id", id).maybeSingle();
  failed("Artikel laden", error);
  return data ? articleFromRow(data) : undefined;
}
