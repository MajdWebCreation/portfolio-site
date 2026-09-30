import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serviceKeys } from "@/lib/content/services";

/**
 * The service_interest check constraint in the lifecycle migration lists
 * the site's service keys as literals (the database cannot import
 * TypeScript). This reads that list back out of the migration file and
 * compares it with `serviceKeys`, so a service added to the site without
 * widening the constraint fails a test instead of an admin save.
 */
export function serviceInterestOptionsMirrorTheSiteServices(): boolean {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260930193617_inquiry_lifecycle.sql"), "utf8");
  const match = /service_interest\s+text\s+check \(service_interest in \(([^)]+)\)\)/.exec(sql);
  if (!match) return false;
  const listed = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
  return JSON.stringify(listed) === JSON.stringify([...serviceKeys].sort());
}
