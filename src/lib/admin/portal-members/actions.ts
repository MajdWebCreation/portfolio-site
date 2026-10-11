"use server";

import { revalidatePath } from "next/cache";
import { actionFailed, type ActionResult } from "@/lib/admin/action-result";
import { requireAdmin } from "@/lib/admin/access";
import { getCustomer } from "@/lib/admin/customers/repository";
import { adminDb } from "@/lib/admin/db";
import { isEmailAddress } from "@/lib/email/address";
import { ensureAuthUserForEmail, renewInviteToken, type EnsuredAuthUser } from "@/lib/portal/admin-auth";
import { accessGrantedMail, inviteMail, reinviteMail, sendPortalMail } from "@/lib/portal/mail";

/**
 * Giving a person portal access to a customer, and taking it away.
 *
 * Three systems take part in an invitation and they share no transaction:
 * the Auth server (the user and the link), this database (the membership and
 * its record) and the mailer. So the flow is ordered so that every step is
 * safe to run again, and a retry after any failure finishes the job rather
 * than doubling it:
 *
 *   1. The auth user. One per address on the Auth server, so asking twice
 *      yields the same user. A new user gets an invite token; an existing
 *      one has a password already and gets no token.
 *   2. The membership, through `admin_upsert_portal_membership`, which says
 *      what it found: made, renewed, reactivated or already there. The
 *      record in portal_events is written in the same statement.
 *   3. The mail. If it fails the admin is told; the membership exists, and
 *      the next attempt renews the link and mails again.
 *
 * An address that already has an accepted, active membership gets nothing
 * mailed and the admin is told so.
 */
export type InviteOutcome = "invited" | "reinvited" | "reactivated" | "already_member";

export type InviteResult = { outcome: InviteOutcome; email: string };

function upsertResult(value: unknown): { membershipId: string; outcome: InviteOutcome; accepted: boolean } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { membership_id, outcome, accepted } = value as Record<string, unknown>;
  if (typeof membership_id !== "string" || typeof outcome !== "string" || typeof accepted !== "boolean") return undefined;
  if (!["invited", "reinvited", "reactivated", "already_member"].includes(outcome)) return undefined;
  return { membershipId: membership_id, outcome: outcome as InviteOutcome, accepted };
}

/** The auth user an address was invited under before, if this administration knows it. Read as the admin. */
async function knownUserIdForEmail(db: Awaited<ReturnType<typeof adminDb>>, email: string): Promise<string | null> {
  const { data, error } = await db.from("customer_users").select("user_id").eq("invited_email", email).limit(1);
  if (error) throw new Error(`Lidmaatschappen lezen: ${error.message}`);
  return data?.[0]?.user_id ?? null;
}

/** Whether this account ever set a password: some membership of theirs, for any customer, was accepted. Read as the admin. */
async function hasAcceptedAnyMembership(db: Awaited<ReturnType<typeof adminDb>>, userId: string): Promise<boolean> {
  const { data, error } = await db.from("customer_users").select("id").eq("user_id", userId).not("accepted_at", "is", null).limit(1);
  if (error) throw new Error(`Lidmaatschappen lezen: ${error.message}`);
  return (data ?? []).length > 0;
}

export async function invitePortalMember(customerId: string, emailInput: string): Promise<ActionResult<InviteResult>> {
  await requireAdmin();
  const db = await adminDb();

  const email = emailInput.trim().toLowerCase();
  if (!isEmailAddress(email)) return { ok: false, error: "Vul een geldig e-mailadres in." };

  const customer = await getCustomer(customerId);
  if (!customer) return { ok: false, error: "Deze klant bestaat niet (meer)." };

  /*
    An address this administration already invited somewhere has a known auth
    user: no need to ask the Auth server, and no token minted only to be
    thrown away. Only an address we have never seen goes to the Auth server.
  */
  let user: EnsuredAuthUser;
  try {
    const known = await knownUserIdForEmail(db, email);
    user = known ? { userId: known, kind: "existing" } : await ensureAuthUserForEmail(email);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Het account kon niet worden aangemaakt." };
  }

  const upserted = await db.rpc("admin_upsert_portal_membership", {
    p_customer_id: customerId,
    p_user_id: user.userId,
    p_email: email,
  });
  if (upserted.error) return actionFailed(upserted.error, "Het lidmaatschap kon niet worden vastgelegd.");
  const membership = upsertResult(upserted.data);
  if (!membership) return { ok: false, error: "Het lidmaatschap kon niet worden vastgelegd." };

  /* The row exists from here on, whatever the mail does; the screen should show it either way. */
  revalidatePath(`/admin/klanten/${customerId}`);

  if (membership.outcome === "already_member") {
    return { ok: true, value: { outcome: "already_member", email } };
  }

  /*
    What to mail depends on the account, not on this membership: a person who
    never set a password -- no membership of theirs, for any customer, was
    ever accepted -- needs a link that lets them; a person with a password
    needs to know the door is open.
  */
  let content;
  if (user.kind === "new") {
    content = inviteMail({ companyName: customer.companyName, tokenHash: user.tokenHash });
  } else if (await hasAcceptedAnyMembership(db, user.userId)) {
    content = accessGrantedMail({ companyName: customer.companyName });
  } else {
    const tokenHash = await renewInviteToken(email).catch(() => null);
    content = tokenHash ? reinviteMail({ companyName: customer.companyName, tokenHash }) : accessGrantedMail({ companyName: customer.companyName });
  }

  const delivery = await sendPortalMail(email, content);
  if (!delivery.sent) {
    return {
      ok: false,
      error: `Het lidmaatschap is vastgelegd, maar de mail kon niet worden verstuurd: ${delivery.reason} Probeer het opnieuw; er wordt dan een nieuwe link gemaild.`,
    };
  }

  return { ok: true, value: { outcome: membership.outcome, email } };
}

/** Ends a membership. The row stays, with the moment; the person's account is untouched. */
export async function revokePortalMember(customerId: string, membershipId: string): Promise<ActionResult<string>> {
  await requireAdmin();
  const db = await adminDb();

  const { error } = await db.rpc("admin_revoke_portal_membership", { p_customer_id: customerId, p_membership_id: membershipId });
  if (error) return actionFailed(error, "De toegang kon niet worden ingetrokken.");

  revalidatePath(`/admin/klanten/${customerId}`);
  return { ok: true, value: membershipId };
}
