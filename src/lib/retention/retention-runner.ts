import {
  communicationBodyHasExpired,
  inquiryHasExpired,
  leadHasExpired,
  retentionCutoff,
  type CommunicationRetentionRow,
  type InquiryRetentionRow,
  type LeadRetentionRow,
} from "@/lib/retention/policy";

/**
 * The daily retention pass, separated from where the rows come from.
 *
 * The store hands over candidates (rows older than the cutoff by their own
 * clock) and the sets that protect a row from deletion; the policy decides
 * per row; the store carries out what was decided. The runner owns the order
 * and the counting, and nothing else. It never sees a name, an address or a
 * body: the row types it works with carry identifiers and timestamps only.
 *
 * Nothing is deleted or redacted unless the caller says `apply: true`. The
 * selection runs either way, so a dry run reports exactly what an applied
 * run would have done -- the same rows, the same counts -- and the first
 * production runs can be read before anything is lost.
 */
export type RetentionStore = {
  convertedSources(): Promise<{ inquiryIds: Set<string>; leadIds: Set<string> }>;
  inquiryCandidates(cutoff: string): Promise<InquiryRetentionRow[]>;
  leadCandidates(cutoff: string): Promise<LeadRetentionRow[]>;
  communicationCandidates(cutoff: string): Promise<CommunicationRetentionRow[]>;
  deleteInquiries(ids: string[]): Promise<void>;
  deleteLeads(ids: string[]): Promise<void>;
  redactCommunications(ids: string[]): Promise<void>;
};

export type RetentionOptions = {
  /** True carries the selection out; false only counts it. */
  apply: boolean;
  now?: Date;
};

export type RetentionSummary = {
  /** `applied` when rows were deleted or redacted; `dry-run` when they were only counted. */
  mode: "applied" | "dry-run";
  cutoff: string;
  /** Counts of what the policy selected -- removed in an applied run, merely reported in a dry run. */
  inquiriesSelected: number;
  leadsSelected: number;
  communicationsSelected: number;
};

export async function runRetention(store: RetentionStore, options: RetentionOptions): Promise<RetentionSummary> {
  const { apply, now = new Date() } = options;
  const cutoff = retentionCutoff(now);
  const converted = await store.convertedSources();

  const inquiries = (await store.inquiryCandidates(cutoff))
    .filter((row) => inquiryHasExpired(row, cutoff, converted.inquiryIds))
    .map((row) => row.id);
  if (apply && inquiries.length > 0) await store.deleteInquiries(inquiries);

  const leads = (await store.leadCandidates(cutoff))
    .filter((row) => leadHasExpired(row, cutoff, converted.leadIds))
    .map((row) => row.id);
  if (apply && leads.length > 0) await store.deleteLeads(leads);

  const communications = (await store.communicationCandidates(cutoff))
    .filter((row) => communicationBodyHasExpired(row, cutoff))
    .map((row) => row.id);
  if (apply && communications.length > 0) await store.redactCommunications(communications);

  return {
    mode: apply ? "applied" : "dry-run",
    cutoff,
    inquiriesSelected: inquiries.length,
    leadsSelected: leads.length,
    communicationsSelected: communications.length,
  };
}
