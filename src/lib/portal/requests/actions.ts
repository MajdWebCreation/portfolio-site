"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rateLimit } from "@/lib/payments/rate-limit";
import { getPortalAccess } from "@/lib/portal/auth";
import { portalLoginPath, portalNoAccessPath, portalRequestPath, portalRequestsPath } from "@/lib/portal/paths";
import { announceRequest, registerRequestUpload } from "@/lib/portal/privileged";
import { PortalDenied, portalReader } from "@/lib/portal/rpc";
import {
  attachmentProblemLabels,
  attachmentTypes,
  displayFileName,
  normalizeRequest,
  validateRequest,
  type AttachmentMime,
  type RequestErrors,
} from "@/lib/requests/model";

/**
 * Submitting a request and attaching its files, for a portal member.
 *
 * Who acts and for which customer comes from the session; the form's
 * customer id is only compared, so a form left open across a switch of
 * company cannot submit into the other one. The request is made first and
 * on its own -- idempotent by the submission id the form generated once --
 * and its files are added to it afterwards, one by one: a file that fails
 * costs that file, never the request or the files that made it.
 */
export type CreateRequestState =
  | { status: "idle" }
  | { status: "created"; requestId: string }
  | { status: "invalid"; errors: RequestErrors }
  | { status: "stale_customer" | "error"; message: string };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const messages = {
  staleCustomer: "U werkt inmiddels voor een ander bedrijf in het portaal. Laad de pagina opnieuw voordat u een verzoek indient.",
  denied: "U heeft geen toegang (meer) tot dit bedrijf.",
  busy: "U heeft net een paar keer iets ingediend. Wacht een minuut en probeer het dan opnieuw.",
  failed: "Indienen lukte nu niet. Probeer het over een minuut opnieuw; uw verzoek wordt niet dubbel ingediend.",
};

async function member() {
  const access = await getPortalAccess();
  if (access.state === "anonymous") redirect(portalLoginPath);
  if (access.state === "no_membership") redirect(portalNoAccessPath);
  return access.member;
}

export async function createRequestAction(_previous: CreateRequestState, formData: FormData): Promise<CreateRequestState> {
  const identity = await member();
  const customerId = identity.current.customerId;
  if (String(formData.get("customerId") ?? "") !== customerId) return { status: "stale_customer", message: messages.staleCustomer };

  const submissionId = String(formData.get("submissionId") ?? "");
  if (!uuid.test(submissionId)) return { status: "error", message: messages.failed };

  const input = normalizeRequest({ category: formData.get("category"), subject: formData.get("subject"), description: formData.get("description") });
  const errors = validateRequest(input);
  if (Object.keys(errors).length > 0) return { status: "invalid", errors };

  if (!rateLimit(`portal-request:${identity.userId}`, 10, 60).allowed) return { status: "error", message: messages.busy };

  const db = await portalReader();
  const { data, error } = await db.rpc("portal_create_request", {
    p_customer_id: customerId,
    p_submission_id: submissionId,
    p_category: input.category,
    p_subject: input.subject,
    p_description: input.description,
  });
  if (error) {
    if (error.code === "42501") return { status: "error", message: messages.denied };
    if (error.code === "22023") {
      const field = error.message.replace("invalid:", "");
      if (field === "category" || field === "subject" || field === "description") return { status: "invalid", errors: { [field]: "Deze waarde kan niet worden opgeslagen." } };
      if (field === "rate") return { status: "error", message: messages.busy };
    }
    console.error("Portal request create failed", { code: error.code });
    return { status: "error", message: messages.failed };
  }

  const row = data?.[0];
  if (!row) return { status: "error", message: messages.failed };

  /*
    Announced once per request, and retried until it is: a submit and every
    retry of the same intention ask, the lease inside lets one of them send,
    and a send that failed is tried again by the next one. Whatever the mail
    does, the request stands.
  */
  try {
    await announceRequest({ userId: identity.userId, customerId }, row.request_id);
  } catch (caught) {
    console.error("Request announcement failed", { requestId: row.request_id, error: caught instanceof Error ? caught.message : caught });
  }

  revalidatePath(portalRequestsPath);
  return { status: "created", requestId: row.request_id };
}

export type RegisterAttachmentResult =
  | { ok: true; attachment: { id: string; fileName: string; mimeType: string; bytes: number } }
  | { ok: false; error: string };

/**
 * A file the browser just stored under the request becomes an attachment.
 * The checks and the registration are the payment boundary's
 * (registerRequestUpload): it proves the request is this customer's, reads
 * the object's first bytes on the system client and registers it, or
 * removes it again. Here: the session, the shape of the input, the brake.
 */
export async function registerAttachmentAction(input: { customerId: string; requestId: string; storagePath: string; fileName: string; mimeType: string }): Promise<RegisterAttachmentResult> {
  const identity = await member();
  const customerId = identity.current.customerId;
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const requestId = text(input?.requestId);
  const storagePath = text(input?.storagePath);
  const mimeType = text(input?.mimeType);
  if (text(input?.customerId) !== customerId) return { ok: false, error: messages.staleCustomer };
  if (!uuid.test(requestId) || !storagePath.startsWith(`${customerId}/${requestId}/`)) return { ok: false, error: attachmentProblemLabels.failed };
  if (!Object.prototype.hasOwnProperty.call(attachmentTypes, mimeType)) return { ok: false, error: attachmentProblemLabels.type };

  if (!rateLimit(`portal-attachment:${identity.userId}`, 40, 60).allowed) return { ok: false, error: messages.busy };

  try {
    const result = await registerRequestUpload(
      { userId: identity.userId, customerId },
      { requestId, storagePath, fileName: displayFileName(text(input?.fileName)), mimeType: mimeType as AttachmentMime },
    );
    if (!result.ok) {
      const labels = { denied: messages.denied, content: attachmentProblemLabels.content, size: attachmentProblemLabels.size, type: attachmentProblemLabels.type, limit: attachmentProblemLabels.limit, closed: attachmentProblemLabels.closed, failed: attachmentProblemLabels.failed };
      return { ok: false, error: labels[result.reason] };
    }
    revalidatePath(portalRequestPath(requestId));
    return { ok: true, attachment: result.attachment };
  } catch (error) {
    if (error instanceof PortalDenied) return { ok: false, error: messages.denied };
    console.error("Attachment registration failed", { requestId, error: error instanceof Error ? error.message : error });
    return { ok: false, error: attachmentProblemLabels.failed };
  }
}
