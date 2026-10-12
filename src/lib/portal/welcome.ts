/**
 * The welcome mail after a customer's first password: the one mail they keep
 * that says where the portal is (portal/mail.ts, welcomeMail).
 *
 * Exactly when, and how often:
 *
 *   due       the first time a password is set through a mailed link and
 *             that made a membership accepted for the first time -- the
 *             account's setup. Not a sign-in, not a password reset of an
 *             account already in use, not a password change: none of those
 *             accepts a membership for the first time through a link.
 *   sent      once. The state lives on the auth user (admin-auth.ts):
 *             "due" is written before the mail goes out, "sent" after.
 *   retried   a mail that failed stays due, and the next sign-in tries it
 *             again. The same Resend idempotency key per user keeps two
 *             attempts within a day -- a double submit, two instances -- to
 *             one mail.
 *
 * Nothing here may stand in the way of the account: the caller runs it after
 * the response and swallows whatever it throws.
 */
/** Whether the welcome mail is due or was sent; kept on the auth user (admin-auth.ts). */
export type PortalWelcomeState = { dueAt?: string; sentAt?: string };

export type WelcomeStore = {
  read: (userId: string) => Promise<PortalWelcomeState>;
  write: (userId: string, state: PortalWelcomeState) => Promise<void>;
  send: (to: string, idempotencyKey: string) => Promise<{ sent: boolean; reason?: string }>;
};

export type WelcomeOutcome = "sent" | "already_sent" | "not_due" | "failed";

export function welcomeIdempotencyKey(userId: string): string {
  return `portal-welcome/${userId}`;
}

/** Whether a sign-in or a password setup has anything to do about the welcome at all, from what the session already says. */
export function welcomeWorthChecking(state: PortalWelcomeState, firstSetup: boolean): boolean {
  if (state.sentAt) return false;
  return firstSetup || Boolean(state.dueAt);
}

export async function settlePortalWelcome(
  store: WelcomeStore,
  user: { id: string; email?: string | null },
  firstSetup: boolean,
  now: Date = new Date(),
): Promise<WelcomeOutcome> {
  let state = await store.read(user.id);
  if (state.sentAt) return "already_sent";
  if (!state.dueAt) {
    if (!firstSetup) return "not_due";
    state = { dueAt: now.toISOString() };
    await store.write(user.id, state);
  }
  if (!user.email) return "failed";

  const delivery = await store.send(user.email, welcomeIdempotencyKey(user.id));
  if (!delivery.sent) return "failed";

  await store.write(user.id, { ...state, sentAt: now.toISOString() });
  return "sent";
}
