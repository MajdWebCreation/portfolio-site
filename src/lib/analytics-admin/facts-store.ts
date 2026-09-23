import type { SupabaseClient } from "@supabase/supabase-js";
import type { FactRow, FactsStore } from "@/lib/analytics-admin/types";
import type { Database, Json } from "@/lib/supabase/database.types";

/**
 * The facts store on Supabase.
 *
 * Written through the elevated server-side client only: the tables have no
 * insert, update or delete policy for any API role, so an admin session
 * could not write here even if it tried, and the job that syncs has no
 * session at all. Upserts go in batches on the table's key
 * (provider, report, date, dims_key); the last column is generated from
 * `dims` in the database, which is what makes a re-sync of the same day
 * an update rather than a duplicate.
 *
 * Errors are rethrown with a fixed name so the runner can class them as
 * store failures without reading into the message.
 */
const BATCH = 500;

class FactsStoreError extends Error {
  constructor(operation: string, message: string) {
    super(`${operation}: ${message}`);
    this.name = "FactsStoreError";
  }
}

export function createFactsStore(db: SupabaseClient<Database>): FactsStore {
  return {
    async upsert(rows: FactRow[]) {
      let count = 0;
      for (let index = 0; index < rows.length; index += BATCH) {
        const batch = rows.slice(index, index + BATCH).map((row) => ({
          provider: row.provider,
          report: row.report,
          date: row.date,
          dims: row.dims as Json,
          metrics: row.metrics as Json,
          synced_at: new Date().toISOString(),
        }));
        const { error } = await db.from("analytics_facts").upsert(batch, { onConflict: "provider,report,date,dims_key" });
        if (error) throw new FactsStoreError("Facts opslaan", error.message);
        count += batch.length;
      }
      return count;
    },

    async startRun(provider, report) {
      const { data, error } = await db
        .from("analytics_sync_runs")
        .insert({ provider, report, status: "running" })
        .select("id")
        .single();
      if (error || !data) throw new FactsStoreError("Sync-run starten", error?.message ?? "geen id");
      return data.id;
    },

    async finishRun(id, outcome) {
      const { error } = await db
        .from("analytics_sync_runs")
        .update({
          status: outcome.status,
          rows_upserted: outcome.rows,
          error: outcome.error ? outcome.error.slice(0, 200) : null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw new FactsStoreError("Sync-run afronden", error.message);
    },

    async deleteOlderThan(cutoffDate) {
      const { data, error } = await db.from("analytics_facts").delete().lt("date", cutoffDate).select("date");
      if (error) throw new FactsStoreError("Oude facts verwijderen", error.message);
      return data?.length ?? 0;
    },
  };
}
