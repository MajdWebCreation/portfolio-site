import { clarityUrl } from "@/lib/admin/analytics/providers";
import type { ClarityBlock, ClarityProblemUrl, ClaritySignalKey, FactRecord } from "@/lib/admin/analytics/types";

/**
 * The Clarity block, from the latest snapshot the sync stored.
 *
 * Clarity's export covers a rolling 72 hours, not calendar days, so there is
 * nothing to add up or compare across the page's period: the block shows the
 * most recent snapshot and says when it was taken.
 *
 * Field names. Microsoft documents the fields of the Traffic metric only
 * (`totalSessionCount`, `totalBotSessionCount`); the sync stores whatever
 * numeric fields the other metrics carry, as `<metric>_<field>`. The
 * candidates below are the names those fields are expected to have; a
 * value the answer does not carry is shown as a dash, never as zero, and the
 * first real answer is the check (see the handoff document).
 */
const candidates: Record<"sessions" | "botSessions" | "scrollDepth" | "engagementActive" | "engagementTotal", string[]> = {
  sessions: ["traffic_total_session_count"],
  botSessions: ["traffic_total_bot_session_count"],
  scrollDepth: ["scroll_depth_average_scroll_depth", "scroll_depth_average_scroll_depth_percentage"],
  engagementActive: ["engagement_time_active_time"],
  engagementTotal: ["engagement_time_total_time"],
};

const signalPrefixes: Record<ClaritySignalKey, string> = {
  rageClicks: "rage_clicks",
  deadClicks: "dead_clicks",
  quickbacks: "quickbacks",
  excessiveScroll: "excessive_scroll",
  scriptErrors: "script_errors",
  errorClicks: "error_clicks",
};

/** A count field of a signal: its sub-total, or the number of sessions that had it. */
const countFields = ["sub_total", "sessions_count"];

function pick(metrics: Record<string, number>, names: string[]): number | null {
  for (const name of names) if (typeof metrics[name] === "number") return metrics[name];
  return null;
}

function signalCount(metrics: Record<string, number>, key: ClaritySignalKey): number | null {
  return pick(
    metrics,
    countFields.map((field) => `${signalPrefixes[key]}_${field}`),
  );
}

export const claritySignalKeys = Object.keys(signalPrefixes) as ClaritySignalKey[];

export function buildClarity(facts: FactRecord[], limit = 10): ClarityBlock {
  const snapshots = facts.filter((row) => row.report === "clarity.totals" || row.report === "clarity.live");
  const snapshotDate = snapshots.reduce<string | null>((latest, row) => (latest === null || row.date > latest ? row.date : latest), null);
  const totals = snapshots.find((row) => row.report === "clarity.totals" && row.date === snapshotDate)?.metrics ?? {};
  const live = snapshots.filter((row) => row.report === "clarity.live" && row.date === snapshotDate);

  const signals = Object.fromEntries(claritySignalKeys.map((key) => [key, signalCount(totals, key)])) as Record<ClaritySignalKey, number | null>;

  const problemUrls: ClarityProblemUrl[] = live
    .map((row) => {
      const found = claritySignalKeys
        .map((key) => ({ key, count: signalCount(row.metrics, key) ?? 0 }))
        .filter((signal) => signal.count > 0)
        .sort((a, b) => b.count - a.count);
      return { path: row.dims.url ?? "", signals: found, total: found.reduce((sum, signal) => sum + signal.count, 0) };
    })
    .filter((row) => row.path && row.total > 0)
    .sort((a, b) => b.total - a.total || a.path.localeCompare(b.path))
    .slice(0, limit);

  return {
    snapshotDate,
    sessions: pick(totals, candidates.sessions),
    botSessions: pick(totals, candidates.botSessions),
    scrollDepth: pick(totals, candidates.scrollDepth),
    engagementActive: pick(totals, candidates.engagementActive),
    engagementTotal: pick(totals, candidates.engagementTotal),
    signals,
    problemUrls,
    consoleUrl: clarityUrl,
  };
}
