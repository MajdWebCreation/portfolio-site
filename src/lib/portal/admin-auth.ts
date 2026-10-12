import { createClient } from "@supabase/supabase-js";
import type { PortalWelcomeState } from "@/lib/portal/welcome";

/**
 * The one module that speaks to Supabase Auth as an administrator.
 *
 * Inviting a customer means creating an auth user and minting the link they
 * set their password with; a password reset means minting such a link for an
 * existing user. Both are admin operations of the Auth server, so both need
 * the secret key. It is read here and in lib/payments/admin-client.ts, and
 * nowhere else; the boundary test names both files.
 *
 * Deliberately narrow: no database access goes through this client, only
 * `auth.admin`. Memberships are written by the admin's own session under row
 * level security, so the elevated key never touches a business table. The
 * client reads no cookies, keeps no session and is built per call.
 *
 * Nothing here sends mail. A link is handed back as the hashed token the
 * Auth server will accept, and the caller puts it in a mail of its own on a
 * route of its own -- never the Auth server's redirect, so there is no
 * redirect parameter to get wrong.
 */
export class PortalAuthNotConfigured extends Error {
  constructor() {
    super("Portaaluitnodigingen zijn niet geconfigureerd. Zet SUPABASE_SECRET_KEY, zie .env.example.");
    this.name = "PortalAuthNotConfigured";
  }
}

function authAdmin() {
  if (typeof window !== "undefined") {
    throw new Error("The portal auth admin client was constructed in the browser. It is server-only.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) throw new PortalAuthNotConfigured();

  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).auth.admin;
}

export type EnsuredAuthUser =
  /** A new auth user: the hashed token of an invite link they set their password with. */
  | { userId: string; kind: "new"; tokenHash: string }
  /** An existing auth user: they sign in with the password they have. */
  | { userId: string; kind: "existing" };

/**
 * The auth user for an address, made if it does not exist.
 *
 * `generateLink({ type: "invite" })` creates the user and returns the token;
 * for an address that already has a user the Auth server answers
 * `email_exists`, and a magic-link generation -- whose token is thrown away --
 * is the way to learn that user's id without listing every user. The Auth
 * server holds one user per address, so running this twice for the same
 * address yields the same user and never a second one.
 */
export async function ensureAuthUserForEmail(email: string): Promise<EnsuredAuthUser> {
  const admin = authAdmin();

  const invited = await admin.generateLink({ type: "invite", email });
  if (!invited.error && invited.data.user && invited.data.properties?.hashed_token) {
    return { userId: invited.data.user.id, kind: "new", tokenHash: invited.data.properties.hashed_token };
  }

  /*
    The invite was refused. Usually because the address has a user already
    (`email_exists`); under two invitations at the same instant the Auth
    server may answer less tidily for the one that lost the race. Either way
    the question is the same -- is there a user for this address? -- and the
    magic-link lookup answers it. Only when that also fails is the original
    refusal the admin's problem.
  */
  const existing = await admin.generateLink({ type: "magiclink", email });
  if (!existing.error && existing.data.user) {
    return { userId: existing.data.user.id, kind: "existing" };
  }

  const exists = invited.error?.code === "email_exists" || /already|exists|registered/i.test(invited.error?.message ?? "");
  throw new Error(
    exists
      ? `Het bestaande account kon niet worden opgezocht: ${existing.error?.message ?? "onbekende fout"}`
      : `De uitnodiging kon niet worden aangemaakt: ${invited.error?.message ?? "onbekende fout"}`,
  );
}

/**
 * A fresh invite token for a user that exists but never set a password:
 * the renewal of an invitation.
 */
export async function renewInviteToken(email: string): Promise<string | null> {
  const { data, error } = await authAdmin().generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) return null;
  return data.properties.hashed_token;
}

/**
 * A password-recovery token for an address, or null when no user has it.
 * The caller answers the same whether or not a user exists.
 *
 * Measured against GoTrue: a recovery link is issued for a user who never
 * confirmed (an invitation that was never used), so "wachtwoord vergeten" is
 * also the way back in for someone whose invitation expired. Should the Auth
 * server ever refuse that, a magic link does the same job and is tried next.
 */
export async function recoveryTokenForEmail(email: string): Promise<{ tokenHash: string; type: "recovery" | "magiclink" } | null> {
  const admin = authAdmin();
  const recovery = await admin.generateLink({ type: "recovery", email });
  if (!recovery.error && recovery.data.properties?.hashed_token) {
    return { tokenHash: recovery.data.properties.hashed_token, type: "recovery" };
  }
  if (recovery.error?.code === "user_not_found" || /not found/i.test(recovery.error?.message ?? "")) return null;

  const magic = await admin.generateLink({ type: "magiclink", email });
  if (magic.error || !magic.data.properties?.hashed_token) return null;
  return { tokenHash: magic.data.properties.hashed_token, type: "magiclink" };
}

/**
 * Whether the portal's welcome mail is due or was sent, kept on the auth
 * user's `app_metadata`: per person, written only with the secret key (a
 * signed-in user cannot change app_metadata), and gone with the account.
 * No table of its own for two timestamps.
 */

function welcomeFrom(metadata: Record<string, unknown> | undefined): PortalWelcomeState {
  const raw = metadata?.portal_welcome;
  if (!raw || typeof raw !== "object") return {};
  const { dueAt, sentAt } = raw as Record<string, unknown>;
  return { ...(typeof dueAt === "string" ? { dueAt } : {}), ...(typeof sentAt === "string" ? { sentAt } : {}) };
}

/** The welcome state as a session already reports it, without asking the Auth server. */
export function portalWelcomeFromUser(user: { app_metadata?: Record<string, unknown> }): PortalWelcomeState {
  return welcomeFrom(user.app_metadata);
}

/** The welcome state as the Auth server holds it now. */
export async function readPortalWelcome(userId: string): Promise<PortalWelcomeState> {
  const { data, error } = await authAdmin().getUserById(userId);
  if (error || !data.user) throw new Error(`Account laden: ${error?.message ?? "niet gevonden"}`);
  return welcomeFrom(data.user.app_metadata);
}

export async function writePortalWelcome(userId: string, state: PortalWelcomeState): Promise<void> {
  const admin = authAdmin();
  const { data, error } = await admin.getUserById(userId);
  if (error || !data.user) throw new Error(`Account laden: ${error?.message ?? "niet gevonden"}`);
  const updated = await admin.updateUserById(userId, { app_metadata: { ...data.user.app_metadata, portal_welcome: state } });
  if (updated.error) throw new Error(`Welkomststatus vastleggen: ${updated.error.message}`);
}
