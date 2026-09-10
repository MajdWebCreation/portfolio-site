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
