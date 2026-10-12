import { adminDb, failed } from "@/lib/admin/db";
import { isRequestCategory, isRequestStatus, type RequestCategory, type RequestStatus } from "@/lib/requests/model";

/**
 * Customer requests as the admin reads them, under the admin's own session
 * and row level security. Everything the customer wrote, plus what only the
 * admin sees: the submitter, the project link, the status trail.
 */
export type AdminRequestSummary = {
  id: string;
  customerId: string;
  companyName: string;
  category: RequestCategory;
  subject: string;
  status: RequestStatus;
  createdAt: string;
  statusChangedAt: string;
  attachmentCount: number;
};

export type AdminRequestAttachment = { id: string; fileName: string; mimeType: string; bytes: number; createdAt: string };
export type AdminRequestEvent = { fromStatus?: RequestStatus; toStatus: RequestStatus; changedAt: string; byCustomer: boolean };

export type AdminRequest = AdminRequestSummary & {
  description: string;
  submitterEmail?: string;
  projectId?: string;
  quoteId?: string;
  /** When the customer's confirmation went out; absent while it has not. */
  announcedAt?: string;
  /** When YM Creations' own notice of the request went out; absent while it has not. */
  internalNotifiedAt?: string;
  announceAttempts: number;
  attachments: AdminRequestAttachment[];
  events: AdminRequestEvent[];
};

type Row = {
  id: string;
  customer_id: string;
  category: string;
  subject: string;
  description?: string;
  status: string;
  created_at: string;
  status_changed_at: string;
  created_by_user_id?: string | null;
  project_id?: string | null;
  quote_id?: string | null;
  announced_at?: string | null;
  internal_notified_at?: string | null;
  announce_attempts?: number;
  customers: { company_name: string } | null;
  customer_request_attachments: { id: string; file_name: string; mime_type: string; bytes: number; created_at: string }[] | null;
};

function category(value: string): RequestCategory {
  return isRequestCategory(value) ? value : "other";
}

function status(value: string): RequestStatus {
  return isRequestStatus(value) ? value : "submitted";
}

function summaryOf(row: Row): AdminRequestSummary {
  return {
    id: row.id,
    customerId: row.customer_id,
    companyName: row.customers?.company_name ?? "Onbekende klant",
    category: category(row.category),
    subject: row.subject,
    status: status(row.status),
    createdAt: row.created_at,
    statusChangedAt: row.status_changed_at,
    attachmentCount: row.customer_request_attachments?.length ?? 0,
  };
}

const listColumns = "id, customer_id, category, subject, status, created_at, status_changed_at, customers(company_name), customer_request_attachments(id)";

/** Open requests first -- new before the rest -- then the closed ones, newest first within each. */
export async function listRequests(): Promise<AdminRequestSummary[]> {
  const db = await adminDb();
  const { data, error } = await db.from("customer_requests").select(listColumns).order("created_at", { ascending: false });
  failed("Verzoeken laden", error);
  const rank = (value: RequestStatus) => (value === "submitted" ? 0 : value === "completed" || value === "declined" ? 2 : 1);
  return ((data ?? []) as unknown as Row[]).map(summaryOf).sort((a, b) => rank(a.status) - rank(b.status) || b.createdAt.localeCompare(a.createdAt));
}

export async function getRequest(id: string): Promise<AdminRequest | undefined> {
  const db = await adminDb();
  const { data, error } = await db
    .from("customer_requests")
    .select(
      "id, customer_id, category, subject, description, status, created_at, status_changed_at, created_by_user_id, project_id, quote_id, announced_at, internal_notified_at, announce_attempts, customers(company_name), customer_request_attachments(id, file_name, mime_type, bytes, created_at)",
    )
    .eq("id", id)
    .maybeSingle();
  failed("Verzoek laden", error);
  if (!data) return undefined;
  const row = data as unknown as Row;

  const [events, submitter] = await Promise.all([
    db.from("customer_request_status_events").select("from_status, to_status, changed_at, changed_by").eq("request_id", id).order("changed_at"),
    row.created_by_user_id
      ? db.from("customer_users").select("invited_email").eq("user_id", row.created_by_user_id).eq("customer_id", row.customer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  failed("Statusgeschiedenis laden", events.error);

  return {
    ...summaryOf(row),
    description: row.description ?? "",
    ...(submitter.data?.invited_email ? { submitterEmail: submitter.data.invited_email } : {}),
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.quote_id ? { quoteId: row.quote_id } : {}),
    ...(row.announced_at ? { announcedAt: row.announced_at } : {}),
    ...(row.internal_notified_at ? { internalNotifiedAt: row.internal_notified_at } : {}),
    announceAttempts: row.announce_attempts ?? 0,
    attachments: (row.customer_request_attachments ?? [])
      .map((item) => ({ id: item.id, fileName: item.file_name, mimeType: item.mime_type, bytes: item.bytes, createdAt: item.created_at }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    events: (events.data ?? []).map((event) => ({
      ...(event.from_status && isRequestStatus(event.from_status) ? { fromStatus: event.from_status } : {}),
      toStatus: status(event.to_status),
      changedAt: event.changed_at,
      byCustomer: !event.from_status,
    })),
  };
}

/** What a request can be linked to: this customer's projects and quotes, concepts included (the admin's own). */
export async function linkOptions(customerId: string): Promise<{ projects: { id: string; name: string }[]; quotes: { id: string; label: string }[] }> {
  const db = await adminDb();
  const [projects, quotes] = await Promise.all([
    db.from("projects").select("id, name").eq("customer_id", customerId).order("created_at", { ascending: false }),
    db.from("quotes").select("id, number_value, subject, status").eq("customer_id", customerId).order("created_at", { ascending: false }),
  ]);
  failed("Projecten laden", projects.error);
  failed("Offertes laden", quotes.error);
  return {
    projects: (projects.data ?? []).map((project) => ({ id: project.id, name: project.name })),
    quotes: (quotes.data ?? []).map((quote) => ({ id: quote.id, label: `${quote.number_value} · ${quote.subject}${quote.status === "draft" ? " (concept)" : ""}` })),
  };
}
