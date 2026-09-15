import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/admin-page-header";
import ProjectDetail from "@/components/admin/projects/project-detail";
import { requireAdminAccess } from "@/lib/admin/access";
import { toDateKey } from "@/lib/admin/format";
import { listInvoicesForProject } from "@/lib/admin/invoices/repository";
import { listQuotesForProject } from "@/lib/admin/quotes/repository";
import { readCustomer, readProject } from "@/lib/admin/readers";
import { activationSummaries, mandateByCustomer } from "@/lib/payments/activation-view";
import { listRecurringServicesForProject } from "@/lib/payments/repository";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await requireAdminAccess();
  const { id } = await params;
  const project = await readProject(id);
  return { title: project ? `${project.name} · Projecten` : "Project" };
}

export default async function ProjectPage({ params }: PageProps) {
  await requireAdminAccess();
  const { id } = await params;
  const project = await readProject(id);

  if (!project) {
    notFound();
  }

  // The documents that name this project, read by that link rather than by
  // filtering every document in the database. A project's services belong to
  // its customer (recurring_services_project_same_customer), so the mandate
  // question can be asked now, alongside the services, rather than after them.
  const [customer, quotes, invoices, recurringServices, mandates] = await Promise.all([
    readCustomer(project.customerId),
    listQuotesForProject(project.id),
    listInvoicesForProject(project.id),
    listRecurringServicesForProject(project.id),
    mandateByCustomer([project.customerId]),
  ]);
  // One more read only when a service names an activation invoice outside
  // this project's own list.
  const recurringActivations = await activationSummaries(recurringServices, {
    customerIds: [project.customerId],
    mandates,
    invoices,
  });

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
        recurringServices={recurringServices}
        recurringActivations={recurringActivations}
        todayKey={toDateKey(new Date())}
      />
    </div>
  );
}
