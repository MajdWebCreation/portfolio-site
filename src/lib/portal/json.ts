import type { Json } from "@/lib/supabase/database.types";

/**
 * Reading the jsonb the portal functions return.
 *
 * The keys are named in the SQL; this checks them on the way in rather
 * than casting, so a function that starts returning something else fails
 * loudly instead of showing a customer a half-filled document.
 */
export type JsonRecord = Record<string, Json | undefined>;

export function records(value: Json, what: string): JsonRecord[] {
  if (!Array.isArray(value)) throw new Error(`${what}: geen lijst`);
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`${what}: geen object`);
    return item as JsonRecord;
  });
}

export function record(value: Json, what: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${what}: geen object`);
  return value as JsonRecord;
}

export function text(item: JsonRecord, key: string): string {
  const value = item[key];
  if (typeof value !== "string") throw new Error(`veld ${key}: geen tekst`);
  return value;
}

export function textOrNull(item: JsonRecord, key: string): string | null {
  const value = item[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`veld ${key}: geen tekst`);
  return value;
}

export function integer(item: JsonRecord, key: string): number {
  const value = item[key];
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`veld ${key}: geen geheel getal`);
  return value;
}

export function integerOrNull(item: JsonRecord, key: string): number | null {
  const value = item[key];
  if (value === null || value === undefined) return null;
  return integer(item, key);
}

export function flag(item: JsonRecord, key: string): boolean {
  const value = item[key];
  if (typeof value !== "boolean") throw new Error(`veld ${key}: geen ja/nee`);
  return value;
}
