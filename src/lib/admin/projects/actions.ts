"use server";

import { revalidatePath } from "next/cache";
import { referenceFailed, type ActionResult } from "@/lib/admin/action-result";
import { adminDb, orNull } from "@/lib/admin/db";
import { firstProjectError, validateProject } from "@/lib/admin/projects/validation";

export type ProjectInput = {
  customerId: string;
  name: string;
  status: string;
  startDate?: string;
  deadline?: string;
  notes: string;
};

/** Everything except the customer: a project stays with the customer it was made for. */
export type ProjectEditInput = Omit<ProjectInput, "customerId">;

const missingCustomer = "Deze klant bestaat niet meer.";

function toRow(input: ProjectEditInput) {
  return {
    name: input.name.trim(),
    status: input.status,
    start_date: orNull(input.startDate),
    deadline: orNull(input.deadline),
    notes: input.notes,
  };
}

function revalidateProject(id: string, customerId: string) {
  revalidatePath("/admin/projecten");
  revalidatePath(`/admin/projecten/${id}`);
  revalidatePath(`/admin/klanten/${customerId}`);
  revalidatePath("/admin");
}

export async function createProject(input: ProjectInput): Promise<ActionResult<string>> {
  const invalid = firstProjectError(validateProject(input, { requireCustomer: true }));
  if (invalid) return { ok: false, error: invalid };

  const db = await adminDb();
  const { data, error } = await db
    .from("projects")
    .insert({ ...toRow(input), customer_id: input.customerId })
    .select("id")
    .single();

  if (error || !data) return referenceFailed(error, missingCustomer, "Project aanmaken mislukt.");

  revalidateProject(data.id, input.customerId);
  return { ok: true, value: data.id };
}

/**
 * Updates a project. The customer is not among the fields: a project belongs
 * to the customer it was made for, and moving one would leave the quotes and
 * invoices that name it pointing at another customer's project -- which the
 * database refuses anyway.
 */
export async function updateProject(id: string, input: ProjectEditInput): Promise<ActionResult> {
  const invalid = firstProjectError(validateProject(input, { requireCustomer: false }));
  if (invalid) return { ok: false, error: invalid };

  const db = await adminDb();
  const { data, error } = await db.from("projects").update(toRow(input)).eq("id", id).select("customer_id").maybeSingle();

  if (error) return referenceFailed(error, missingCustomer, "Opslaan mislukt.");
  if (!data) return { ok: false, error: "Dit project bestaat niet (meer)." };

  revalidateProject(id, data.customer_id);
  return { ok: true };
}
