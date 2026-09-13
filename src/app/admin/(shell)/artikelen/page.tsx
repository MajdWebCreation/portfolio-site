import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/admin-page-header";
import ArticlesList from "@/components/admin/articles/articles-list";
import { requireAdminAccess } from "@/lib/admin/access";
import { listArticles, listArticleStates } from "@/lib/admin/articles/repository";
import { isScheduled } from "@/lib/admin/articles/types";
import { toDateKey } from "@/lib/admin/format";

export const metadata: Metadata = { title: "Artikelen" };

type PageProps = { searchParams: Promise<{ q?: string | string[] }> };

export default async function ArticlesPage({ searchParams }: PageProps) {
  await requireAdminAccess();

  const { q } = await searchParams;
  const search = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";

  /* The rows are what the search returns; the counts in the header are about
     the whole library, so they are only read separately when a search is
     narrowing the rows. */
  const [articles, states] = await Promise.all([
    listArticles(search),
    search ? listArticleStates() : Promise.resolve(null),
  ]);

  const todayKey = toDateKey(new Date());
  const library = states ?? articles;
  const scheduled = library.filter((article) => isScheduled(article, todayKey)).length;
  const published = library.filter((article) => article.status === "published").length - scheduled;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Artikelen"
        text={`Inzichten schrijven, plannen en bewerken. ${published} live op de website${
          scheduled > 0 ? `, ${scheduled} ingepland` : ""
        }.`}
      />
      <ArticlesList articles={articles} todayKey={todayKey} search={search} />
    </div>
  );
}
