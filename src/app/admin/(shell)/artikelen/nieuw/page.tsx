import Link from "next/link";
import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/admin-page-header";
import ArticleEditor from "@/components/admin/articles/article-editor";
import { requireAdminAccess } from "@/lib/admin/access";
import { toDateKey } from "@/lib/admin/format";

export const metadata: Metadata = { title: "Nieuw artikel" };

export default async function NewArticlePage() {
  await requireAdminAccess();

  return (
    <div className="space-y-8">
      <AdminPageHeader
        label="Artikelen"
        title="Nieuw artikel"
        actions={
          <Link href="/admin/artikelen" className="link-static text-[0.92rem] text-ink">
            Alle artikelen
          </Link>
        }
      />
      <ArticleEditor stored={null} todayKey={toDateKey(new Date())} />
    </div>
  );
}
