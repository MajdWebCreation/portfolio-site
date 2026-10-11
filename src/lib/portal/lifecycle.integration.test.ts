import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The account lifecycle, scenario by scenario, against a real Postgres and a
 * real GoTrue. The one promise under test: a customer never gets stuck. Every
 * failure state has a way on that needs no hand in the database, no retry
 * doubles anything, and a membership that was ended stays ended whatever
 * token or session the person still holds.
 *
 * Expiry is simulated by backdating the Auth server's own timestamps through
 * the local database container; GoTrue computes "expired" from those. That
 * only works against the local stack, which is the only place this runs:
 *
 *   SUPABASE_LOCAL_URL=http://127.0.0.1:54321 \
 *   SUPABASE_LOCAL_SERVICE_KEY=… SUPABASE_LOCAL_ANON_KEY=… npx vitest run …
 */
const url = process.env.SUPABASE_LOCAL_URL ?? "";
const serviceKey = process.env.SUPABASE_LOCAL_SERVICE_KEY ?? "";
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY ?? "";
const loopback = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+$/;
const local = loopback.test(url) && Boolean(serviceKey) && Boolean(anonKey);

const jar = new Map<string, string>();
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1" }),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (cookie: string | { name: string }) => jar.delete(typeof cookie === "string" ? cookie : cookie.name),
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

process.env.NEXT_PUBLIC_SUPABASE_URL = url;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = anonKey;
process.env.SUPABASE_SECRET_KEY = serviceKey;

let visitor: SupabaseClient<Database>;
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => visitor }));
let admin: SupabaseClient<Database>;
vi.mock("@/lib/admin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/db")>()),
  adminDb: async () => admin,
}));
vi.mock("@/lib/admin/access", () => ({ requireAdmin: async () => ({ userId: "admin", email: null, displayName: null }) }));
const deliverEmail = vi.fn();
vi.mock("@/lib/admin/communications/provider", () => ({ deliverEmail: (...args: unknown[]) => deliverEmail(...args) }));

const { invitePortalMember, revokePortalMember } = await import("@/lib/admin/portal-members/actions");
const { listPortalMembersForCustomer } = await import("@/lib/admin/portal-members/repository");
const actions = await import("@/lib/portal/auth-actions");
const { resolvePortalAccess, readPortalMemberships } = await import("@/lib/portal/auth");
const { resolveAdminAccess } = await import("@/lib/admin/auth");
const { resetRateLimits } = await import("@/lib/payments/rate-limit");

let service: SupabaseClient<Database>;
let adminUserId: string;
let alfaId: string;
let betaId: string;
const made: { users: string[]; customers: string[] } = { users: [], customers: [] };
const stamp = Date.now();
const mail = (name: string) => `lifecycle-${name}-${stamp}@example.test`;

/* Backdates the Auth server's own "sent at" stamps, which is what it computes expiry from. */
function expireTokensOf(email: string) {
  execFileSync("docker", [
    "exec",
    "supabase_db_portfolio-site",
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-tAc",
    `update auth.users set confirmation_sent_at = now() - interval '2 hours', recovery_sent_at = now() - interval '2 hours' where email = '${email.replace(/'/g, "''")}'`,
  ]);
}

function fresh(): SupabaseClient<Database> {
  jar.clear();
  return createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

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

async function authUser(email: string) {
  const users = await service.auth.admin.listUsers({ perPage: 1000 });
  return users.data.users.find((user) => user.email === email);
}

async function remember(email: string) {
  const user = await authUser(email);
  if (user && !made.users.includes(user.id)) made.users.push(user.id);
  return user;
}

async function membershipsOf(email: string) {
  const { data } = await service.from("customer_users").select("customer_id, accepted_at, revoked_at").eq("invited_email", email).order("created_at");
  return data ?? [];
}

async function eventsFor(customerId: string) {
  const { data } = await service.from("portal_events").select("action").eq("customer_id", customerId).order("occurred_at");
  return (data ?? []).map((row) => row.action);
}

function lastToken(): { tokenHash: string; type: string } {
  const sent = deliverEmail.mock.calls.at(-1)![0] as { text: string };
  const match = sent.text.match(/token_hash=([^&\s]+)&type=([a-z]+)/);
  if (!match) throw new Error(`no token in mail: ${sent.text}`);
  return { tokenHash: match[1]!, type: match[2]! };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function redirectOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof Redirected) return error.to;
    throw error;
  }
  throw new Error("expected a redirect");
}

const setPassword = (token: { tokenHash: string; type: string }, password: string) =>
  actions.setPasswordWithTokenAction({ error: null }, form({ token_hash: token.tokenHash, type: token.type, password, confirmation: password }));
const signIn = (email: string, password: string) => actions.portalSignInAction({ error: null }, form({ email, password }));

/** No error a customer reads may be a Supabase code or a constraint name. */
function expectPlainDutch(message: string | null | undefined) {
  expect(message).toBeTruthy();
  expect(message).not.toMatch(/otp_expired|invalid_credentials|PGRST|42501|P0002|23505|violates|constraint|undefined|null/i);
}

beforeAll(async () => {
  if (!local) return;
  service = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });
  adminUserId = await createUser(mail("admin"), "validation-only-password");
  const profile = await service.from("admin_profiles").insert({ user_id: adminUserId, display_name: "Lifecycle" });
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

describe.runIf(local)("INVITE", () => {
  it("1-3: an invitation makes an unconfirmed user and a pending membership; opening the link spends nothing, so it works later", async () => {
    const email = mail("open-later");
    const invited = await invitePortalMember(alfaId, email);
    expect(invited).toEqual({ ok: true, value: { outcome: "invited", email } });
    const user = (await remember(email))!;
    expect(user.email_confirmed_at ?? null).toBeNull();
    expect(await membershipsOf(email)).toEqual([{ customer_id: alfaId, accepted_at: null, revoked_at: null }]);
    expect(await eventsFor(alfaId)).toContain("member_invited");
    const token = lastToken();

    /* Scenario 2 and 3: the page is opened and closed, and opened again. Nothing is verified on arrival, so the token is intact. */
    visitor = fresh();
    expect((await resolvePortalAccess(visitor, undefined)).state).toBe("anonymous");
    visitor = fresh();
    expect(await redirectOf(() => setPassword(token, "later-but-fine-123"))).toBe("/portaal");
    expect((await membershipsOf(email))[0]!.accepted_at).not.toBeNull();
  }, 60_000);

  it("4-7: an expired invitation says so and offers a way on; a new invitation works and retires the old link", async () => {
    const email = mail("expired");
    await invitePortalMember(alfaId, email);
    await remember(email);
    const expired = lastToken();
    expireTokensOf(email);

    visitor = fresh();
    const stuck = await setPassword(expired, "a-perfectly-good-pw-1");
    expect(stuck.kind).toBe("invalid_link");
    expectPlainDutch(stuck.error);
    expect((await resolvePortalAccess(visitor, undefined)).state).toBe("anonymous");
    /* Nothing in the record changed: still invited, not accepted, one user. */
    expect((await membershipsOf(email))[0]!.accepted_at).toBeNull();

    /* Way on A: the admin invites again. */
    const again = await invitePortalMember(alfaId, email);
    expect(again).toEqual({ ok: true, value: { outcome: "reinvited", email } });
    const renewed = lastToken();
    expect(renewed.tokenHash).not.toBe(expired.tokenHash);
    expect((await membershipsOf(email)).length).toBe(1);

    /* Scenario 6: the old link is dead for good, even if it had not expired. */
    visitor = fresh();
    expect((await setPassword(expired, "a-perfectly-good-pw-1")).kind).toBe("invalid_link");

    /* Scenario 7: the new one works. */
    visitor = fresh();
    expect(await redirectOf(() => setPassword(renewed, "a-perfectly-good-pw-1"))).toBe("/portaal");
  }, 60_000);

  it("4b: an expired invitation is also recoverable by the customer alone, through 'wachtwoord vergeten'", async () => {
    const email = mail("self-recover");
    await invitePortalMember(betaId, email);
    await remember(email);
    expireTokensOf(email);
    deliverEmail.mockClear();

    visitor = fresh();
    const asked = await actions.requestPasswordResetAction({ error: null }, form({ email }));
    expect(asked).toEqual({ error: null, done: true });
    expect(deliverEmail).toHaveBeenCalledTimes(1);
    const token = lastToken();
    visitor = fresh();
    expect(await redirectOf(() => setPassword(token, "self-recovered-pw-1"))).toBe("/portaal");
    expect((await membershipsOf(email))[0]!.accepted_at).not.toBeNull();
  }, 60_000);

  it("8: a double click makes one user, one membership and two mails, and the person gets in exactly once", async () => {
    const email = mail("double");
    deliverEmail.mockClear();
    const [a, b] = await Promise.all([invitePortalMember(alfaId, email), invitePortalMember(alfaId, email)]);
    await remember(email);

    expect([a, b].map((result) => (result.ok ? "ok" : result.error))).toEqual(["ok", "ok"]);
    const outcomes = [a, b].map((result) => (result.ok ? result.value.outcome : result.error)).sort();
    expect(outcomes).toEqual(["invited", "reinvited"]);
    expect((await membershipsOf(email)).length).toBe(1);
    const users = (await service.auth.admin.listUsers({ perPage: 1000 })).data.users.filter((user) => user.email === email);
    expect(users).toHaveLength(1);
    expect(deliverEmail).toHaveBeenCalledTimes(2);

    /*
      Two mails, minted at the same instant, in an order the mailer does not
      know. Whichever link the person uses first signs them in; after that
      neither link does anything -- a token is spent once, and a dead one says
      so without a session.
    */
    const tokens = deliverEmail.mock.calls.map(([sent]) => {
      const match = (sent as { text: string }).text.match(/token_hash=([^&\s]+)&type=([a-z]+)/)!;
      return { tokenHash: match[1]!, type: match[2]! };
    });
    let entered = 0;
    for (const token of tokens) {
      visitor = fresh();
      try {
        await setPassword(token, "double-click-pw-123");
      } catch (error) {
        if (!(error instanceof Redirected)) throw error;
        expect(error.to).toBe("/portaal");
        entered += 1;
      }
    }
    expect(entered).toBe(1);
    for (const token of tokens) {
      visitor = fresh();
      expect((await setPassword(token, "double-click-pw-456")).kind).toBe("invalid_link");
      expect((await resolvePortalAccess(visitor, undefined)).state).toBe("anonymous");
    }
    visitor = fresh();
    expect(await redirectOf(() => signIn(email, "double-click-pw-123"))).toBe("/portaal");
  }, 60_000);

  it("9-10: a failed mail leaves a membership the admin sees, and the retry renews the link without a second user", async () => {
    const email = mail("mailfail");
    deliverEmail.mockResolvedValueOnce({ sent: false, reason: "Resend 503", failure: "error" });

    const first = await invitePortalMember(alfaId, email);
    await remember(email);
    expect(first.ok).toBe(false);
    expect(first.ok === false && first.error).toContain("vastgelegd, maar de mail");
    expect((await membershipsOf(email)).length).toBe(1);
    const shown = await listPortalMembersForCustomer(alfaId);
    expect(shown.some((member) => member.email === email)).toBe(true);

    const second = await invitePortalMember(alfaId, email);
    expect(second).toEqual({ ok: true, value: { outcome: "reinvited", email } });
    expect((await membershipsOf(email)).length).toBe(1);
    const users = (await service.auth.admin.listUsers({ perPage: 1000 })).data.users.filter((user) => user.email === email);
    expect(users).toHaveLength(1);
    visitor = fresh();
    expect(await redirectOf(() => setPassword(lastToken(), "after-mail-fail-pw1"))).toBe("/portaal");
  }, 60_000);

  it("injection: the membership write fails after the auth user exists; the retry finishes with one user and one membership", async () => {
    const email = mail("dbfail");
    /* The database refuses the membership once, after the Auth server already made the user. */
    const realAdmin = admin;
    let failOnce = true;
    admin = new Proxy(realAdmin, {
      get(target, property, receiver) {
        if (property === "rpc") {
          return (name: string, args: unknown) => {
            if (name === "admin_upsert_portal_membership" && failOnce) {
              failOnce = false;
              return Promise.resolve({ data: null, error: { message: "connection reset", code: "08006" } });
            }
            return (target.rpc as (n: string, a: unknown) => unknown)(name, args);
          };
        }
        return Reflect.get(target, property, receiver);
      },
    }) as typeof realAdmin;
    const failed = await invitePortalMember(alfaId, email);
    admin = realAdmin;
    await remember(email);

    expect(failed.ok).toBe(false);
    expect(await authUser(email)).toBeDefined();
    expect(await membershipsOf(email)).toEqual([]);

    const retried = await invitePortalMember(alfaId, email);
    expect(retried).toEqual({ ok: true, value: { outcome: "invited", email } });
    expect((await membershipsOf(email)).length).toBe(1);
    const users = (await service.auth.admin.listUsers({ perPage: 1000 })).data.users.filter((user) => user.email === email);
    expect(users).toHaveLength(1);
    visitor = fresh();
    expect(await redirectOf(() => setPassword(lastToken(), "after-db-fail-pw-12"))).toBe("/portaal");
  }, 60_000);

  it("11: an existing account without any membership is let in by invitation and keeps its password", async () => {
    const email = mail("existing");
    await createUser(email, "existing-password-123");
    deliverEmail.mockClear();

    const invited = await invitePortalMember(alfaId, email);
    expect(invited).toEqual({ ok: true, value: { outcome: "invited", email } });
    const users = (await service.auth.admin.listUsers({ perPage: 1000 })).data.users.filter((user) => user.email === email);
    expect(users).toHaveLength(1);
    /* Never accepted anything, so the mail carries a link to set a password... */
    expect(lastToken().type).toBe("magiclink");
    /* ...but the password they already have works as well. */
    visitor = fresh();
    expect(await redirectOf(() => signIn(email, "existing-password-123"))).toBe("/portaal");
  }, 60_000);

  it("12 and 38-39: a revoked membership is given back by a new invitation, and the person is in again", async () => {
    const email = mail("revoked-reinvite");
    await invitePortalMember(alfaId, email);
    await remember(email);
    visitor = fresh();
    await redirectOf(() => setPassword(lastToken(), "revoked-reinvite-pw1"));
    const members = await listPortalMembersForCustomer(alfaId);
    const membershipId = members.find((member) => member.email === email)!.id;
    expect((await revokePortalMember(alfaId, membershipId)).ok).toBe(true);
    expect((await resolvePortalAccess(visitor, undefined)).state).toBe("no_membership");

    deliverEmail.mockClear();
    const back = await invitePortalMember(alfaId, email);
    expect(back).toEqual({ ok: true, value: { outcome: "reactivated", email } });
    /* They have a password: the door is opened, no token is minted. */
    expect((deliverEmail.mock.calls[0]![0] as { text: string }).text).not.toContain("token_hash");
    expect((await membershipsOf(email)).length).toBe(1);
    visitor = fresh();
    expect(await redirectOf(() => signIn(email, "revoked-reinvite-pw1"))).toBe("/portaal");
    expect(await eventsFor(alfaId)).toEqual(expect.arrayContaining(["member_revoked", "member_reactivated"]));
  }, 60_000);

  it("13: a portal user given a second customer signs in once and switches", async () => {
    const email = mail("second");
    await invitePortalMember(alfaId, email);
    await remember(email);
    visitor = fresh();
    await redirectOf(() => setPassword(lastToken(), "second-customer-pw-1"));
    deliverEmail.mockClear();

    const second = await invitePortalMember(betaId, email);
    expect(second).toEqual({ ok: true, value: { outcome: "invited", email } });
    expect((deliverEmail.mock.calls[0]![0] as { text: string }).text).not.toContain("token_hash");
    const access = await resolvePortalAccess(visitor, undefined);
    expect(access.state === "member" && access.member.memberships.map((m) => m.customerId).sort()).toEqual([alfaId, betaId].sort());
  }, 60_000);
});

describe.runIf(local)("PASSWORD SETUP", () => {
  it("14-19: policy, double submit, refresh, invalid token, and a normal sign-in later", async () => {
    const email = mail("setup");
    await invitePortalMember(alfaId, email);
    await remember(email);
    const token = lastToken();

    /* 15: our own rule, before the token is touched. */
    visitor = fresh();
    const short = await setPassword(token, "short");
    expect(short.error).toContain("minimaal 10 tekens");
    const mismatch = await actions.setPasswordWithTokenAction({ error: null }, form({ token_hash: token.tokenHash, type: token.type, password: "a-long-enough-pw-1", confirmation: "a-different-pw-123" }));
    expect(mismatch.error).toBe("De twee wachtwoorden zijn niet gelijk.");
    expect((await resolvePortalAccess(visitor, undefined)).state).toBe("anonymous");

    /* 17: a refresh is a GET; nothing happens to the token (same token still works below). */
    /* 14: a good password goes through. */
    expect(await redirectOf(() => setPassword(token, "a-long-enough-pw-1"))).toBe("/portaal");

    /* 16: the form is submitted twice; the second arrives with a spent token. It is told so, and that it is already signed in. */
    const twice = await setPassword(token, "a-long-enough-pw-1");
    expect(twice.kind).toBe("invalid_link");
    expect(twice.signedIn).toBe(true);
    expect((await resolvePortalAccess(visitor, undefined)).state).toBe("member");

    /* 18: garbage. */
    visitor = fresh();
    const garbage = await setPassword({ tokenHash: "not-a-real-token", type: "invite" }, "a-long-enough-pw-1");
    expect(garbage.kind).toBe("invalid_link");
    expectPlainDutch(garbage.error);
    const wrongType = await setPassword({ tokenHash: token.tokenHash, type: "nonsense" }, "a-long-enough-pw-1");
    expect(wrongType.kind).toBe("invalid_link");

    /* 19: later, a plain sign-in. */
    visitor = fresh();
    expect(await redirectOf(() => signIn(email, "a-long-enough-pw-1"))).toBe("/portaal");
    expect((await resolvePortalAccess(visitor, undefined)).state).toBe("member");
  }, 90_000);
});

describe.runIf(local)("FORGOT / RESET", () => {
  it("20-28: reset right after setup, one answer for every address, expiry, reuse, two mails, old password dead", async () => {
    const email = mail("reset");
    await invitePortalMember(alfaId, email);
    await remember(email);
    visitor = fresh();
    await redirectOf(() => setPassword(lastToken(), "first-password-abc1"));

    /* 22: unknown address, same answer, no mail. */
    deliverEmail.mockClear();
    resetRateLimits();
    visitor = fresh();
    expect(await actions.requestPasswordResetAction({ error: null }, form({ email: mail("nobody-here") }))).toEqual({ error: null, done: true });
    expect(deliverEmail).not.toHaveBeenCalled();

    /* 20, 21, 23, 27, 28 */
    expect(await actions.requestPasswordResetAction({ error: null }, form({ email }))).toEqual({ error: null, done: true });
    const recovery = lastToken();
    expect(recovery.type).toBe("recovery");
    visitor = fresh();
    expect(await redirectOf(() => setPassword(recovery, "second-password-def2"))).toBe("/portaal");
    visitor = fresh();
    expect(await redirectOf(() => signIn(email, "second-password-def2"))).toBe("/portaal");
    visitor = fresh();
    expect((await signIn(email, "first-password-abc1")).error).toBe("Onbekende combinatie van e-mailadres en wachtwoord.");

    /* 25: the spent link, used again, says so and offers a new one; nobody is signed in by it. */
    visitor = fresh();
    const reused = await setPassword(recovery, "third-password-ghi3");
    expect(reused.kind).toBe("invalid_link");
    expect((await resolvePortalAccess(visitor, undefined)).state).toBe("anonymous");

    /* 26: two mails shortly after each other: the first link dies, the last one works. */
    resetRateLimits();
    deliverEmail.mockClear();
    visitor = fresh();
    await actions.requestPasswordResetAction({ error: null }, form({ email }));
    const earlier = lastToken();
    await actions.requestPasswordResetAction({ error: null }, form({ email }));
    const later = lastToken();
    expect(later.tokenHash).not.toBe(earlier.tokenHash);
    visitor = fresh();
    expect((await setPassword(earlier, "fourth-password-jkl4")).kind).toBe("invalid_link");
    visitor = fresh();
    expect(await redirectOf(() => setPassword(later, "fourth-password-jkl4"))).toBe("/portaal");

    /* 24: an expired recovery link. */
    resetRateLimits();
    deliverEmail.mockClear();
    visitor = fresh();
    await actions.requestPasswordResetAction({ error: null }, form({ email }));
    const stale = lastToken();
    expireTokensOf(email);
    visitor = fresh();
    const expired = await setPassword(stale, "fifth-password-mno5");
    expect(expired.kind).toBe("invalid_link");
    expectPlainDutch(expired.error);
    /* The fourth password still stands. */
    visitor = fresh();
    expect(await redirectOf(() => signIn(email, "fourth-password-jkl4"))).toBe("/portaal");
  }, 120_000);
});

describe.runIf(local)("RESET SCOPE AND REJECTED PASSWORDS", () => {
  it("the portal resets portal accounts only: an admin or a stranger the Auth server knows gets no mail, and the same answer", async () => {
    resetRateLimits();
    deliverEmail.mockClear();
    visitor = fresh();
    expect(await actions.requestPasswordResetAction({ error: null }, form({ email: mail("admin") }))).toEqual({ error: null, done: true });
    const stranger = mail("known-stranger");
    await createUser(stranger, "stranger-password-02");
    expect(await actions.requestPasswordResetAction({ error: null }, form({ email: stranger }))).toEqual({ error: null, done: true });
    expect(deliverEmail).not.toHaveBeenCalled();
  }, 60_000);

  it("a password the Auth server refuses is retried on the session the link opened, and really set", async () => {
    const email = mail("rejected");
    await invitePortalMember(alfaId, email);
    await remember(email);
    visitor = fresh();
    await redirectOf(() => setPassword(lastToken(), "the-first-password-1"));

    /* A reset, then the same password again: the Auth server refuses it. */
    resetRateLimits();
    deliverEmail.mockClear();
    visitor = fresh();
    await actions.requestPasswordResetAction({ error: null }, form({ email }));
    const token = lastToken();
    visitor = fresh();
    const rejected = await setPassword(token, "the-first-password-1");
    expect(rejected.kind).toBe("password_rejected");
    expect(rejected.error).toBe("Kies een ander wachtwoord dan het vorige.");

    /* The screen retries on the session, without the spent token. */
    const retried = await redirectOf(() =>
      actions.setPasswordWithTokenAction({ error: null }, form({ token_hash: "", type: "session", password: "the-second-password-2", confirmation: "the-second-password-2" })),
    );
    expect(retried).toBe("/portaal");
    visitor = fresh();
    expect(await redirectOf(() => signIn(email, "the-second-password-2"))).toBe("/portaal");
    visitor = fresh();
    expect((await signIn(email, "the-first-password-1")).error).toBeTruthy();

    /* Without a session, "session" is just a dead link. */
    visitor = fresh();
    const cold = await actions.setPasswordWithTokenAction({ error: null }, form({ token_hash: "", type: "session", password: "the-third-password-3", confirmation: "the-third-password-3" }));
    expect(cold.kind).toBe("invalid_link");
  }, 90_000);
});

describe.runIf(local)("PASSWORD CHANGE", () => {
  it("29-32: wrong current password refused; right one changes it; old one dead; membership untouched", async () => {
    const email = mail("change");
    await invitePortalMember(alfaId, email);
    await remember(email);
    visitor = fresh();
    await redirectOf(() => setPassword(lastToken(), "change-me-please-01"));

    const wrong = await actions.changePasswordAction({ error: null }, form({ current: "nope", password: "changed-password-02", confirmation: "changed-password-02" }));
    expect(wrong.error).toBe("Het huidige wachtwoord klopt niet.");
    const changed = await actions.changePasswordAction({ error: null }, form({ current: "change-me-please-01", password: "changed-password-02", confirmation: "changed-password-02" }));
    expect(changed).toEqual({ error: null, done: true });

    visitor = fresh();
    expect((await signIn(email, "change-me-please-01")).error).toBeTruthy();
    visitor = fresh();
    expect(await redirectOf(() => signIn(email, "changed-password-02"))).toBe("/portaal");
    const access = await resolvePortalAccess(visitor, undefined);
    expect(access.state === "member" && access.member.current.customerId).toBe(alfaId);
    expect(await eventsFor(alfaId)).toContain("password_changed");
  }, 60_000);
});

describe.runIf(local)("REVOKE / SESSION", () => {
  it("33-37: a revocation ends access on the very next request, for the open session, a refresh, a reset and a new sign-in", async () => {
    const email = mail("revoke-live");
    await invitePortalMember(alfaId, email);
    await remember(email);
    visitor = fresh();
    await redirectOf(() => setPassword(lastToken(), "revoke-live-pw-0001"));
    expect((await resolvePortalAccess(visitor, undefined)).state).toBe("member");
    const live = visitor;

    const membershipId = (await listPortalMembersForCustomer(alfaId)).find((member) => member.email === email)!.id;
    expect((await revokePortalMember(alfaId, membershipId)).ok).toBe(true);

    /* 35-36: the same session, the same tab. */
    expect((await resolvePortalAccess(live, undefined)).state).toBe("no_membership");
    expect(await readPortalMemberships(live)).toEqual([]);
    const selected = await redirectOf(() => actions.selectCustomerAction(form({ customerId: alfaId })));
    expect(selected).toBe("/portaal/inloggen");

    /* 37: a password reset gives a session, not access. */
    resetRateLimits();
    deliverEmail.mockClear();
    visitor = fresh();
    await actions.requestPasswordResetAction({ error: null }, form({ email }));
    visitor = fresh();
    expect(await redirectOf(() => setPassword(lastToken(), "revoke-live-pw-0002"))).toBe("/portaal/geen-toegang");
    expect((await resolvePortalAccess(visitor, undefined)).state).toBe("no_membership");
    visitor = fresh();
    expect(await redirectOf(() => signIn(email, "revoke-live-pw-0002"))).toBe("/portaal/geen-toegang");
    /* The record says revoked; the first use stays recorded. */
    const row = (await membershipsOf(email))[0]!;
    expect(row.revoked_at).not.toBeNull();
    expect(row.accepted_at).not.toBeNull();
  }, 90_000);
});

describe.runIf(local)("MULTI-CUSTOMER", () => {
  it("40-44: two customers, switching, an injected id, and revoking one then the other", async () => {
    const email = mail("multi");
    await invitePortalMember(alfaId, email);
    await remember(email);
    visitor = fresh();
    await redirectOf(() => setPassword(lastToken(), "multi-customer-pw-01"));
    await invitePortalMember(betaId, email);

    /* 41 */
    expect(await redirectOf(() => actions.selectCustomerAction(form({ customerId: betaId })))).toBe("/portaal");
    expect(jar.get("ym_portal_customer")).toBe(betaId);
    let access = await resolvePortalAccess(visitor, jar.get("ym_portal_customer"));
    expect(access.state === "member" && access.member.current.customerId).toBe(betaId);

    /* 42: an id that is not theirs, by the form and by the cookie. */
    const gamma = await createCustomer(`Gamma ${stamp}`);
    expect(await redirectOf(() => actions.selectCustomerAction(form({ customerId: gamma })))).toBe("/portaal");
    expect(jar.get("ym_portal_customer")).toBe(betaId);
    jar.set("ym_portal_customer", gamma);
    access = await resolvePortalAccess(visitor, jar.get("ym_portal_customer"));
    expect(access.state === "member" && access.member.current.customerId).not.toBe(gamma);
    expect(access.state === "member" && access.member.memberships.some((m) => m.customerId === gamma)).toBe(false);

    /* 43 */
    const alfaMembership = (await listPortalMembersForCustomer(alfaId)).find((member) => member.email === email)!.id;
    await revokePortalMember(alfaId, alfaMembership);
    access = await resolvePortalAccess(visitor, betaId);
    expect(access.state === "member" && access.member.memberships.map((m) => m.customerId)).toEqual([betaId]);
    expect(access.state === "member" && access.member.current.customerId).toBe(betaId);

    /* 44 */
    const betaMembership = (await listPortalMembersForCustomer(betaId)).find((member) => member.email === email)!.id;
    await revokePortalMember(betaId, betaMembership);
    expect((await resolvePortalAccess(visitor, betaId)).state).toBe("no_membership");
  }, 90_000);
});

describe.runIf(local)("ADMIN / PORTAL CROSSOVER", () => {
  it("45-48: a member is no admin, an admin is no member, signing out clears the portal, and a bare session grants nothing", async () => {
    const email = mail("crossover");
    await invitePortalMember(alfaId, email);
    await remember(email);
    visitor = fresh();
    await redirectOf(() => setPassword(lastToken(), "crossover-pw-00001"));

    /* 45 */
    expect((await resolveAdminAccess(visitor)).state).toBe("denied");
    /* 46 */
    expect((await resolvePortalAccess(admin, undefined)).state).toBe("no_membership");
    visitor = fresh();
    expect(await redirectOf(() => signIn(mail("admin"), "validation-only-password"))).toBe("/portaal/geen-toegang");

    /* 47 */
    visitor = fresh();
    await redirectOf(() => signIn(email, "crossover-pw-00001"));
    await redirectOf(() => actions.selectCustomerAction(form({ customerId: alfaId })));
    expect(jar.get("ym_portal_customer")).toBe(alfaId);
    expect(await redirectOf(() => actions.portalSignOutAction())).toBe("/portaal/inloggen");
    expect(jar.has("ym_portal_customer")).toBe(false);
    expect((await resolvePortalAccess(visitor, undefined)).state).toBe("anonymous");

    /* 48, and the public-sign-up question answered from the other side: a session with no membership reaches no portal function. */
    const stranger = mail("stranger");
    await createUser(stranger, "stranger-password-01");
    const asStranger = await signedIn(stranger, "stranger-password-01");
    expect(await readPortalMemberships(asStranger)).toEqual([]);
    expect((await asStranger.rpc("portal_log_event", { p_action: "customer_selected", p_customer_id: alfaId })).error).not.toBeNull();
    expect((await asStranger.from("customer_users").select("id")).data).toEqual([]);
    expect((await asStranger.from("customers").select("id")).data).toEqual([]);
    expect((await asStranger.from("quotes").select("id")).data).toEqual([]);
    expect((await asStranger.from("invoices").select("id")).data).toEqual([]);
  }, 90_000);
});

describe.runIf(local)("REDIRECT / TOKEN SAFETY", () => {
  it("49-53: mails carry only our own route, odd parameters are refused, and a token never opens another account", async () => {
    const email = mail("tokens");
    deliverEmail.mockClear();
    await invitePortalMember(alfaId, email);
    await remember(email);
    const sent = deliverEmail.mock.calls[0]![0] as { text: string; html: string };
    const links = [...sent.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
    for (const link of links) {
      expect(link).toMatch(/^https:\/\/ymcreations\.com(\/|$)|^mailto:|^tel:/);
      expect(link).not.toMatch(/redirect|next=|return/i);
    }
    const token = lastToken();

    /* 50-52 */
    visitor = fresh();
    for (const bad of [
      { tokenHash: token.tokenHash + "x", type: token.type },
      { tokenHash: token.tokenHash, type: "signup" },
      { tokenHash: "", type: token.type },
      { tokenHash: token.tokenHash, type: "" },
    ]) {
      const result = await setPassword(bad, "token-safety-pw-001");
      expect(result.kind).toBe("invalid_link");
      expectPlainDutch(result.error);
    }
    expect((await resolvePortalAccess(visitor, undefined)).state).toBe("anonymous");

    /* 53: the Auth server treats magiclink and recovery as the same slot; whichever type is named, the token opens only its own account. */
    visitor = fresh();
    const verified = await visitor.auth.verifyOtp({ token_hash: token.tokenHash, type: "recovery" });
    if (!verified.error) expect(verified.data.user?.email).toBe(email);
  }, 60_000);
});
