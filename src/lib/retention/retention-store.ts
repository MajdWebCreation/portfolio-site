import type { SupabaseClient } from "@supabase/supabase-js";
import { listCommunicationsOlderThan, redactCommunicationBodies } from "@/lib/admin/communications/log";
import { redactableCategories, retentionRedactedBody } from "@/lib/retention/policy";
import type { RetentionStore } from "@/lib/retention/retention-runner";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The retention store on Supabase.
 *
 * Every candidate query prefilters on the table's own `updated_at` or
 * `created_at` so the job never reads rows that cannot qualify; the policy
 * then decides per row on the full set of timestamps. Only identifiers,
 * statuses and timestamps are selected -- never a name, address, message or
 * body -- so nothing personal passes through the job at all.
 *
 * The communication log is read and written through its own module, which
 * is the one place allowed to touch that table.
 */
export function createRetentionStore(db: SupabaseClient<Database>): RetentionStore {
  return {
    async convertedSources() {
      const { data, error } = await db
        .from("customers")
        .select("source_inquiry_id, source_lead_id")
        .or("source_inquiry_id.not.is.null,source_lead_id.not.is.null");
      if (error) throw new Error(`Klantbronnen laden: ${error.message}`);
      return {
        inquiryIds: new Set(data.flatMap((row) => (row.source_inquiry_id ? [row.source_inquiry_id] : []))),
        leadIds: new Set(data.flatMap((row) => (row.source_lead_id ? [row.source_lead_id] : []))),
      };
    },

    async inquiryCandidates(cutoff) {
      const { data, error } = await db.from("inquiries").select("id, received_at, updated_at").lt("updated_at", cutoff);
      if (error) throw new Error(`Aanvragen laden: ${error.message}`);
      return data;
    },

    async leadCandidates(cutoff) {
      const { data, error } = await db
        .from("leads")
        .select("id, status, created_at, updated_at, last_contact_at, next_follow_up_at")
        .lt("updated_at", cutoff);
      if (error) throw new Error(`Leads laden: ${error.message}`);
      return data;
    },

    communicationCandidates(cutoff) {
      return listCommunicationsOlderThan(db, cutoff, redactableCategories);
    },

    async deleteInquiries(ids) {
      const { error } = await db.from("inquiries").delete().in("id", ids);
      if (error) throw new Error(`Aanvragen verwijderen: ${error.message}`);
    },

    async deleteLeads(ids) {
      const { error } = await db.from("leads").delete().in("id", ids);
      if (error) throw new Error(`Leads verwijderen: ${error.message}`);
    },

    redactCommunications(ids) {
      return redactCommunicationBodies(db, ids, retentionRedactedBody);
    },
  };
}
