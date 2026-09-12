/**
 * A project is the work YM does for one customer. It is not a document: it
 * carries no lines, no number and no money. What the work is worth is already
 * written in the quotes and invoices that hang off it, and none of that is
 * copied here.
 *
 * Documents point at the project, not the other way round: a project holds
 * any number of quotes and any number of invoices, and each of those may name
 * at most one project of the same customer. The database states that rule
 * with composite foreign keys (see migration
 * 20260912210000_project_document_links.sql), so it holds however a row
 * arrives.
 */
export type ProjectStatus = "planned" | "active" | "on_hold" | "completed" | "cancelled";

export type Project = {
  id: string;
  customerId: string;
  name: string;
  status: ProjectStatus;
  /** ISO date (YYYY-MM-DD). */
  startDate?: string;
  /** ISO date (YYYY-MM-DD). */
  deadline?: string;
  notes: string;
  /** ISO timestamp. */
  createdAt: string;
  /** ISO timestamp. */
  updatedAt: string;
};

export const projectStatusOrder: readonly ProjectStatus[] = [
  "planned",
  "active",
  "on_hold",
  "completed",
  "cancelled",
];

export const projectStatusLabels: Record<ProjectStatus, string> = {
  planned: "Gepland",
  active: "Lopend",
  on_hold: "On hold",
  completed: "Afgerond",
  cancelled: "Geannuleerd",
};

export const projectStatusTone: Record<ProjectStatus, "neutral" | "accent" | "success" | "danger"> = {
  planned: "accent",
  active: "accent",
  on_hold: "neutral",
  completed: "success",
  cancelled: "danger",
};

/**
 * Statuses that still represent work in hand. `completed` and `cancelled` are
 * the two end states: nothing is expected of them any more, which is also why
 * a deadline stops meaning anything once a project reaches one.
 */
export const openProjectStatuses: readonly ProjectStatus[] = ["planned", "active", "on_hold"];

export function isProjectStatus(value: string): value is ProjectStatus {
  return (projectStatusOrder as readonly string[]).includes(value);
}

export function isOpenProject(project: Pick<Project, "status">): boolean {
  return (openProjectStatuses as readonly string[]).includes(project.status);
}

export type DeadlineState = "overdue" | "today" | "planned" | "none";

/**
 * How a project's deadline relates to a calendar day (YYYY-MM-DD), the way
 * `getFollowUpState` does it for leads.
 *
 * A finished or cancelled project has nothing left to be late for, so it
 * reports "none" even with a date in the past. Without that, every delivered
 * project would pile up in the dashboard's overdue count forever.
 */
export function getDeadlineState(project: Pick<Project, "status" | "deadline">, todayKey: string): DeadlineState {
  if (!project.deadline || !isOpenProject(project)) return "none";
  if (project.deadline < todayKey) return "overdue";
  if (project.deadline === todayKey) return "today";
  return "planned";
}
