import Link from "next/link";
import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/admin-page-header";
import ProjectForm from "@/components/admin/projects/project-form";
import { requireAdminAccess } from "@/lib/admin/access";
import { listCustomers } from "@/lib/admin/customers/repository";

export const metadata: Metadata = { title: "Nieuw project" };

type PageProps = { searchParams: Promise<{ klant?: string }> };

export default async function NewProjectPage({ searchParams }: PageProps) {
  await requireAdminAccess();
  const [{ klant }, customers] = await Promise.all([searchParams, listCustomers()]);

  // A customer page links here with ?klant=<id>. An id that no longer exists
  // preselects nothing rather than a customer that is not there.
  const preselected = customers.find((customer) => customer.id === klant)?.id ?? "";

  return (
    <div className="space-y-8">
      <AdminPageHeader
        label="Projecten"
        title="Nieuw project"
        text="Werk voor één klant. Offertes en facturen koppel je later vanaf het document zelf."
        actions={
          <Link href="/admin/projecten" className="link-static text-[0.92rem] text-ink">
            Alle projecten
          </Link>
        }
      />
      <ProjectForm customers={customers} customerId={preselected} />
    </div>
  );
}
