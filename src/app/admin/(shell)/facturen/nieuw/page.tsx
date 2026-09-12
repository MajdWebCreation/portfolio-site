import Link from "next/link";
import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/admin-page-header";
import InvoiceBuilder from "@/components/admin/invoices/invoice-builder";
import { requireAdminAccess } from "@/lib/admin/access";
import { listCustomers } from "@/lib/admin/customers/repository";
import { toDateKey } from "@/lib/admin/format";
import { listProjects } from "@/lib/admin/projects/repository";

export const metadata: Metadata = { title: "Nieuwe factuur" };

export default async function NewInvoicesPage() {
  await requireAdminAccess();
  const [customers, projects] = await Promise.all([listCustomers(), listProjects()]);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        label="Facturen"
        title="Nieuwe factuur"
        actions={
          <Link href="/admin/facturen" className="link-static text-[0.92rem] text-ink">
            Alle facturen
          </Link>
        }
      />
      <InvoiceBuilder stored={null} customers={customers} projects={projects} todayKey={toDateKey(new Date())} />
    </div>
  );
}
