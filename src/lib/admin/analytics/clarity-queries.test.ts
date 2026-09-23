import { describe, expect, it } from "vitest";
import { buildClarity } from "@/lib/admin/analytics/clarity-queries";
import type { FactRecord } from "@/lib/admin/analytics/types";

const f = (report: string, date: string, dims: Record<string, string>, metrics: Record<string, number>): FactRecord => ({ report, date, dims, metrics });

describe("the Clarity block", () => {
  it("uses the latest snapshot only, and shows a missing field as null, not zero", () => {
    const block = buildClarity([
      f("clarity.totals", "2026-09-22", {}, { traffic_total_session_count: 999, rage_clicks_sub_total: 99 }),
      f("clarity.totals", "2026-09-23", {}, { traffic_total_session_count: 52, traffic_total_bot_session_count: 3, rage_clicks_sub_total: 9, dead_clicks_sessions_count: 4 }),
      f("clarity.live", "2026-09-23", { url: "/nl/tarieven" }, { rage_clicks_sub_total: 7, dead_clicks_sub_total: 1 }),
      f("clarity.live", "2026-09-23", { url: "/nl/contact" }, { quickbacks_sub_total: 3 }),
      f("clarity.live", "2026-09-23", { url: "/nl" }, { traffic_total_session_count: 20 }),
      f("clarity.live", "2026-09-22", { url: "/nl/oud" }, { rage_clicks_sub_total: 50 }),
    ]);
    expect(block.snapshotDate).toBe("2026-09-23");
    expect(block.sessions).toBe(52);
    expect(block.botSessions).toBe(3);
    expect(block.scrollDepth).toBeNull();
    expect(block.signals).toEqual({ rageClicks: 9, deadClicks: 4, quickbacks: null, excessiveScroll: null, scriptErrors: null, errorClicks: null });
    expect(block.problemUrls).toEqual([
      {
        path: "/nl/tarieven",
        signals: [
          { key: "rageClicks", count: 7 },
          { key: "deadClicks", count: 1 },
        ],
        total: 8,
      },
      { path: "/nl/contact", signals: [{ key: "quickbacks", count: 3 }], total: 3 },
    ]);
    expect(block.consoleUrl).toBe("https://clarity.microsoft.com/");
  });

  it("is empty without a snapshot", () => {
    expect(buildClarity([])).toMatchObject({ snapshotDate: null, sessions: null, problemUrls: [] });
  });
});
