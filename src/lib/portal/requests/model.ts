import { integer, records, text } from "@/lib/portal/json";
import { isRequestCategory, isRequestStatus, type RequestCategory, type RequestStatus } from "@/lib/requests/model";
import type { Database } from "@/lib/supabase/database.types";

/**
 * A request as the portal holds it: what portal_requests and portal_request
 * return. No project, no internal link, no submitter: the quote only when
 * the customer may see that quote.
 */
type ListRow = Database["public"]["Functions"]["portal_requests"]["Returns"][number];
type DetailRow = Database["public"]["Functions"]["portal_request"]["Returns"][number];

export type PortalRequestSummary = {
  id: string;
  category: RequestCategory;
  subject: string;
  status: RequestStatus;
  createdAt: string;
  statusChangedAt: string;
  quote?: { id: string; number: string };
  attachmentCount: number;
};

export type PortalRequestAttachment = { id: string; fileName: string; mimeType: string; bytes: number; createdAt: string };

export type PortalRequest = Omit<PortalRequestSummary, "attachmentCount"> & {
  description: string;
  acceptsAttachments: boolean;
  attachments: PortalRequestAttachment[];
};

function category(value: string): RequestCategory {
  if (!isRequestCategory(value)) throw new Error(`categorie ${value}`);
  return value;
}

function status(value: string): RequestStatus {
  if (!isRequestStatus(value)) throw new Error(`status ${value}`);
  return value;
}

export function requestSummaryFromRow(row: ListRow): PortalRequestSummary {
  return {
    id: row.id,
    category: category(row.category),
    subject: row.subject,
    status: status(row.status),
    createdAt: row.created_at,
    statusChangedAt: row.status_changed_at,
    ...(row.quote_id && row.quote_number ? { quote: { id: row.quote_id, number: row.quote_number } } : {}),
    attachmentCount: row.attachment_count,
  };
}

export function requestFromRow(row: DetailRow): PortalRequest {
  return {
    id: row.id,
    category: category(row.category),
    subject: row.subject,
    description: row.description,
    status: status(row.status),
    createdAt: row.created_at,
    statusChangedAt: row.status_changed_at,
    ...(row.quote_id && row.quote_number ? { quote: { id: row.quote_id, number: row.quote_number } } : {}),
    acceptsAttachments: row.accepts_attachments,
    attachments: records(row.attachments, "bijlagen").map((item) => ({
      id: text(item, "id"),
      fileName: text(item, "file_name"),
      mimeType: text(item, "mime_type"),
      bytes: integer(item, "bytes"),
      createdAt: text(item, "created_at"),
    })),
  };
}
