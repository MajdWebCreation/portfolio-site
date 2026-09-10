import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/admin-page-header";
import ArticlesList from "@/components/admin/articles/articles-list";
import { requireAdminAccess } from "@/lib/admin/access";
import { listArticles } from "@/lib/admin/articles/repository";

export const metadata: Metadata = { title: "Artikelen" };

export default async function ArticlesPage() {
  await requireAdminAccess();
  const articles = await listArticles();
  const published = articles.filter((article) => article.status === "published").length;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Artikelen"
        text={`Inzichten schrijven en bewerken. ${published} gepubliceerd en zichtbaar op de website.`}
      />
      <ArticlesList articles={articles} />
    </div>
  );
}
