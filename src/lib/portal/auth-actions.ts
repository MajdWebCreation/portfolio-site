"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isEmailAddress } from "@/lib/email/address";
import { rateLimit } from "@/lib/payments/rate-limit";
import { recoveryTokenForEmail } from "@/lib/portal/admin-auth";
import { getPortalAccess, portalCustomerCookie, readPortalMemberships } from "@/lib/portal/auth";
import { passwordResetMail, sendPortalMail, type PortalTokenType } from "@/lib/portal/mail";
import { passwordProblem } from "@/lib/portal/password";
import { portalLoginPath, portalNoAccessPath, portalRoot } from "@/lib/portal/paths";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The portal's account flows. Every one of them is a server action: the
 * session cookies are written by the server, the browser never talks to the
 * Auth server itself, and nothing here is reachable as an endpoint.
 *
 * There is no sign-up anywhere in this file or this application. An account
 * exists because an admin invited it.
 */
export type FormState = { error: string | null; done?: boolean };

/** One message for every sign-in failure, so the form cannot be used to find out which addresses exist. */
const signInFailed = "Onbekende combinatie van e-mailadres en wachtwoord.";

/**
 * Who is asking, as far as the proxy headers say. Every Auth call leaves
 * from the same egress addresses, so the Auth server's own per-address limit
 * cannot tell one visitor from another; these keys can.
 */
async function callerKey(prefix: string): Promise<string> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown";
  return `${prefix}:${ip}`;
}

/** Sign-in attempts, per address and per caller. Over the limit reads like a wrong password. */
async function signInAllowed(email: string): Promise<boolean> {
  const perEmail = rateLimit(`portal-signin:${email.toLowerCase()}`, 8, 15 * 60);
  const perCaller = rateLimit(await callerKey("portal-signin"), 30, 15 * 60);
  return perEmail.allowed && perCaller.allowed;
}

const tokenTypes: readonly PortalTokenType[] = ["invite", "magiclink", "recovery"];

function isTokenType(value: string): value is PortalTokenType {
  return (tokenTypes as readonly string[]).includes(value);
}

/**
 * Signing in. A password that checks out is not yet access: without an
 * active membership the visitor lands on the page that says so. They keep
 * their session -- it is theirs -- but nothing in the portal opens for it.
 */
export async function portalSignInAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Vul uw e-mailadres en wachtwoord in." };
  if (!(await signInAllowed(email))) return { error: signInFailed };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: signInFailed };

  const memberships = await readPortalMemberships(supabase);
  if (!memberships || memberships.length === 0) redirect(portalNoAccessPath);

  await supabase.rpc("portal_mark_membership_accepted");
  redirect(portalRoot);
}

/** Ends the session server-side and clears its cookies. */
export async function portalSignOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete({ name: portalCustomerCookie, path: portalRoot });
  redirect(portalLoginPath);
}

/**
 * "Wachtwoord vergeten". The answer is the same whether or not the address
 * has an account, and the mail only goes where an account is. Rate-limited
 * per address so the Auth server is not asked to mint tokens in a loop.
 */
export async function requestPasswordResetAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!isEmailAddress(email)) return { error: "Vul een geldig e-mailadres in." };

  /* Per address and per caller: a reset should not be a way to flood a mailbox or to keep invalidating someone's link. */
  const perEmail = rateLimit(`portal-reset:${email}`, 3, 15 * 60);
  const perCaller = rateLimit(await callerKey("portal-reset"), 10, 15 * 60);
  if (!perEmail.allowed || !perCaller.allowed) return { error: null, done: true };

  const tokenHash = await recoveryTokenForEmail(email).catch((error: unknown) => {
    console.error("Portal password reset: token could not be made", { error });
    return null;
  });
  if (tokenHash) {
    const delivery = await sendPortalMail(email, passwordResetMail({ tokenHash }));
    if (!delivery.sent) console.error("Portal password reset mail failed", { reason: delivery.reason });
  }

  return { error: null, done: true };
}

/**
 * The page a mailed link lands on: an invitation, a renewed invitation or a
 * password reset. The token is verified and the password set in one action,
 * so a visitor who only opened the link holds no session; one who sets a
 * password does. A membership used for the first time is stamped accepted.
 */
export async function setPasswordWithTokenAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const tokenHash = String(formData.get("token_hash") ?? "").trim();
  const type = String(formData.get("type") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (!tokenHash || !isTokenType(type)) return { error: "Deze link is niet geldig. Vraag een nieuwe aan." };
  const problem = passwordProblem(password, confirmation);
  if (problem) return { error: problem };

  const supabase = await createSupabaseServerClient();
  const verified = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (verified.error || !verified.data.user) {
    return { error: "Deze link is niet meer geldig. Vraag een nieuwe aan via 'Wachtwoord vergeten' of bij YM Creations." };
  }

  const updated = await supabase.auth.updateUser({ password });
  if (updated.error) {
    await supabase.auth.signOut();
    return { error: updated.error.code === "weak_password" ? "Dit wachtwoord is te zwak. Kies een langer of minder voorspelbaar wachtwoord." : "Het wachtwoord kon niet worden ingesteld. Probeer het opnieuw." };
  }

  const memberships = await readPortalMemberships(supabase);
  if (!memberships || memberships.length === 0) redirect(portalNoAccessPath);

  await supabase.rpc("portal_mark_membership_accepted");
  redirect(portalRoot);
}

/**
 * A signed-in member changing their password. The current password is asked
 * again and checked first: a session left open on a shared screen should not
 * be enough to lock the owner out.
 */
export async function changePasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const access = await getPortalAccess();
  if (access.state !== "member") redirect(portalLoginPath);

  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (!current) return { error: "Vul uw huidige wachtwoord in." };
  const problem = passwordProblem(password, confirmation);
  if (problem) return { error: problem };
  if (!access.member.email) return { error: "Dit account heeft geen e-mailadres; neem contact op met YM Creations." };

  const supabase = await createSupabaseServerClient();
  const check = await supabase.auth.signInWithPassword({ email: access.member.email, password: current });
  if (check.error) return { error: "Het huidige wachtwoord klopt niet." };

  const updated = await supabase.auth.updateUser({ password });
  if (updated.error) {
    return { error: updated.error.code === "same_password" ? "Kies een ander wachtwoord dan het huidige." : updated.error.code === "weak_password" ? "Dit wachtwoord is te zwak. Kies een langer of minder voorspelbaar wachtwoord." : "Het wachtwoord kon niet worden gewijzigd. Probeer het opnieuw." };
  }

  await supabase.rpc("portal_log_event", { p_action: "password_changed", p_customer_id: access.member.current.customerId });
  return { error: null, done: true };
}

/**
 * A user with several customers picking the one to work for. The choice is
 * remembered in a cookie as a preference; authorization never reads the
 * cookie without checking it against the memberships the database returns,
 * and a customer that is not theirs is simply not remembered.
 */
export async function selectCustomerAction(formData: FormData): Promise<void> {
  const access = await getPortalAccess();
  if (access.state !== "member") redirect(portalLoginPath);

  const customerId = String(formData.get("customerId") ?? "");
  const chosen = access.member.memberships.find((membership) => membership.customerId === customerId);
  if (!chosen) redirect(portalRoot);

  const cookieStore = await cookies();
  cookieStore.set(portalCustomerCookie, chosen.customerId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: portalRoot,
    maxAge: 60 * 60 * 24 * 365,
  });

  const supabase = await createSupabaseServerClient();
  await supabase.rpc("portal_log_event", { p_action: "customer_selected", p_customer_id: chosen.customerId });
  redirect(portalRoot);
}
