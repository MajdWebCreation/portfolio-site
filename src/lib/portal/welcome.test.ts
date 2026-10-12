import { describe, expect, it, vi } from "vitest";
import { settlePortalWelcome, welcomeIdempotencyKey, welcomeWorthChecking, type PortalWelcomeState, type WelcomeStore } from "@/lib/portal/welcome";

/*
  The welcome mail's bookkeeping, without an Auth server or a mail provider:
  due before sending, sent after, once, and retried while it failed.
*/
function store(initial: PortalWelcomeState = {}, sent = true) {
  let state = { ...initial };
  const deliveries: { to: string; key: string }[] = [];
  const api: WelcomeStore & { state: () => PortalWelcomeState; deliveries: typeof deliveries; fail: (value: boolean) => void } = {
    read: vi.fn(async () => ({ ...state })),
    write: vi.fn(async (_id: string, next: PortalWelcomeState) => {
      state = { ...next };
    }),
    send: vi.fn(async (to: string, key: string) => {
      deliveries.push({ to, key });
      return sent ? { sent: true } : { sent: false, reason: "Resend 503" };
    }),
    state: () => state,
    deliveries,
    fail: (value: boolean) => {
      sent = !value;
    },
  };
  return api;
}

const user = { id: "user-1", email: "jan@alfa.test" };
const now = new Date("2026-10-13T09:00:00.000Z");

describe("the portal welcome mail", () => {
  it("is sent once on the first setup: due first, then sent", async () => {
    const s = store();
    expect(await settlePortalWelcome(s, user, true, now)).toBe("sent");
    expect(s.deliveries).toEqual([{ to: "jan@alfa.test", key: "portal-welcome/user-1" }]);
    expect(s.state()).toEqual({ dueAt: now.toISOString(), sentAt: now.toISOString() });
    expect(s.write).toHaveBeenNthCalledWith(1, "user-1", { dueAt: now.toISOString() });

    expect(await settlePortalWelcome(s, user, true, now)).toBe("already_sent");
    expect(s.deliveries).toHaveLength(1);
  });

  it("is never started by a sign-in, a reset or a change", async () => {
    const s = store();
    expect(await settlePortalWelcome(s, user, false, now)).toBe("not_due");
    expect(s.deliveries).toEqual([]);
    expect(s.write).not.toHaveBeenCalled();
  });

  it("stays due when the mail fails, and the next attempt sends it once", async () => {
    const s = store({}, false);
    expect(await settlePortalWelcome(s, user, true, now)).toBe("failed");
    expect(s.state()).toEqual({ dueAt: now.toISOString() });

    s.fail(false);
    const later = new Date("2026-10-14T09:00:00.000Z");
    expect(await settlePortalWelcome(s, user, false, later)).toBe("sent");
    expect(s.state()).toEqual({ dueAt: now.toISOString(), sentAt: later.toISOString() });
    expect(s.deliveries.map((delivery) => delivery.key)).toEqual(["portal-welcome/user-1", "portal-welcome/user-1"]);
    expect(await settlePortalWelcome(s, user, false, later)).toBe("already_sent");
  });

  it("propagates a failing store to the caller, who swallows it", async () => {
    const s = store();
    (s.read as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("auth down"));
    await expect(settlePortalWelcome(s, user, true, now)).rejects.toThrow("auth down");
    expect(s.deliveries).toEqual([]);
  });

  it("asks the Auth server only when the session says there may be something to do", () => {
    expect(welcomeWorthChecking({}, false)).toBe(false);
    expect(welcomeWorthChecking({}, true)).toBe(true);
    expect(welcomeWorthChecking({ dueAt: "x" }, false)).toBe(true);
    expect(welcomeWorthChecking({ dueAt: "x", sentAt: "y" }, true)).toBe(false);
    expect(welcomeIdempotencyKey("abc")).toBe("portal-welcome/abc");
  });
});
