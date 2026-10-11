import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  Inviting a portal member, with the Auth server, the database function and
  the mailer replaced. What is under test is the order and the recovery: the
  auth user first (one per address), the membership second (idempotent, says
  what it found), the mail last -- and that a failure anywhere leaves a state
  the next attempt finishes.
*/
type Membership = { id: string; user_id: string; customer_id: string; invited_email: string; accepted_at: string | null; revoked_at: string | null };

let memberships: Membership[];
let authUsers: Map<string, string>; // email -> id
const events: { action: string; customer_id: string }[] = [];
const generateLink = vi.fn();
const deliver = vi.fn();
let customer: { id: string; companyName: string } | undefined;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/access", () => ({ requireAdmin: async () => ({ userId: "admin-1", email: "admin@ym.test", displayName: "Admin" }) }));
vi.mock("@/lib/admin/customers/repository", () => ({ getCustomer: async () => customer }));
vi.mock("@/lib/admin/communications/provider", () => ({ deliverEmail: (...args: unknown[]) => deliver(...args) }));
vi.mock("@/lib/admin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/db")>()),
  adminDb: async () => ({
    /* The one read the action does: has this account accepted any membership? */
    from: (table: string) => {
      if (table !== "customer_users") throw new Error(`unexpected table ${table}`);
      let column = "";
      let value = "";
      let acceptedOnly = false;
      const query = {
        select: () => query,
        eq: (name: string, given: string) => {
          column = name;
          value = given;
          return query;
        },
        not: () => {
          acceptedOnly = true;
          return query;
        },
        limit: async () => ({
          data: memberships
            .filter((m) => (column === "invited_email" ? m.invited_email === value : m.user_id === value))
            .filter((m) => !acceptedOnly || m.accepted_at !== null)
            .map((m) => ({ id: m.id, user_id: m.user_id })),
          error: null,
        }),
      };
      return query;
    },
    /* The two SECURITY INVOKER functions, as the migration defines them. */
    rpc: async (name: string, args: Record<string, string>) => {
      if (name === "admin_upsert_portal_membership") {
        const existing = memberships.find((m) => m.user_id === args.p_user_id && m.customer_id === args.p_customer_id);
        let outcome: string;
        let row: Membership;
        if (!existing) {
          row = { id: `m-${memberships.length + 1}`, user_id: args.p_user_id, customer_id: args.p_customer_id, invited_email: args.p_email, accepted_at: null, revoked_at: null };
          memberships.push(row);
          outcome = "invited";
        } else if (existing.revoked_at) {
          existing.revoked_at = null;
          row = existing;
          outcome = "reactivated";
        } else if (!existing.accepted_at) {
          row = existing;
          outcome = "reinvited";
        } else {
          row = existing;
          outcome = "already_member";
        }
        if (outcome !== "already_member") events.push({ action: `member_${outcome}`, customer_id: args.p_customer_id });
        return { data: { membership_id: row.id, outcome, accepted: row.accepted_at !== null }, error: null };
      }
      if (name === "admin_revoke_portal_membership") {
        const row = memberships.find((m) => m.id === args.p_membership_id && m.customer_id === args.p_customer_id);
        if (!row) return { data: null, error: { message: "Onbekend lidmaatschap." } };
        if (!row.revoked_at) {
          row.revoked_at = "2026-10-12T10:00:00.000Z";
          events.push({ action: "member_revoked", customer_id: row.customer_id });
        }
        return { data: { membership_id: row.id, revoked_at: row.revoked_at }, error: null };
      }
      return { data: null, error: { message: `rpc ${name} not provided` } };
    },
  }),
}));
/* The Auth server: one user per address, a token for a new one. */
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      admin: {
        generateLink: (params: { type: string; email: string }) => generateLink(params),
      },
    },
  }),
}));

const { invitePortalMember, revokePortalMember } = await import("@/lib/admin/portal-members/actions");

function authServer() {
  generateLink.mockImplementation(async ({ type, email }: { type: string; email: string }) => {
    const known = authUsers.get(email);
    if (type === "invite") {
      if (known) return { data: { user: null, properties: null }, error: { code: "email_exists", message: "A user with this email address has already been registered" } };
      const id = `user-${authUsers.size + 1}`;
      authUsers.set(email, id);
      return { data: { user: { id }, properties: { hashed_token: `invite-token-${id}` } }, error: null };
    }
    if (!known) return { data: { user: null, properties: null }, error: { code: "user_not_found", message: "User not found" } };
    return { data: { user: { id: known }, properties: { hashed_token: `${type}-token-${known}` } }, error: null };
  });
}

const mailed = () => deliver.mock.calls.map(([mail]) => mail as { to: string; subject: string; text: string });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
  memberships = [];
  authUsers = new Map();
  events.length = 0;
  customer = { id: "cust-1", companyName: "Alfa BV" };
  authServer();
  deliver.mockResolvedValue({ sent: true, sentAt: "2026-10-12T09:00:00.000Z", messageId: "resend-1" });
});

describe("inviting a new person", () => {
  it("makes the auth user, the membership and the mail, in that order", async () => {
    const result = await invitePortalMember("cust-1", " Nieuw@Example.com ");

    expect(result).toEqual({ ok: true, value: { outcome: "invited", email: "nieuw@example.com" } });
    expect(authUsers.get("nieuw@example.com")).toBe("user-1");
    expect(memberships).toEqual([expect.objectContaining({ user_id: "user-1", customer_id: "cust-1", invited_email: "nieuw@example.com" })]);
    expect(events).toEqual([{ action: "member_invited", customer_id: "cust-1" }]);
    expect(mailed()).toHaveLength(1);
    expect(mailed()[0]!.to).toBe("nieuw@example.com");
    expect(mailed()[0]!.text).toContain("/portaal/wachtwoord-instellen?token_hash=invite-token-user-1&type=invite");
    expect(mailed()[0]!.text).toContain("Alfa BV");
  });

  it("refuses an unusable address before touching anything", async () => {
    const result = await invitePortalMember("cust-1", "geen-adres");
    expect(result.ok).toBe(false);
    expect(generateLink).not.toHaveBeenCalled();
    expect(memberships).toEqual([]);
  });

  it("puts nothing in the mail but the company name and the link", async () => {
    await invitePortalMember("cust-1", "nieuw@example.com");
    const { text } = mailed()[0]!;
    expect(text).not.toMatch(/factuur|offerte|bedrag|€/i);
  });
});

/*
  The Auth server and the database share no transaction. Whatever fails, the
  next attempt has to finish the job without a second user, a second
  membership or a second record.
*/
describe("a retry after a half-finished invitation", () => {
  it("reuses the auth user and renews the invitation when the mail had failed", async () => {
    deliver.mockResolvedValueOnce({ sent: false, reason: "Resend 503", failure: "error" });
    const first = await invitePortalMember("cust-1", "nieuw@example.com");
    expect(first.ok).toBe(false);
    expect(first.ok === false && first.error).toContain("vastgelegd, maar de mail");
    expect(memberships).toHaveLength(1);

    const second = await invitePortalMember("cust-1", "nieuw@example.com");

    expect(second).toEqual({ ok: true, value: { outcome: "reinvited", email: "nieuw@example.com" } });
    expect(authUsers.size).toBe(1);
    expect(memberships).toHaveLength(1);
    expect(events.map((e) => e.action)).toEqual(["member_invited", "member_reinvited"]);
    /* A fresh token for a person who never set a password. */
    expect(mailed()).toHaveLength(2);
    expect(mailed()[1]!.text).toContain("type=magiclink");
  });

  it("is told plainly when the person already has access, and mails nothing", async () => {
    await invitePortalMember("cust-1", "lid@example.com");
    memberships[0]!.accepted_at = "2026-10-12T09:30:00.000Z";
    deliver.mockClear();

    const again = await invitePortalMember("cust-1", "lid@example.com");

    expect(again).toEqual({ ok: true, value: { outcome: "already_member", email: "lid@example.com" } });
    expect(deliver).not.toHaveBeenCalled();
    expect(memberships).toHaveLength(1);
  });
});

describe("an existing account", () => {
  it("is given access to a second customer without a new user or a password link", async () => {
    await invitePortalMember("cust-1", "iemand@example.com");
    memberships[0]!.accepted_at = "2026-10-12T09:30:00.000Z";
    customer = { id: "cust-2", companyName: "Beta BV" };
    deliver.mockClear();

    const result = await invitePortalMember("cust-2", "iemand@example.com");

    expect(result).toEqual({ ok: true, value: { outcome: "invited", email: "iemand@example.com" } });
    expect(authUsers.size).toBe(1);
    /* The address was known here; the Auth server was not asked again, and no stray token was minted. */
    expect(generateLink).toHaveBeenCalledTimes(1);
    expect(memberships.map((m) => m.customer_id)).toEqual(["cust-1", "cust-2"]);
    expect(mailed()[0]!.text).toContain("Beta BV");
    expect(mailed()[0]!.text).toContain("/portaal/inloggen");
    expect(mailed()[0]!.text).not.toContain("token_hash");
  });

  /* Invited twice before ever setting a password: the second customer still comes with a link. */
  it("still gets a password link for a second customer when it never set one", async () => {
    await invitePortalMember("cust-1", "iemand@example.com");
    customer = { id: "cust-2", companyName: "Beta BV" };
    deliver.mockClear();

    await invitePortalMember("cust-2", "iemand@example.com");

    expect(authUsers.size).toBe(1);
    expect(mailed()[0]!.text).toContain("token_hash=magiclink-token-user-1&type=magiclink");
  });
});

describe("ending and restoring access", () => {
  it("revokes by date, keeps the row and the account, and can give access back", async () => {
    await invitePortalMember("cust-1", "lid@example.com");
    memberships[0]!.accepted_at = "2026-10-12T09:30:00.000Z";

    const revoked = await revokePortalMember("cust-1", "m-1");
    expect(revoked.ok).toBe(true);
    expect(memberships[0]!.revoked_at).not.toBeNull();
    expect(authUsers.size).toBe(1);

    deliver.mockClear();
    const back = await invitePortalMember("cust-1", "lid@example.com");

    expect(back).toEqual({ ok: true, value: { outcome: "reactivated", email: "lid@example.com" } });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]!.revoked_at).toBeNull();
    expect(events.map((e) => e.action)).toEqual(["member_invited", "member_revoked", "member_reactivated"]);
    /* The person has a password: the door is opened, no token is minted. */
    expect(mailed()[0]!.text).toContain("/portaal/inloggen");
    expect(mailed()[0]!.text).not.toContain("token_hash");
  });

  it("reports an unknown membership, and one named under the wrong customer", async () => {
    await invitePortalMember("cust-1", "lid@example.com");
    expect(await revokePortalMember("cust-1", "m-404")).toEqual({ ok: false, error: "Onbekend lidmaatschap." });
    expect(await revokePortalMember("cust-2", "m-1")).toEqual({ ok: false, error: "Onbekend lidmaatschap." });
    expect(memberships[0]!.revoked_at).toBeNull();
  });
});

describe("when the Auth server refuses", () => {
  it("writes no membership and says why", async () => {
    generateLink.mockResolvedValue({ data: { user: null, properties: null }, error: { code: "over_email_send_rate_limit", message: "rate limited" } });

    const result = await invitePortalMember("cust-1", "nieuw@example.com");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("rate limited");
    expect(memberships).toEqual([]);
    expect(deliver).not.toHaveBeenCalled();
  });
});
