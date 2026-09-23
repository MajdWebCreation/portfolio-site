/**
 * What must not survive into the communication log.
 *
 * The log keeps a copy of every customer mail as it was sent. An activation
 * mail carries the one value the database deliberately stores only as a hash:
 * the raw token in its link (see lib/payments/tokens.ts). Kept verbatim, the
 * log would undo that decision for as long as the row lives, which is far
 * longer than the seventy-two hours the link itself is valid.
 *
 * So the token is cut out of the copy before it is written, and only there:
 * the mail the customer receives is untouched. The pattern is the link shape
 * the site produces -- /<locale>/incasso/<token> -- and the token shape is the
 * one `isActivationTokenShape` accepts, so anything that would work as a link
 * is caught and nothing else in the body is changed. Applied to text and HTML
 * alike; the HTML href holds the same characters.
 *
 * The one-off migration that cleaned rows written before this existed uses
 * the same expression: supabase/migrations/*_redact_activation_tokens.sql.
 */
export const redactedTokenMarker = "[token-verwijderd]";

const activationLink = /(\/(?:nl|en)\/incasso\/)[A-Za-z0-9_-]{20,200}(?![A-Za-z0-9_-])/g;

export function redactSecrets(text: string): string {
  return text.replace(activationLink, `$1${redactedTokenMarker}`);
}

/** True when a body still carries something `redactSecrets` would remove. */
export function containsSecret(text: string): boolean {
  activationLink.lastIndex = 0;
  return activationLink.test(text);
}
