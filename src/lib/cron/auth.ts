import { timingSafeEqual } from "node:crypto";

/**
 * Who may run a scheduled job.
 *
 * Vercel Cron calls with `Authorization: Bearer $CRON_SECRET`, the secret
 * being an environment variable this deployment and Vercel share. Nothing
 * else gets in: without a configured secret every route that uses this
 * refuses outright rather than running open, so a missing variable cannot
 * turn a job that mails customers into a public button.
 *
 * The secret is read here and in no other module, so there is one place where
 * a scheduled route can be made reachable -- and one place to look when
 * asking who can reach one.
 */
export function isAuthorisedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const given = Buffer.from(header);
  const wanted = Buffer.from(expected);
  // Same length check first: timingSafeEqual throws on a mismatch.
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
