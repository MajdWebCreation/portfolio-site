import { ProviderError } from "@/lib/analytics-admin/types";

/**
 * `items.map(task)` with at most `limit` tasks running at once, results in
 * the order of `items` whatever order they finish in.
 *
 * Small on purpose: the sync needs a bounded fan-out over a few dozen
 * requests, not a scheduler, and a dependency for this would be more code
 * to trust than the dozen lines below. The tasks are expected to settle
 * rather than throw (the runner catches per report); if one does throw,
 * the returned promise rejects after the tasks already started have
 * finished, and no new task is started.
 */
export async function mapWithLimit<T, R>(items: readonly T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("mapWithLimit needs a positive integer limit");
  const results = new Array<R>(items.length);
  let next = 0;
  let failure: { error: unknown } | null = null;

  async function worker() {
    while (failure === null && next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = await task(items[index], index);
      } catch (error) {
        failure ??= { error };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure) throw (failure as { error: unknown }).error;
  return results;
}

/**
 * A gate every request of one provider passes through: at most
 * `concurrency` requests in flight at once, however many reports or days
 * ask for them, and none started once `pastDeadline()` says the run has no
 * time left for it. A request refused for the deadline fails as
 * `ProviderError("deadline")`, like any other failure of its report.
 *
 * The gate wraps single requests only and never waits on itself, so it
 * cannot deadlock however the callers nest.
 */
export type RequestGate = <T>(request: () => Promise<T>) => Promise<T>;

export const openGate: RequestGate = (request) => request();

export function createRequestGate(options: { concurrency: number; pastDeadline?: () => boolean }): RequestGate {
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) throw new Error("createRequestGate needs a positive integer concurrency");
  let active = 0;
  const waiting: Array<() => void> = [];

  /* A freed slot goes straight to the next waiter, so no newcomer can slip in between. */
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  };

  return async (request) => {
    if (active < options.concurrency) active += 1;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      if (options.pastDeadline?.()) throw new ProviderError("deadline");
      return await request();
    } finally {
      release();
    }
  };
}
