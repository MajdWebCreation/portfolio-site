/**
 * Seeing what tracking does, without sending it.
 *
 * Dry run: `next dev`, or any build with `NEXT_PUBLIC_TRACKING_DRY_RUN=1`.
 * Every command still goes into `window.dataLayer` exactly as it would in
 * production -- consent defaults and updates, `config`, events, conversions
 * -- but gtag.js and the Meta Pixel library are never loaded, so nothing
 * reaches Google or Meta and production reports stay clean. Inspect
 * `window.dataLayer` in the console, or read the `[tracking]` lines.
 *
 * Logging on a live site: `localStorage.setItem("ym:tracking-debug", "1")`
 * prints the same `[tracking]` lines for this browser only, while sending as
 * normal. IDs and labels are public values; nothing a visitor typed and no
 * secret is ever logged.
 */
export function trackingDryRun(): boolean {
  return process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_TRACKING_DRY_RUN === "1";
}

function debugFlag(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem("ym:tracking-debug") === "1";
  } catch {
    return false;
  }
}

export function trackingDebugLog(message: string, detail?: unknown): void {
  if (!trackingDryRun() && !debugFlag()) return;
  if (detail === undefined) console.info(`[tracking] ${message}`);
  else console.info(`[tracking] ${message}`, detail);
}
