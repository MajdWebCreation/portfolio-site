import type { Metadata } from "next";
import Link from "next/link";
import StatusBadge from "@/components/admin/status-badge";
import { day, DocumentList, DocumentRow, Empty, PageHeader } from "@/components/portal/portal-ui";
import { orNoAccess, requirePortalMember } from "@/lib/portal/access";
import { portalNewRequestPath, portalRequestPath } from "@/lib/portal/paths";
import { readPortalRequests } from "@/lib/portal/requests/read";
import { requestCategoryLabels, requestStatusLabels, requestStatusTone } from "@/lib/requests/model";

export const metadata: Metadata = { title: "Verzoeken" };

/** Everything this customer asked for, newest first, each with where it stands. */
export default async function PortalRequestsPage() {
  const member = await requirePortalMember();
  const requests = await orNoAccess(readPortalRequests(member.current.customerId));

  return (
    <div>
      <PageHeader label="Verzoeken" title="Uw verzoeken">
        <p>Een wijziging, een nieuwe pagina, een probleem of een nieuw idee: dien het hier in en volg de status.</p>
      </PageHeader>
      <p className="mt-6">
        <Link
          href={portalNewRequestPath}
          className="inline-flex min-h-11 items-center justify-center rounded-sm bg-ink px-5 text-[0.95rem] font-medium text-paper"
        >
          Nieuw verzoek
        </Link>
      </p>

      <div className="mt-10">
        {requests.length === 0 ? (
          <Empty>U heeft nog geen verzoeken ingediend.</Empty>
        ) : (
          <DocumentList>
            {requests.map((request) => (
              <DocumentRow
                key={request.id}
                href={portalRequestPath(request.id)}
                number={request.subject}
                meta={`${requestCategoryLabels[request.category]} · ingediend ${day(request.createdAt.slice(0, 10))}${
                  request.statusChangedAt.slice(0, 10) !== request.createdAt.slice(0, 10) ? ` · bijgewerkt ${day(request.statusChangedAt.slice(0, 10))}` : ""
                }${request.quote ? ` · offerte ${request.quote.number}` : ""}`}
                badge={<StatusBadge tone={requestStatusTone[request.status]}>{requestStatusLabels[request.status]}</StatusBadge>}
              />
            ))}
          </DocumentList>
        )}
      </div>
    </div>
  );
}
