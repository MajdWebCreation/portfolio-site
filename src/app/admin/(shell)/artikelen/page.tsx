import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/admin-page-header";
import ArticlesList from "@/components/admin/articles/articles-list";
import { requireAdminAccess } from "@/lib/admin/access";
import { listArticles } from "@/lib/admin/articles/repository";
import { isScheduled } from "@/lib/admin/articles/types";
import { toDateKey } from "@/lib/admin/format";

export const metadata: Metadata = { title: "Artikelen" };

export default async function ArticlesPage() {
  await requireAdminAccess();
  const articles = await listArticles();
  const todayKey = toDateKey(new Date());
  const scheduled = articles.filter((article) => isScheduled(article, todayKey)).length;
  const published = articles.filter((article) => article.status === "published").length - scheduled;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Artikelen"
        text={`Inzichten schrijven, plannen en bewerken. ${published} live op de website${
          scheduled > 0 ? `, ${scheduled} ingepland` : ""
        }.`}
      />
      <ArticlesList articles={articles} todayKey={todayKey} />
    </div>
  );
}
