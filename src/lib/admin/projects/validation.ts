import { isDateKey } from "@/lib/admin/format";
import { isProjectStatus } from "@/lib/admin/projects/types";

/**
 * The rules a project has to satisfy, in one place. The form uses them to
 * mark fields and the server actions use them to refuse, so a form is a
 * convenience and not the boundary -- the same arrangement as
 * `documents/validation.ts`.
 *
 * The date rule is stated here and again as a check constraint on the table;
 * the one in the database is the one that cannot be bypassed.
 */
export type ProjectErrors = Partial<Record<"customerId" | "name" | "status" | "startDate" | "deadline", string>>;

export type ProjectValidationInput = {
  /** Omitted when editing: a project never changes customer. */
  customerId?: string;
  name: string;
  status: string;
  startDate?: string;
  deadline?: string;
};

export function validateProject(input: ProjectValidationInput, options: { requireCustomer: boolean }): ProjectErrors {
  const errors: ProjectErrors = {};

  if (options.requireCustomer && !input.customerId?.trim()) errors.customerId = "Kies een klant.";
  if (!input.name.trim()) errors.name = "Vul een projectnaam in.";
  if (!isProjectStatus(input.status)) errors.status = "Kies een geldige status.";
  if (input.startDate && !isDateKey(input.startDate)) errors.startDate = "Dit is geen geldige datum.";
  if (input.deadline && !isDateKey(input.deadline)) errors.deadline = "Dit is geen geldige datum.";
  else if (input.deadline && input.startDate && isDateKey(input.startDate) && input.deadline < input.startDate) {
    errors.deadline = "De deadline ligt vóór de startdatum.";
  }

  return errors;
}

export function hasProjectErrors(errors: ProjectErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** The message a server action reports; ActionResult carries one, not a map. */
export function firstProjectError(errors: ProjectErrors): string | null {
  const [first] = Object.values(errors);
  return first ?? null;
}
