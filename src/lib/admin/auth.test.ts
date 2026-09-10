import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAdminAccess } from "@/lib/admin/auth";
import type { Database } from "@/lib/supabase/database.types";

type ProfileRow = Partial<Database["public"]["Tables"]["admin_profiles"]["Row"]>;

/**
 * A Supabase client with just enough surface for the decision under test:
 * one auth answer and one row answer. Every case below is a way in which a
 * request can fail to be an admin request; only the last one is not.
 */
function fakeClient(options: {
  user?: { id: string; email?: string | null } | null;
  userError?: boolean;
  profile?: ProfileRow | null;
  profileError?: boolean;
}) {
  const calls: { userId?: unknown } = {};

  const client = {
    auth: {
      getUser: async () => ({
        data: { user: options.userError ? null : (options.user ?? null) },
        error: options.userError ? { message: "invalid token" } : null,
      }),
    },
    from: () => ({
      select: () => ({
        eq: (_column: string, value: unknown) => {
          calls.userId = value;
          return {
            maybeSingle: async () => ({
              data: options.profileError ? null : (options.profile ?? null),
              error: options.profileError ? { message: "denied" } : null,
            }),
          };
        },
      }),
    }),
  };

  return { client: client as unknown as SupabaseClient<Database>, calls };
}

const activeProfile: ProfileRow = {
  user_id: "user-1",
  display_name: "Majd",
  is_active: true,
};

describe("resolveAdminAccess", () => {
  it("treats a request without a session as anonymous", async () => {
    const { client } = fakeClient({ user: null });
    expect(await resolveAdminAccess(client)).toEqual({ state: "anonymous" });
  });

  it("treats a rejected token as anonymous, not as an error", async () => {
    const { client } = fakeClient({ userError: true });
    expect(await resolveAdminAccess(client)).toEqual({ state: "anonymous" });
  });

  it("denies a signed-in user without an admin row", async () => {
    const { client } = fakeClient({ user: { id: "user-1", email: "someone@example.com" }, profile: null });
    expect(await resolveAdminAccess(client)).toEqual({ state: "denied", email: "someone@example.com" });
  });

  it("denies a deactivated admin", async () => {
    const { client } = fakeClient({
      user: { id: "user-1", email: "old@example.com" },
      profile: { ...activeProfile, is_active: false },
    });
    expect(await resolveAdminAccess(client)).toEqual({ state: "denied", email: "old@example.com" });
  });

  it("denies when the profile lookup fails, rather than assuming access", async () => {
    const { client } = fakeClient({ user: { id: "user-1", email: "a@example.com" }, profileError: true });
    expect(await resolveAdminAccess(client)).toEqual({ state: "denied", email: "a@example.com" });
  });

  it("admits a user with an active admin row", async () => {
    const { client } = fakeClient({ user: { id: "user-1", email: "admin@example.com" }, profile: activeProfile });
    expect(await resolveAdminAccess(client)).toEqual({
      state: "admin",
      admin: { userId: "user-1", email: "admin@example.com", displayName: "Majd" },
    });
  });

  it("looks the profile up by the id from the verified session", async () => {
    const { client, calls } = fakeClient({ user: { id: "user-1" }, profile: activeProfile });
    await resolveAdminAccess(client);
    expect(calls.userId).toBe("user-1");
  });
});
