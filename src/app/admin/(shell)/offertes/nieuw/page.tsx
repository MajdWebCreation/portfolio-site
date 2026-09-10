import Link from "next/link";
import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/admin-page-header";
import QuoteBuilder from "@/components/admin/quotes/quote-builder";
import { requireAdminAccess } from "@/lib/admin/access";
import { listCustomers } from "@/lib/admin/customers/repository";
import { toDateKey } from "@/lib/admin/format";

export const metadata: Metadata = { title: "Nieuwe offerte" };

export default async function NewQuotesPage() {
  await requireAdminAccess();
  const customers = await listCustomers();

  return (
    <div className="space-y-8">
      <AdminPageHeader
        label="Offertes"
        title="Nieuwe offerte"
        actions={
          <Link href="/admin/offertes" className="link-static text-[0.92rem] text-ink">
            Alle offertes
          </Link>
        }
      />
      <QuoteBuilder stored={null} customers={customers} todayKey={toDateKey(new Date())} />
    </div>
  );
}
