import { describe, expect, it } from "vitest";
import {
  getDeadlineState,
  isOpenProject,
  isProjectStatus,
  openProjectStatuses,
  projectStatusLabels,
  projectStatusOrder,
} from "@/lib/admin/projects/types";

/**
 * The statuses listed here are the same strings as the check constraint on
 * public.projects. If this drifts, the admin offers a status the database
 * refuses.
 */
describe("project statuses", () => {
  it("knows exactly the five statuses the table allows", () => {
    expect([...projectStatusOrder]).toEqual(["planned", "active", "on_hold", "completed", "cancelled"]);
  });

  it("labels every status", () => {
    for (const status of projectStatusOrder) {
      expect(projectStatusLabels[status]).toBeTruthy();
    }
  });

  it("recognises its own statuses and nothing else", () => {
    expect(isProjectStatus("active")).toBe(true);
    expect(isProjectStatus("cancelled")).toBe(true);
    expect(isProjectStatus("archived")).toBe(false);
    expect(isProjectStatus("")).toBe(false);
  });

  it("counts planned, active and on hold as work in hand, and the two end states as done", () => {
    expect([...openProjectStatuses]).toEqual(["planned", "active", "on_hold"]);
    expect(isOpenProject({ status: "planned" })).toBe(true);
    expect(isOpenProject({ status: "active" })).toBe(true);
    expect(isOpenProject({ status: "on_hold" })).toBe(true);
    expect(isOpenProject({ status: "completed" })).toBe(false);
    expect(isOpenProject({ status: "cancelled" })).toBe(false);
  });
});

describe("project deadline state", () => {
  const today = "2026-09-12";

  it("has nothing to say without a deadline", () => {
    expect(getDeadlineState({ status: "active" }, today)).toBe("none");
  });

  it("calls a past deadline overdue and today's deadline today", () => {
    expect(getDeadlineState({ status: "active", deadline: "2026-09-11" }, today)).toBe("overdue");
    expect(getDeadlineState({ status: "active", deadline: today }, today)).toBe("today");
    expect(getDeadlineState({ status: "active", deadline: "2026-09-13" }, today)).toBe("planned");
  });

  it("treats every open status the same way", () => {
    for (const status of openProjectStatuses) {
      expect(getDeadlineState({ status, deadline: "2026-01-01" }, today)).toBe("overdue");
    }
  });

  /*
    The rule that keeps the dashboard honest: a delivered or cancelled project
    is not late, however long ago its deadline was. Without this, every
    finished project would sit in the overdue count forever.
  */
  it("stops calling a finished or cancelled project late", () => {
    expect(getDeadlineState({ status: "completed", deadline: "2020-01-01" }, today)).toBe("none");
    expect(getDeadlineState({ status: "cancelled", deadline: "2020-01-01" }, today)).toBe("none");
  });
});
