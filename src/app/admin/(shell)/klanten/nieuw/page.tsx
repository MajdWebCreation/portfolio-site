import Link from "next/link";
import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/admin-page-header";
import CustomerForm from "@/components/admin/customers/customer-form";
import { requireAdminAccess } from "@/lib/admin/access";
import { listCustomers } from "@/lib/admin/customers/repository";

export const metadata: Metadata = { title: "Nieuwe klant" };

export default async function NewCustomerPage() {
  await requireAdminAccess();

  // Only what the duplicate check needs; the form never shows the rest.
  const existing = (await listCustomers()).map((customer) => ({
    id: customer.id,
    companyName: customer.companyName,
    email: customer.email,
  }));

  return (
    <div className="space-y-8">
      <AdminPageHeader
        label="Klanten"
        title="Nieuwe klant"
        text="Een opdrachtgever die niet via het contactformulier of de projectplanner binnenkwam."
        actions={
          <Link href="/admin/klanten" className="link-static text-[0.92rem] text-ink">
            Alle klanten
          </Link>
        }
      />
      <CustomerForm existing={existing} />
    </div>
  );
}
