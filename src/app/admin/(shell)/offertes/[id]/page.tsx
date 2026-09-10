import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/admin-page-header";
import QuoteBuilder from "@/components/admin/quotes/quote-builder";
import { requireAdminAccess } from "@/lib/admin/access";
import { listCustomers } from "@/lib/admin/customers/repository";
import { toDateKey } from "@/lib/admin/format";
import { getQuote } from "@/lib/admin/quotes/repository";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await requireAdminAccess();
  const { id } = await params;
  const item = await getQuote(id);
  return { title: item ? `${item.number.value} · Offertes` : "Offerte" };
}

export default async function QuotesDetailPage({ params }: PageProps) {
  await requireAdminAccess();
  const { id } = await params;
  const item = await getQuote(id);
  const customers = await listCustomers();

  if (!item) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        label={`Offerte · ${item.number.value}`}
        title={item.customer.companyName}
        text={item.subject}
        actions={
          <Link href="/admin/offertes" className="link-static text-[0.92rem] text-ink">
            Alle offertes
          </Link>
        }
      />
      {/*
        Keyed on what sending changes. Issuing a number and setting the status
        happen on the server, so the builder has to start again from the
        stored record rather than keep showing the concept it was mounted with.
      */}
      <QuoteBuilder
        key={`${item.number.value}-${item.status}`}
        stored={item}
        customers={customers}
        todayKey={toDateKey(new Date())}
      />
    </div>
  );
}
