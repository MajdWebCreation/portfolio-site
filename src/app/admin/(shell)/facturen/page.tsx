import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/admin-page-header";
import InvoicesList from "@/components/admin/invoices/invoices-list";
import { requireAdminAccess } from "@/lib/admin/access";
import { toDateKey } from "@/lib/admin/format";
import { listInvoices } from "@/lib/admin/invoices/repository";

export const metadata: Metadata = { title: "Facturen" };

export default async function InvoicesPage() {
  await requireAdminAccess();
  const items = await listInvoices();

  return (
    <div className="space-y-8">
      <AdminPageHeader title="Facturen" text="Facturen per klant, met vervaldatum en betaalstatus." />
      <InvoicesList invoices={items} todayKey={toDateKey(new Date())} />
    </div>
  );
}
