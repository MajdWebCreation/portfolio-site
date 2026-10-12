import type { Metadata } from "next";
import Link from "next/link";
import AdminPageHeader from "@/components/admin/admin-page-header";
import StatusBadge from "@/components/admin/status-badge";
import { requireAdminAccess } from "@/lib/admin/access";
import { formatDate } from "@/lib/admin/format";
import { listRequests } from "@/lib/admin/requests/repository";
import { requestCategoryLabels, requestStatusAdminLabels, requestStatusTone } from "@/lib/requests/model";

export const metadata: Metadata = { title: "Verzoeken" };

/** What customers asked for through the portal: new ones first, then what is in hand, then what is closed. */
export default async function AdminRequestsPage() {
  await requireAdminAccess();
  const requests = await listRequests();

  return (
    <div className="space-y-8">
      <AdminPageHeader title="Verzoeken" text="Wat klanten via het klantportaal vragen. Nieuw bovenaan, afgerond en afgewezen onderaan." />
      {requests.length === 0 ? (
        <p className="border-y border-line py-6 text-[0.95rem] text-muted">Er zijn nog geen verzoeken.</p>
      ) : (
        <ul className="border-t border-line">
          {requests.map((request) => (
            <li key={request.id} className="border-b border-line">
              <Link href={`/admin/verzoeken/${request.id}`} className="group grid gap-x-6 gap-y-1 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <span className="min-w-0">
                  <span className="block font-medium text-ink group-hover:underline">{request.subject}</span>
                  <span className="mt-0.5 block text-[0.86rem] text-muted">
                    {request.companyName} · {requestCategoryLabels[request.category]} · {formatDate(request.createdAt)}
                    {request.attachmentCount > 0 ? ` · ${request.attachmentCount} bijlage${request.attachmentCount === 1 ? "" : "n"}` : ""}
                  </span>
                </span>
                <StatusBadge tone={requestStatusTone[request.status]}>{requestStatusAdminLabels[request.status]}</StatusBadge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
