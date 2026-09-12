import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/admin-page-header";
import ProjectDetail from "@/components/admin/projects/project-detail";
import { requireAdminAccess } from "@/lib/admin/access";
import { getCustomer } from "@/lib/admin/customers/repository";
import { toDateKey } from "@/lib/admin/format";
import { listInvoicesForProject } from "@/lib/admin/invoices/repository";
import { getProject } from "@/lib/admin/projects/repository";
import { listQuotesForProject } from "@/lib/admin/quotes/repository";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await requireAdminAccess();
  const { id } = await params;
  const project = await getProject(id);
  return { title: project ? `${project.name} · Projecten` : "Project" };
}

export default async function ProjectPage({ params }: PageProps) {
  await requireAdminAccess();
  const { id } = await params;
  const project = await getProject(id);

  if (!project) {
    notFound();
  }

  // The documents that name this project, read by that link rather than by
  // filtering every document in the database.
  const [customer, quotes, invoices] = await Promise.all([
    getCustomer(project.customerId),
    listQuotesForProject(project.id),
    listInvoicesForProject(project.id),
  ]);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        label={customer ? `Project · ${customer.companyName}` : "Project"}
        title={project.name}
        actions={
          <Link href="/admin/projecten" className="link-static text-[0.92rem] text-ink">
            Alle projecten
          </Link>
        }
      />
      <ProjectDetail
        project={project}
        customer={customer}
        quotes={quotes}
        invoices={invoices}
        todayKey={toDateKey(new Date())}
      />
    </div>
  );
}
