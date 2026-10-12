import type { SupabaseClient } from "@supabase/supabase-js";
import { announceRequestOn } from "@/lib/requests/announce";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The daily second chance for a request's mails: every request whose
 * confirmation or internal notice did not go out -- the provider was down
 * at the submit, nobody pressed retry -- is announced again, through the
 * same lease as the submit and the admin's button, so a request that is
 * being announced right now is skipped and nothing goes out twice.
 *
 * Only requests older than a quarter of an hour (the submit's own attempt
 * and its lease are over) and younger than a week (a confirmation that
 * arrives later than that says nothing any more; the admin page still
 * shows it and offers the retry). Only open requests: a request already
 * completed or declined is past a "received". At most fifty per run, the
 * least tried first, so a request that keeps failing (no address on file)
 * cannot crowd out the others.
 */
export const sweepWindow = { minMinutes: 15, maxDays: 7, limit: 50 } as const;

export type SweepSummary = { considered: number; sent: number; failed: number; skipped: number };

export async function announcePendingRequests(db: SupabaseClient<Database>, now = new Date()): Promise<SweepSummary> {
  const { data, error } = await db
    .from("customer_requests")
    .select("id, customer_id")
    .or("announced_at.is.null,internal_notified_at.is.null")
    .not("status", "in", "(completed,declined)")
    .lt("created_at", new Date(now.getTime() - sweepWindow.minMinutes * 60_000).toISOString())
    .gt("created_at", new Date(now.getTime() - sweepWindow.maxDays * 24 * 3600_000).toISOString())
    .order("announce_attempts", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(sweepWindow.limit);
  if (error) throw new Error(`Onaangekondigde verzoeken zoeken: ${error.message}`);

  const summary: SweepSummary = { considered: data.length, sent: 0, failed: 0, skipped: 0 };
  for (const row of data) {
    const outcome = await announceRequestOn(db, row.customer_id, row.id, now);
    if (outcome.state === "sent" && outcome.internal.sent) summary.sent += 1;
    else if (outcome.state === "skipped") summary.skipped += 1;
    else summary.failed += 1;
  }
  return summary;
}
