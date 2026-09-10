const dateTime = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Amsterdam",
});

const date = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Amsterdam",
});

const dateShort = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Amsterdam",
});

function safe(formatter: Intl.DateTimeFormat, iso: string) {
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? "—" : formatter.format(value);
}

/** "10 sep 2026, 09:41" */
export function formatDateTime(iso: string) {
  return safe(dateTime, iso);
}

/** "10 sep 2026" */
export function formatDate(iso: string) {
  return safe(date, iso);
}

/** "10 sep" */
export function formatDateShort(iso: string) {
  return safe(dateShort, iso);
}

/** A calendar date as the date inputs produce it: YYYY-MM-DD within a sane range. */
export function isDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value) && value >= "2000-01-01" && value <= "2100-12-31";
}

/** Calendar date (YYYY-MM-DD) in Amsterdam time, for "today" comparisons. */
export function toDateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(value);
}
