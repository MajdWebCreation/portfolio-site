/**
 * What every admin server action returns. Errors come back as a value so the
 * form can show them, instead of a thrown exception the client cannot read.
 */
export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { value?: undefined } : { value: T }))
  | { ok: false; error: string };

export function actionFailed(error: { message: string } | null, fallback: string): { ok: false; error: string } {
  return { ok: false, error: error?.message ?? fallback };
}

/**
 * Postgres refuses a reference with 23503 when the row pointed at is gone or
 * does not match a composite key. The forms only offer rows they just read,
 * so this is what a stale page or a second tab produces, and it deserves a
 * sentence the admin can act on instead of a constraint name. Every module
 * passes its own `reference` message; the rest is shared.
 */
export function referenceFailed(
  error: { code?: string; message: string } | null,
  reference: string,
  fallback: string,
): { ok: false; error: string } {
  if (error?.code === "23503") return { ok: false, error: reference };
  return actionFailed(error, fallback);
}
