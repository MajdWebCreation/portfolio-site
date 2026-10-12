import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCustomerRecipient } from "@/lib/admin/communications/recipient";
import { sendInternalRequestNotice, sendRequestReceivedMail, type MailOutcome } from "@/lib/requests/mail";
import { isRequestCategory } from "@/lib/requests/model";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Announcing a request: the customer's confirmation and the internal notice
 * to YM Creations, each tracked on its own (announced_at,
 * internal_notified_at) and each with a provider idempotency key.
 *
 * At most one sender at a time, through a lease on the request
 * (announce_claimed_at): the claim is a single conditional update, so of
 * two senders at once one gets the row and the other nothing. `announced_at`
 * is written only when the confirmation really went out. A failed send gives
 * the lease back at once, so the next retry sends; a sender that died
 * holding the lease loses it after `announceLeaseMinutes`. The request is
 * never touched beyond these three columns, whatever the mail does.
 *
 * Run on the client the caller holds: the portal's payment boundary hands
 * the system client (the member has no write on the table), the admin's
 * retry its own session (row level security and a column grant).
 */
export const announceLeaseMinutes = 10;

export type AnnounceOutcome =
  | { state: "sent"; internal: MailOutcome }
  | { state: "failed"; reason: string }
  | { state: "skipped" };

type Db = SupabaseClient<Database>;

type Claimed = {
  id: string;
  subject: string;
  category: string;
  description: string;
  announce_attempts: number;
  announced_at: string | null;
  internal_notified_at: string | null;
  customers: { company_name: string } | null;
};

export async function announceRequestOn(db: Db, customerId: string, requestId: string, now = new Date()): Promise<AnnounceOutcome> {
  const claimedAt = now.toISOString();
  const staleBefore = new Date(now.getTime() - announceLeaseMinutes * 60_000).toISOString();

  const { data, error } = await db
    .from("customer_requests")
    .update({ announce_claimed_at: claimedAt })
    .eq("id", requestId)
    .eq("customer_id", customerId)
    .or("announced_at.is.null,internal_notified_at.is.null")
    .or(`announce_claimed_at.is.null,announce_claimed_at.lt.${staleBefore}`)
    .select("id, subject, category, description, announce_attempts, announced_at, internal_notified_at, customers!inner(company_name)")
    .maybeSingle();
  if (error) return { state: "failed", reason: error.message };
  /* Announced already, or someone else is announcing it right now. */
  if (!data) return { state: "skipped" };
  const request = data as unknown as Claimed;
  const category = isRequestCategory(request.category) ? request.category : "other";

  let confirmation: MailOutcome = { sent: true };
  if (!request.announced_at) try {
    const recipient = await resolveCustomerRecipient(db, customerId, "general");
    confirmation = recipient.ok
      ? await sendRequestReceivedMail({ db, customerId, category: "request_received" }, recipient.recipient, {
          requestId: request.id,
          subject: request.subject,
          category,
        })
      : { sent: false, reason: recipient.reason };
  } catch (caught) {
    confirmation = { sent: false, reason: caught instanceof Error ? caught.message : "onbekende fout" };
  }

  /* The internal notice until it went out once; its own record, so a confirmation that succeeds does not hide a notice that failed. */
  let internal: MailOutcome = { sent: true };
  if (!request.internal_notified_at) {
    internal = await sendInternalRequestNotice({
      requestId: request.id,
      companyName: request.customers?.company_name ?? "Onbekende klant",
      subject: request.subject,
      category,
      description: request.description,
    }).catch((caught: unknown) => ({ sent: false as const, reason: caught instanceof Error ? caught.message : "onbekende fout" }));
  }

  /* Released or completed only by the holder of this very lease. */
  const { error: releaseError } = await db
    .from("customer_requests")
    .update({
      announce_claimed_at: null,
      announce_attempts: request.announce_attempts + 1,
      ...(!request.announced_at && confirmation.sent ? { announced_at: new Date().toISOString() } : {}),
      ...(!request.internal_notified_at && internal.sent ? { internal_notified_at: new Date().toISOString() } : {}),
    })
    .eq("id", request.id)
    .eq("announce_claimed_at", claimedAt);
  if (releaseError) console.error("Announcement lease not released", { requestId: request.id, code: releaseError.code });

  if (!confirmation.sent || !internal.sent) {
    console.error("Request mail not sent", { requestId: request.id, confirmation: confirmation.sent, internal: internal.sent });
  }
  return confirmation.sent ? { state: "sent", internal } : { state: "failed", reason: confirmation.reason };
}
