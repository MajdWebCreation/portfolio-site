import type { Metadata } from "next";
import AdminPageHeader from "@/components/admin/admin-page-header";
import ProjectsList from "@/components/admin/projects/projects-list";
import { requireAdminAccess } from "@/lib/admin/access";
import { listCustomers } from "@/lib/admin/customers/repository";
import { toDateKey } from "@/lib/admin/format";
import { listProjects } from "@/lib/admin/projects/repository";

export const metadata: Metadata = { title: "Projecten" };

export default async function ProjectsPage() {
  await requireAdminAccess();
  const [projects, customers] = await Promise.all([listProjects(), listCustomers()]);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Projecten"
        text="Het werk per klant. Gesorteerd op wat loopt en welke deadline het eerst komt."
      />
      <ProjectsList projects={projects} customers={customers} todayKey={toDateKey(new Date())} />
    </div>
  );
}
