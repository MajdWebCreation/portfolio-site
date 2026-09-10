import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/admin-page-header";
import ArticleEditor from "@/components/admin/articles/article-editor";
import { requireAdminAccess } from "@/lib/admin/access";
import { getArticle } from "@/lib/admin/articles/repository";
import { toDateKey } from "@/lib/admin/format";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await requireAdminAccess();
  const { id } = await params;
  const article = await getArticle(id);
  return { title: article ? `${article.title} · Artikelen` : "Artikel" };
}

export default async function ArticlePage({ params }: PageProps) {
  await requireAdminAccess();
  const { id } = await params;
  const article = await getArticle(id);

  if (!article) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        label="Artikel"
        title={article.title}
        actions={
          <Link href="/admin/artikelen" className="link-static text-[0.92rem] text-ink">
            Alle artikelen
          </Link>
        }
      />
      <ArticleEditor stored={article} todayKey={toDateKey(new Date())} />
    </div>
  );
}
