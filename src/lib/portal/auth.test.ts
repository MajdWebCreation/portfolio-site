import { describe, expect, it } from "vitest";
import { pickCurrentMembership, resolvePortalAccess, type PortalMembership } from "@/lib/portal/auth";

/*
  The access decision with the Auth server and the database replaced. What is
  under test is the decision: a session is not access, the memberships the
  database returns are the only authorization, and a remembered customer is
  only honoured when it is really one of theirs.
*/
const alfa: PortalMembership = { customerId: "cust-a", companyName: "Alfa BV", role: "member", acceptedAt: null };
const beta: PortalMembership = { customerId: "cust-b", companyName: "Beta BV", role: "member", acceptedAt: "2026-10-01T10:00:00.000Z" };

function client(input: { user?: { id: string; email?: string } | null; memberships?: PortalMembership[] | null; rpcError?: boolean }) {
  return {
    auth: {
      getUser: async () => ({ data: { user: input.user ?? null }, error: input.user ? null : { message: "no session" } }),
    },
    rpc: async (name: string) => {
      if (name !== "portal_memberships") throw new Error(`unexpected rpc ${name}`);
      if (input.rpcError) return { data: null, error: { message: "permission denied" } };
      return {
        data: (input.memberships ?? []).map((membership) => ({
          customer_id: membership.customerId,
          company_name: membership.companyName,
          role: membership.role,
          accepted_at: membership.acceptedAt,
        })),
        error: null,
      };
    },
  } as never;
}

describe("resolving portal access", () => {
  it("is anonymous without a session", async () => {
    expect(await resolvePortalAccess(client({ user: null }), undefined)).toEqual({ state: "anonymous" });
  });

  /* An admin, or anyone else, who is signed in but belongs to no customer. */
  it("is a session without access when the database returns no memberships", async () => {
    const access = await resolvePortalAccess(client({ user: { id: "u1", email: "a@example.com" }, memberships: [] }), undefined);
    expect(access).toEqual({ state: "no_membership", userId: "u1", email: "a@example.com" });
  });

  it("treats a failing membership read as no access, never as access", async () => {
    const access = await resolvePortalAccess(client({ user: { id: "u1" }, rpcError: true }), "cust-a");
    expect(access.state).toBe("no_membership");
  });

  it("acts for the only customer a member has", async () => {
    const access = await resolvePortalAccess(client({ user: { id: "u1", email: "a@example.com" }, memberships: [alfa] }), undefined);
    expect(access.state).toBe("member");
    expect(access.state === "member" && access.member.current).toEqual(alfa);
  });

  it("remembers the chosen customer only when it is one of theirs", async () => {
    const theirs = await resolvePortalAccess(client({ user: { id: "u1" }, memberships: [alfa, beta] }), "cust-b");
    expect(theirs.state === "member" && theirs.member.current.customerId).toBe("cust-b");

    const foreign = await resolvePortalAccess(client({ user: { id: "u1" }, memberships: [alfa, beta] }), "cust-z");
    expect(foreign.state === "member" && foreign.member.current.customerId).toBe("cust-a");
  });
});

describe("picking the current customer", () => {
  it("falls back to the first membership", () => {
    expect(pickCurrentMembership([alfa, beta], null)).toEqual(alfa);
    expect(pickCurrentMembership([alfa, beta], "nonsense")).toEqual(alfa);
    expect(pickCurrentMembership([alfa, beta], "cust-b")).toEqual(beta);
    expect(pickCurrentMembership([], "cust-a")).toBeUndefined();
  });
});
