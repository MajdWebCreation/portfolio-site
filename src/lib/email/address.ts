/**
 * Whether a string is usable as an e-mail address: something, an @, a domain
 * with a dot. The same deliberately loose rule the customer form applies;
 * whether the mailbox exists is for the mail server to say.
 */
export function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
