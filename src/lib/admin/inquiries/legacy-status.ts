import type { InquiryStatus } from "@/lib/admin/inquiries/types";

/**
 * The contract of the legacy step in 20260930193617_inquiry_lifecycle.sql,
 * stated once in TypeScript so a test can pin it down without a database.
 *
 * Before the lifecycle, an inquiry's status was a handling state. Two of
 * them have one obvious stage; the others do not, and the migration refuses
 * to guess: it aborts with a count per ambiguous status so a person decides
 * won, or lost with a reason, for each row. The SQL guard mirrors this
 * function; keep the two in step.
 */
export const legacyStatusMapping: Readonly<Record<string, InquiryStatus>> = {
  new: "new",
  viewed: "new",
  follow_up: "contacted",
  qualified: "qualified",
};

export type LegacyStatusCounts = Readonly<Record<string, number>>;

/**
 * The counts per legacy status as `select status, count(*) ... group by`
 * would report them. Returns the mapping to apply, or throws with the same
 * report the SQL guard raises when any row cannot be mapped.
 */
export function planLegacyStatusMigration(counts: LegacyStatusCounts): { from: string; to: InquiryStatus; rows: number }[] {
  const ambiguous = Object.entries(counts).filter(([status, rows]) => rows > 0 && !(status in legacyStatusMapping));
  if (ambiguous.length > 0) {
    const total = ambiguous.reduce((sum, [, rows]) => sum + rows, 0);
    const detail = ambiguous.map(([status, rows]) => `${status}: ${rows}`).join(", ");
    throw new Error(
      `inquiry_lifecycle: ${total} inquiries carry a status with no unambiguous lifecycle stage (${detail}). Set each to won, or lost with a reason, by hand; then apply again.`,
    );
  }
  return Object.entries(counts)
    .filter(([status, rows]) => rows > 0 && legacyStatusMapping[status] !== status)
    .map(([status, rows]) => ({ from: status, to: legacyStatusMapping[status], rows }));
}
