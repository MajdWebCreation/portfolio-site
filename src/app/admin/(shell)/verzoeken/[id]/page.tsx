import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/components/admin/admin-page-header";
import AdminSection from "@/components/admin/admin-section";
import { DetailList, DetailRow } from "@/components/admin/detail-list";
import AnnouncementRetry from "@/components/admin/requests/announcement-retry";
import RequestControls from "@/components/admin/requests/request-controls";
import StatusBadge from "@/components/admin/status-badge";
import { requireAdminAccess } from "@/lib/admin/access";
import { formatDateTime } from "@/lib/admin/format";
import { getRequest, linkOptions } from "@/lib/admin/requests/repository";
import { formatBytes, requestCategoryLabels, requestStatusAdminLabels, requestStatusTone } from "@/lib/requests/model";

export const metadata: Metadata = { title: "Verzoek" };

type PageProps = { params: Promise<{ id: string }> };

export default async function AdminRequestPage({ params }: PageProps) {
  await requireAdminAccess();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const request = await getRequest(id);
  if (!request) notFound();
  const options = await linkOptions(request.customerId);
  const attempts = request.announceAttempts;
  const notSent = `Nog niet verstuurd${attempts > 0 ? ` (${attempts} ${attempts === 1 ? "poging" : "pogingen"})` : ""}`;

  return (
    <div className="space-y-10">
      <AdminPageHeader
        label="Verzoek"
        title={request.subject}
        meta={<StatusBadge tone={requestStatusTone[request.status]}>{requestStatusAdminLabels[request.status]}</StatusBadge>}
      />

      <DetailList>
        <DetailRow term="Klant">
          <Link href={`/admin/klanten/${request.customerId}`} className="link-static">
            {request.companyName}
          </Link>
        </DetailRow>
        <DetailRow term="Ingediend door">{request.submitterEmail ?? "Onbekend"}</DetailRow>
        <DetailRow term="Ingediend">{formatDateTime(request.createdAt)}</DetailRow>
        <DetailRow term="Categorie">{requestCategoryLabels[request.category]}</DetailRow>
        <DetailRow term="Ontvangstbevestiging">
          {request.announcedAt ? `Verstuurd op ${formatDateTime(request.announcedAt)}` : <span className="text-danger">{notSent}</span>}
        </DetailRow>
        <DetailRow term="Interne melding">
          {request.internalNotifiedAt ? `Verstuurd op ${formatDateTime(request.internalNotifiedAt)}` : <span className="text-danger">{notSent}</span>}
        </DetailRow>
        {!request.announcedAt || !request.internalNotifiedAt ? (
          <DetailRow term="Mail">
            <AnnouncementRetry requestId={request.id} />
          </DetailRow>
        ) : null}
      </DetailList>

      <AdminSection id="description" title="Omschrijving">
        <p className="max-w-prose whitespace-pre-line break-words text-[0.95rem] leading-relaxed text-body">{request.description}</p>
      </AdminSection>

      <AdminSection id="attachments" title="Bijlagen">
        {request.attachments.length === 0 ? (
          <p className="text-[0.92rem] text-muted">Geen bijlagen.</p>
        ) : (
          <ul className="border-t border-line">
            {request.attachments.map((attachment) => (
              <li key={attachment.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line py-2.5 text-[0.92rem]">
                <a href={`/admin/verzoeken/${request.id}/bijlagen/${attachment.id}`} className="link-static min-w-0 break-all text-ink" download>
                  {attachment.fileName}
                </a>
                <span className="text-muted">
                  {attachment.mimeType} · {formatBytes(attachment.bytes)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      <AdminSection id="handling" title="Behandeling">
        <RequestControls
          requestId={request.id}
          status={request.status}
          {...(request.projectId ? { projectId: request.projectId } : {})}
          {...(request.quoteId ? { quoteId: request.quoteId } : {})}
          projects={options.projects}
          quotes={options.quotes}
        />
      </AdminSection>

      <AdminSection id="history" title="Statusgeschiedenis">
        <ol className="border-t border-line">
          {request.events.map((event, index) => (
            <li key={index} className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-b border-line py-2.5 text-[0.9rem]">
              <span className="text-ink">
                {event.fromStatus ? `${requestStatusAdminLabels[event.fromStatus]} → ` : ""}
                {requestStatusAdminLabels[event.toStatus]}
                {event.byCustomer ? <span className="ml-2 text-muted">ingediend door de klant</span> : null}
              </span>
              <span className="text-muted">{formatDateTime(event.changedAt)}</span>
            </li>
          ))}
        </ol>
      </AdminSection>
    </div>
  );
}
