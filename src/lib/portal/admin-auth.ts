import { createClient } from "@supabase/supabase-js";

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

  const exists = invited.error?.code === "email_exists" || /already|exists|registered/i.test(invited.error?.message ?? "");
  if (!exists) {
    throw new Error(`De uitnodiging kon niet worden aangemaakt: ${invited.error?.message ?? "onbekende fout"}`);
  }

  const existing = await admin.generateLink({ type: "magiclink", email });
  if (existing.error || !existing.data.user) {
    throw new Error(`Het bestaande account kon niet worden opgezocht: ${existing.error?.message ?? "onbekende fout"}`);
  }
  return { userId: existing.data.user.id, kind: "existing" };
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
 */
export async function recoveryTokenForEmail(email: string): Promise<string | null> {
  const { data, error } = await authAdmin().generateLink({ type: "recovery", email });
  if (error || !data.properties?.hashed_token) return null;
  return data.properties.hashed_token;
}
