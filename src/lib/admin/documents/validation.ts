import type { DocumentLine } from "@/lib/admin/documents/types";
import { isDateKey } from "@/lib/admin/format";
import { isValidVatRate } from "@/lib/money";

export type LineErrors = Partial<Record<"description" | "quantity" | "unitPrice" | "vatRate", string>>;

export function validateLine(line: DocumentLine): LineErrors {
  const errors: LineErrors = {};
  if (!line.description.trim()) errors.description = "Vul een omschrijving in.";
  if (!Number.isSafeInteger(line.quantityHundredths) || line.quantityHundredths <= 0) errors.quantity = "Hoeveelheid moet groter zijn dan 0.";
  if (!Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents < 0) errors.unitPrice = "Prijs moet 0 of hoger zijn.";
  if (!isValidVatRate(line.vatRate)) errors.vatRate = "Kies een geldig btw-percentage.";
  return errors;
}

export function hasLineErrors(errors: LineErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Shared checks for the document header: dates present, valid and in order. */
export function validateDates(issueDate: string, laterDate: string, laterLabel: string): Partial<Record<"issueDate" | "laterDate", string>> {
  const errors: Partial<Record<"issueDate" | "laterDate", string>> = {};
  if (!isDateKey(issueDate)) errors.issueDate = "Dit is geen geldige datum.";
  if (!isDateKey(laterDate)) errors.laterDate = "Dit is geen geldige datum.";
  else if (isDateKey(issueDate) && laterDate < issueDate) errors.laterDate = `${laterLabel} ligt vóór de documentdatum.`;
  return errors;
}

/** YYYY-MM-DD plus a number of days, in UTC so DST never shifts the day. */
export function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Whole calendar days from one day to another; negative when `to` is earlier.
 *
 * Both are read at midday UTC, the same way `addDays` writes them, so a day
 * that starts or ends on a clock change still counts as one day. The calendar
 * itself is Amsterdam's: these keys come from `toDateKey`, which is the one
 * place this system decides what "today" means.
 */
export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T12:00:00Z`);
  const end = Date.parse(`${to}T12:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}
