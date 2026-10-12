import type { Metadata } from "next";
import Link from "next/link";
import { DetailList, DetailRow } from "@/components/admin/detail-list";
import StatusBadge from "@/components/admin/status-badge";
import RequestAttachmentAdder from "@/components/portal/request-attachments";
import { day, PageHeader, Section } from "@/components/portal/portal-ui";
import { formatDateTime } from "@/lib/admin/format";
import { orNotFound, requirePortalMember } from "@/lib/portal/access";
import { portalQuotePath, portalRequestAttachmentPath, portalRequestsPath } from "@/lib/portal/paths";
import { readPortalRequest } from "@/lib/portal/requests/read";
import { formatBytes, requestCategoryLabels, requestStatusLabels, requestStatusTone } from "@/lib/requests/model";

export const metadata: Metadata = { title: "Verzoek" };

type PageProps = { params: Promise<{ id: string }> };

/** One request: what was asked, where it stands, its files, and the quote made for it when there is one. */
export default async function PortalRequestPage({ params }: PageProps) {
  const member = await requirePortalMember();
  const { id } = await params;
  const request = await orNotFound(readPortalRequest(member.current.customerId, id));

  return (
    <div>
      <p className="text-[0.9rem]">
        <Link href={portalRequestsPath} className="link-static text-muted">
          ← Verzoeken
        </Link>
      </p>
      <div className="mt-6">
        <PageHeader label={requestCategoryLabels[request.category]} title={request.subject} />
      </div>
      <div className="mt-4">
        <StatusBadge tone={requestStatusTone[request.status]}>{requestStatusLabels[request.status]}</StatusBadge>
      </div>

      {request.status === "awaiting_customer" ? (
        <p className="mt-6 max-w-prose border-l-2 border-danger pl-4 text-[0.95rem] text-body">
          We hebben iets van u nodig om verder te kunnen. Kijk in uw mail, of neem contact op via contact@ymcreations.com.
        </p>
      ) : null}

      {request.quote ? (
        <div className="mt-6 max-w-prose border-l-2 border-accent pl-4 text-[0.95rem] text-body">
          <p>Voor dit verzoek is een offerte beschikbaar.</p>
          <p className="mt-2">
            <Link href={portalQuotePath(request.quote.id)} className="link-static text-ink">
              Bekijk offerte {request.quote.number}
            </Link>
          </p>
        </div>
      ) : null}

      <DetailList className="mt-8">
        <DetailRow term="Ingediend">{formatDateTime(request.createdAt)}</DetailRow>
        <DetailRow term="Status sinds">{day(request.statusChangedAt.slice(0, 10))}</DetailRow>
        <DetailRow term="Categorie">{requestCategoryLabels[request.category]}</DetailRow>
      </DetailList>

      <Section title="Omschrijving">
        <p className="max-w-prose whitespace-pre-line break-words text-[0.98rem] leading-relaxed text-body">{request.description}</p>
      </Section>

      <Section title="Bijlagen">
        {request.attachments.length === 0 ? (
          <p className="text-[0.92rem] text-muted">Er zijn geen bijlagen.</p>
        ) : (
          <ul className="border-t border-line">
            {request.attachments.map((attachment) => (
              <li key={attachment.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line py-2.5 text-[0.92rem]">
                <a href={portalRequestAttachmentPath(attachment.id)} className="link-static min-w-0 break-all text-ink" download>
                  {attachment.fileName}
                </a>
                <span className="text-muted">{formatBytes(attachment.bytes)}</span>
              </li>
            ))}
          </ul>
        )}
        {request.acceptsAttachments ? (
          <RequestAttachmentAdder key={member.current.customerId} customerId={member.current.customerId} requestId={request.id} existing={request.attachments.length} />
        ) : null}
      </Section>
    </div>
  );
}
