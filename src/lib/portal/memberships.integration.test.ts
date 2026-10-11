import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The portal's identity layer against a real Postgres and a real Auth server.
 *
 * Everything else about the portal is tested with those replaced. This tests
 * what only the real thing can answer: that the policies and functions give
 * each member their own customers and nothing else, that revocation is
 * immediate, that an admin without a membership gets no portal, that anon
 * gets nothing -- and that the whole account flow holds up end to end:
 * invitation, setting a password, signing in, a reset, a change.
 *
 * It runs only against a local stack (`npx supabase start`) and is skipped
 * otherwise:
 *
 *   SUPABASE_LOCAL_URL=http://127.0.0.1:54321 \
 *   SUPABASE_LOCAL_SERVICE_KEY=… SUPABASE_LOCAL_ANON_KEY=… npx vitest run …
 *
 * It cannot reach production: the URL has to be a loopback address.
 */
const url = process.env.SUPABASE_LOCAL_URL ?? "";
const serviceKey = process.env.SUPABASE_LOCAL_SERVICE_KEY ?? "";
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY ?? "";
const loopback = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+$/;
const local = loopback.test(url) && Boolean(serviceKey) && Boolean(anonKey);

/* No Next request context: cookies and redirects are replaced by a jar and a marker. */
const jar = new Map<string, string>();
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1" }),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  }),
}));
class Redirected extends Error {
  constructor(public readonly to: string) {
    super(`redirect:${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));

/* The Supabase env the actions read: the local stack, through the real factories. */
process.env.NEXT_PUBLIC_SUPABASE_URL = url;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = anonKey;
process.env.SUPABASE_SECRET_KEY = serviceKey;

/*
  The session-aware server client, as the portal actions use it: one client
  per "browser", carrying the jar. Real @supabase/ssr, so verifyOtp and
  signInWithPassword write their cookies into the jar the way they would into
  a response.
*/
let visitor: SupabaseClient<Database>;
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => visitor }));

/* The admin session the invite action runs under. */
let admin: SupabaseClient<Database>;
vi.mock("@/lib/admin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/db")>()),
  adminDb: async () => admin,
}));
vi.mock("@/lib/admin/access", () => ({ requireAdmin: async () => ({ userId: "admin", email: null, displayName: null }) }));

/* Mail is captured, never sent. */
const deliverEmail = vi.fn();
vi.mock("@/lib/admin/communications/provider", () => ({ deliverEmail: (...args: unknown[]) => deliverEmail(...args) }));

const { invitePortalMember, revokePortalMember } = await import("@/lib/admin/portal-members/actions");
const { getCustomer } = await import("@/lib/admin/customers/repository");
void getCustomer;
const actions = await import("@/lib/portal/auth-actions");
const { resolvePortalAccess, readPortalMemberships } = await import("@/lib/portal/auth");

let service: SupabaseClient<Database>;
let alfaId: string;
let betaId: string;
const made: { users: string[]; customers: string[] } = { users: [], customers: [] };

function fresh(): SupabaseClient<Database> {
  jar.clear();
  return createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

/** A signed-in client for a user the test created directly. */
async function signedIn(email: string, password: string): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return client;
}

async function createUser(email: string, password: string): Promise<string> {
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`user ${email}: ${error.message}`);
  made.users.push(data.user!.id);
  return data.user!.id;
}

async function createCustomer(name: string): Promise<string> {
  const { data, error } = await service
    .from("customers")
    .insert({ company_name: name, contact_name: "C", email: `${name.toLowerCase().replace(/\s/g, "")}@example.test`, street: "S 1", postal_code: "1011 AA", city: "A", country: "Nederland" })
    .select("id")
    .single();
  if (error) throw new Error(`customer ${name}: ${error.message}`);
  made.customers.push(data!.id);
  return data!.id;
}

async function membership(userId: string, customerId: string, email: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await service
    .from("customer_users")
    .insert({ user_id: userId, customer_id: customerId, invited_email: email, ...extra })
    .select("id")
    .single();
  if (error) throw new Error(`membership: ${error.message}`);
  return data!.id;
}

/** The token a captured mail carries, and its type. */
function tokenFromMail(index = -1): { tokenHash: string; type: string } {
  const mail = deliverEmail.mock.calls.at(index)![0] as { text: string };
  const match = mail.text.match(/token_hash=([^&\s]+)&type=([a-z]+)/);
  if (!match) throw new Error(`no token in mail: ${mail.text}`);
  return { tokenHash: match[1]!, type: match[2]! };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function expectRedirect(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof Redirected) return error.to;
    throw error;
  }
  throw new Error("expected a redirect");
}

const stamp = Date.now();
const mail = (name: string) => `portal-${name}-${stamp}@example.test`;

beforeAll(async () => {
  if (!local) return;
  service = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

  const adminId = await createUser(mail("admin"), "validation-only-password");
  const profile = await service.from("admin_profiles").insert({ user_id: adminId, display_name: "Validation" });
  if (profile.error) throw new Error(`admin profile: ${profile.error.message}`);
  admin = await signedIn(mail("admin"), "validation-only-password");

  alfaId = await createCustomer(`Alfa ${stamp}`);
  betaId = await createCustomer(`Beta ${stamp}`);
  deliverEmail.mockResolvedValue({ sent: true, sentAt: new Date().toISOString(), messageId: "local" });
}, 120_000);

afterAll(async () => {
  if (!local || !service) return;
  for (const id of made.users) await service.auth.admin.deleteUser(id);
  await service.from("portal_events").delete().in("customer_id", made.customers);
  for (const id of made.customers) await service.from("customers").delete().eq("id", id);
}, 120_000);

describe.runIf(local)("the stack under test", () => {
  it("is local, and refuses public sign-up", async () => {
    expect(url).toMatch(loopback);
    const anon = fresh();
    const attempt = await anon.auth.signUp({ email: mail("stranger"), password: "stranger-password-1" });
    expect(attempt.error?.code ?? attempt.error?.message).toBeTruthy();
  });
});

describe.runIf(local)("the tenant boundary", () => {
  it("gives each member their own customers, a revoked member nothing, an admin without membership nothing, anon nothing", async () => {
    const a = await createUser(mail("a"), "member-a-password");
    const b = await createUser(mail("b"), "member-b-password");
    const both = await createUser(mail("both"), "member-both-password");
    const gone = await createUser(mail("gone"), "member-gone-password");
    await membership(a, alfaId, mail("a"));
    await membership(b, betaId, mail("b"));
    await membership(both, alfaId, mail("both"));
    await membership(both, betaId, mail("both"));
    await membership(gone, alfaId, mail("gone"), { revoked_at: new Date().toISOString() });

    const asA = await signedIn(mail("a"), "member-a-password");
    const asB = await signedIn(mail("b"), "member-b-password");
    const asBoth = await signedIn(mail("both"), "member-both-password");
    const asGone = await signedIn(mail("gone"), "member-gone-password");

    expect((await readPortalMemberships(asA))!.map((m) => m.customerId)).toEqual([alfaId]);
    expect((await readPortalMemberships(asB))!.map((m) => m.customerId)).toEqual([betaId]);
    expect((await readPortalMemberships(asBoth))!.map((m) => m.customerId).sort()).toEqual([alfaId, betaId].sort());
    expect(await readPortalMemberships(asGone)).toEqual([]);
    expect(await readPortalMemberships(admin)).toEqual([]);

    /* The table itself: a member reads their own rows and nobody else's; anon reads nothing. */
    const own = await asA.from("customer_users").select("customer_id, invited_email");
    expect(own.data).toEqual([{ customer_id: alfaId, invited_email: mail("a") }]);
    const anon = fresh();
    const stranger = await anon.from("customer_users").select("id");
    expect(stranger.data ?? []).toEqual([]);
    const anonRpc = await anon.rpc("portal_memberships");
    expect(anonRpc.error).not.toBeNull();

    /* A member cannot write memberships, for themselves or for anyone. */
    const grab = await asA.from("customer_users").insert({ user_id: a, customer_id: betaId, invited_email: mail("a") });
    expect(grab.error).not.toBeNull();
    const promote = await asA.rpc("admin_upsert_portal_membership", { p_customer_id: betaId, p_user_id: a, p_email: mail("a") });
    expect(promote.error).not.toBeNull();
    const widen = await asA.from("customer_users").update({ revoked_at: null }).eq("user_id", gone);
    expect(widen.error ?? widen.data).toBeDefined();
    expect(await readPortalMemberships(asGone)).toEqual([]);

    /* Logging an event against a customer that is not theirs is refused. */
    const foreign = await asA.rpc("portal_log_event", { p_action: "customer_selected", p_customer_id: betaId });
    expect(foreign.error).not.toBeNull();
    const own2 = await asA.rpc("portal_log_event", { p_action: "customer_selected", p_customer_id: alfaId });
    expect(own2.error).toBeNull();
    const forbiddenAction = await asA.rpc("portal_log_event", { p_action: "member_invited", p_customer_id: alfaId });
    expect(forbiddenAction.error).not.toBeNull();
    /* An account without any membership records nothing, so the table cannot be filled from outside. */
    const byGone = await asGone.rpc("portal_log_event", { p_action: "customer_selected", p_customer_id: alfaId });
    expect(byGone.error).not.toBeNull();

    /* Events are the admin's to read, not the member's. */
    const peek = await asA.from("portal_events").select("id");
    expect(peek.data ?? []).toEqual([]);
    const adminView = await admin.from("portal_events").select("action").eq("customer_id", alfaId).eq("action", "customer_selected");
    expect(adminView.data!.length).toBeGreaterThanOrEqual(1);
  }, 120_000);

  it("ends access the moment a membership is revoked, and gives it back by invitation", async () => {
    const id = await createUser(mail("revoke"), "member-revoke-password");
    const membershipId = await membership(id, alfaId, mail("revoke"), { accepted_at: new Date().toISOString() });
    const asMember = await signedIn(mail("revoke"), "member-revoke-password");
    expect((await readPortalMemberships(asMember))!.map((m) => m.customerId)).toEqual([alfaId]);

    /* Named under the wrong customer, nothing moves. */
    const wrongCustomer = await revokePortalMember(betaId, membershipId);
    expect(wrongCustomer.ok).toBe(false);
    expect((await readPortalMemberships(asMember))!.map((m) => m.customerId)).toEqual([alfaId]);

    const revoked = await revokePortalMember(alfaId, membershipId);
    expect(revoked.ok).toBe(true);
    expect(await readPortalMemberships(asMember)).toEqual([]);

    /* Revoking twice changes nothing more. */
    const again = await revokePortalMember(alfaId, membershipId);
    expect(again.ok).toBe(true);
    const row = await service.from("customer_users").select("revoked_at").eq("id", membershipId).single();
    const firstRevokedAt = row.data!.revoked_at;

    const back = await invitePortalMember(alfaId, mail("revoke"));
    expect(back).toEqual({ ok: true, value: { outcome: "reactivated", email: mail("revoke") } });
    expect((await readPortalMemberships(asMember))!.map((m) => m.customerId)).toEqual([alfaId]);
    const rows = await service.from("customer_users").select("id").eq("user_id", id);
    expect(rows.data).toHaveLength(1);
    expect(firstRevokedAt).not.toBeNull();
  }, 120_000);
});

describe.runIf(local)("the account flow, end to end", () => {
  it("invites, sets a password through the mailed token, signs in, resets, changes", async () => {
    const email = mail("new");

    /* 1. The admin invites; the auth user did not exist. */
    const invited = await invitePortalMember(alfaId, email);
    expect(invited).toEqual({ ok: true, value: { outcome: "invited", email } });
    const token = tokenFromMail();
    expect(token.type).toBe("invite");
    const users = await service.auth.admin.listUsers({ perPage: 1000 });
    const created = users.data.users.find((user) => user.email === email)!;
    made.users.push(created.id);

    /* The invitation is recorded; the membership exists but was not accepted. */
    const pending = await service.from("customer_users").select("accepted_at, revoked_at").eq("user_id", created.id).single();
    expect(pending.data).toEqual({ accepted_at: null, revoked_at: null });

    /* 2. A retry before the person acted renews the link; still one user, one membership. */
    const retried = await invitePortalMember(alfaId, email);
    expect(retried).toEqual({ ok: true, value: { outcome: "reinvited", email } });
    const renewed = tokenFromMail();
    expect(renewed.tokenHash).not.toBe(token.tokenHash);

    /* 3. Opening the page spends nothing; setting the password with the fresh token signs in. */
    visitor = fresh();
    const to = await expectRedirect(() =>
      actions.setPasswordWithTokenAction({ error: null }, form({ token_hash: renewed.tokenHash, type: renewed.type, password: "a-long-password-123", confirmation: "a-long-password-123" })),
    );
    expect(to).toBe("/portaal");
    const access = await resolvePortalAccess(visitor, undefined);
    expect(access.state).toBe("member");
    expect(access.state === "member" && access.member.current.customerId).toBe(alfaId);
    const accepted = await service.from("customer_users").select("accepted_at").eq("user_id", created.id).single();
    expect(accepted.data!.accepted_at).not.toBeNull();

    /* The spent token is spent. */
    const replay = fresh();
    const replayed = await replay.auth.verifyOtp({ token_hash: renewed.tokenHash, type: "magiclink" });
    expect(replayed.error).not.toBeNull();

    /* 4. Signing out and in again, with the password that was set. */
    visitor = fresh();
    const wrong = await actions.portalSignInAction({ error: null }, form({ email, password: "not-the-password" }));
    expect(wrong.error).toBe("Onbekende combinatie van e-mailadres en wachtwoord.");
    const home = await expectRedirect(() => actions.portalSignInAction({ error: null }, form({ email, password: "a-long-password-123" })));
    expect(home).toBe("/portaal");

    /* 5. A reset: the answer never says whether the address exists, the mail only goes where an account is. */
    deliverEmail.mockClear();
    visitor = fresh();
    const unknown = await actions.requestPasswordResetAction({ error: null }, form({ email: mail("nobody") }));
    expect(unknown).toEqual({ error: null, done: true });
    expect(deliverEmail).not.toHaveBeenCalled();
    const known = await actions.requestPasswordResetAction({ error: null }, form({ email }));
    expect(known).toEqual({ error: null, done: true });
    const recovery = tokenFromMail();
    expect(recovery.type).toBe("recovery");
    visitor = fresh();
    const afterReset = await expectRedirect(() =>
      actions.setPasswordWithTokenAction({ error: null }, form({ token_hash: recovery.tokenHash, type: recovery.type, password: "another-long-password-456", confirmation: "another-long-password-456" })),
    );
    expect(afterReset).toBe("/portaal");

    /* 6. Changing the password needs the current one, and is recorded. */
    visitor = fresh();
    await expectRedirect(() => actions.portalSignInAction({ error: null }, form({ email, password: "another-long-password-456" })));
    const refused = await actions.changePasswordAction({ error: null }, form({ current: "wrong", password: "third-long-password-789", confirmation: "third-long-password-789" }));
    expect(refused.error).toBe("Het huidige wachtwoord klopt niet.");
    const changed = await actions.changePasswordAction({ error: null }, form({ current: "another-long-password-456", password: "third-long-password-789", confirmation: "third-long-password-789" }));
    expect(changed).toEqual({ error: null, done: true });
    const events = await admin.from("portal_events").select("action").eq("actor_user_id", created.id);
    expect(events.data!.map((e) => e.action).sort()).toEqual(["membership_accepted", "password_changed"]);

    /* 7. Signing out clears the session. */
    const out = await expectRedirect(() => actions.portalSignOutAction());
    expect(out).toBe("/portaal/inloggen");
    expect((await resolvePortalAccess(visitor, undefined)).state).toBe("anonymous");
  }, 180_000);

  it("sends a signed-in account without a membership to the no-access page, and a revoked one too", async () => {
    const email = mail("outsider");
    await createUser(email, "outsider-password-1");
    visitor = fresh();
    const to = await expectRedirect(() => actions.portalSignInAction({ error: null }, form({ email, password: "outsider-password-1" })));
    expect(to).toBe("/portaal/geen-toegang");
    expect((await resolvePortalAccess(visitor, undefined)).state).toBe("no_membership");

    /* An admin signing in to the portal is an outsider to it as well. */
    visitor = fresh();
    const adminTo = await expectRedirect(() => actions.portalSignInAction({ error: null }, form({ email: mail("admin"), password: "validation-only-password" })));
    expect(adminTo).toBe("/portaal/geen-toegang");
  }, 60_000);

  it("ignores a remembered customer that is not theirs, and honours one that is", async () => {
    const email = mail("multi");
    const id = await createUser(email, "multi-password-1234");
    await membership(id, alfaId, email, { accepted_at: new Date().toISOString() });
    await membership(id, betaId, email, { accepted_at: new Date().toISOString() });
    visitor = fresh();
    await expectRedirect(() => actions.portalSignInAction({ error: null }, form({ email, password: "multi-password-1234" })));

    const other = await createCustomer(`Gamma ${stamp}`);
    const foreign = await resolvePortalAccess(visitor, other);
    expect(foreign.state === "member" && foreign.member.current.customerId).not.toBe(other);

    const chosen = await expectRedirect(() => actions.selectCustomerAction(form({ customerId: betaId })));
    expect(chosen).toBe("/portaal");
    expect(jar.get("ym_portal_customer")).toBe(betaId);
    const current = await resolvePortalAccess(visitor, jar.get("ym_portal_customer"));
    expect(current.state === "member" && current.member.current.customerId).toBe(betaId);

    const stolen = await expectRedirect(() => actions.selectCustomerAction(form({ customerId: other })));
    expect(stolen).toBe("/portaal");
    expect(jar.get("ym_portal_customer")).toBe(betaId);
  }, 60_000);
});
