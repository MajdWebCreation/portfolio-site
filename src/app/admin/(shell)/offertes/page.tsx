import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/admin-page-header";
import QuotesList from "@/components/admin/quotes/quotes-list";
import { requireAdminAccess } from "@/lib/admin/access";
import { listQuotes } from "@/lib/admin/quotes/repository";

export const metadata: Metadata = { title: "Offertes" };

export default async function QuotesPage() {
  await requireAdminAccess();
  const items = await listQuotes();

  return (
    <div className="space-y-8">
      <AdminPageHeader title="Offertes" text="Voorstellen per klant, met de status van opvolging." />
      <QuotesList quotes={items} />
    </div>
  );
}
