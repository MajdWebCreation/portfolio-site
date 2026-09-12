/**
 * A small fixed-window limiter for the two routes a stranger can reach.
 *
 * In-process and therefore per instance: on a platform that runs several, the
 * effective limit is the one below times the number of instances. That is
 * enough for what this defends against -- someone hammering an activation
 * link or replaying a webhook thousands of times -- and it buys that without a
 * dependency or a second datastore. It is not a billing control, and the real
 * guarantees against duplicate work are the unique indexes, not this.
 */
type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/** Keeps the map from growing without bound on a long-lived instance. */
function sweep(now: number) {
  if (windows.size < 5000) return;
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export function rateLimit(key: string, limit: number, windowSeconds: number, now = Date.now()): RateLimitResult {
  sweep(now);
  const current = windows.get(key);

  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  current.count += 1;
  if (current.count > limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/** Best-effort caller identity from the proxy headers Vercel sets. */
export function requestKey(request: Request, prefix: string): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return `${prefix}:${ip}`;
}

/** Test seam; resets the process-wide state between cases. */
export function resetRateLimits(): void {
  windows.clear();
}
