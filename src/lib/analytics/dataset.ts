/**
 * Reads the tracking attributes off an element's dataset.
 *
 * Server components mark a link with `data-track-event="cta_click"` and one
 * `data-track-<param>` per parameter, for example `data-track-cta-id`. The
 * DOM exposes those as `dataset.trackEvent` and `dataset.trackCtaId`; this
 * turns them back into `{ cta_id: ... }`. Only keys with the `track` prefix
 * are read, and `data-track-link-context` is left to the outbound handler,
 * which owns it.
 *
 * The result is untrusted input for the guard, not a finished event: the
 * guard drops keys the event does not list and refuses values that do not
 * fit.
 */
const PREFIX = "track";

export type TrackedElement = { name: string; params: Record<string, string> };

function toSnakeCase(camel: string): string {
  return camel.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).replace(/^_/, "");
}

export function trackedElementFromDataset(dataset: Record<string, string | undefined>): TrackedElement | null {
  const name = dataset.trackEvent;
  if (!name) return null;

  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(dataset)) {
    if (!key.startsWith(PREFIX) || key === "trackEvent" || key === "trackLinkContext") continue;
    if (value === undefined) continue;
    params[toSnakeCase(key.slice(PREFIX.length))] = value;
  }

  return { name, params };
}
