import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/admin-page-header";
import CustomersList from "@/components/admin/customers/customers-list";
import { requireAdminAccess } from "@/lib/admin/access";
import { listCustomers } from "@/lib/admin/customers/repository";

export const metadata: Metadata = { title: "Klanten" };

export default async function CustomersPage() {
  await requireAdminAccess();
  const customers = await listCustomers();
  const active = customers.filter((customer) => customer.status === "active").length;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Klanten"
        text={`Opdrachtgevers en hun gegevens voor offertes en facturen. ${active} actief.`}
      />
      <CustomersList customers={customers} />
    </div>
  );
}
