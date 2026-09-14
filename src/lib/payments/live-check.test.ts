import { describe, expect, it } from "vitest";
import type { MollieMethod, MollieProfile } from "@/lib/mollie/client";
import {
  directDebitMethodId,
  idealMethodId,
  liveCheckReady,
  summariseLiveCheck,
} from "@/lib/payments/live-check";

/*
  What the admin is told about the live Mollie connection.

  Two things are being judged, and they are not the same question: is this the
  right account, and can the two payments this integration depends on actually
  happen -- a customer paying an invoice, and a monthly amount being collected
  afterwards. A method that is activated but not usable for its sequence is
  still a blocker.
*/
const profile = (overrides: Partial<MollieProfile> = {}): MollieProfile => ({
  id: "pfl_test",
  mode: "live",
  name: "YM Creations",
  status: "verified",
  ...overrides,
});

const method = (id: string, status: MollieMethod["status"] = "activated"): MollieMethod => ({
  id,
  description: id,
  ...(status ? { status } : {}),
});

/** An account with everything in order. */
const healthy = {
  profile: profile(),
  allMethods: [method(idealMethodId), method(directDebitMethodId), method("creditcard")],
  firstMethods: [method(idealMethodId), method("creditcard")],
  recurringMethods: [method(directDebitMethodId)],
};

describe("an account that is ready", () => {
  const summary = summariseLiveCheck(healthy);

  it("reports the key valid, the profile right and both methods available", () => {
    expect(summary.keyValid).toBe(true);
    expect(summary.profileName).toBe("YM Creations");
    expect(summary.profileMatchesCompany).toBe(true);
    expect(summary.ideal).toMatchObject({ status: "activated", activated: true, usable: true });
    expect(summary.directDebit).toMatchObject({ status: "activated", activated: true, usable: true });
  });

  it("names no blockers", () => {
    expect(summary.blockers).toEqual([]);
    expect(liveCheckReady(summary)).toBe(true);
  });

  /* Spacing and case are not a different company. */
  it("accepts the profile name whatever the spacing", () => {
    expect(summariseLiveCheck({ ...healthy, profile: profile({ name: "  ym   creations " }) }).profileMatchesCompany).toBe(true);
  });
});

describe("the wrong account", () => {
  /*
    The worst outcome of all, because everything else would look like it
    worked: real invoices paid into someone else's Mollie profile.
  */
  it("is a blocker, and names both the found and the expected profile", () => {
    const summary = summariseLiveCheck({ ...healthy, profile: profile({ name: "Andere BV" }) });

    expect(summary.profileMatchesCompany).toBe(false);
    expect(liveCheckReady(summary)).toBe(false);
    expect(summary.blockers[0]).toContain("Andere BV");
    expect(summary.blockers[0]).toContain("YM Creations");
  });

  it("flags a profile that is not verified, or blocked", () => {
    expect(summariseLiveCheck({ ...healthy, profile: profile({ status: "unverified" }) }).blockers.join(" ")).toContain(
      "nog niet geverifieerd",
    );
    expect(summariseLiveCheck({ ...healthy, profile: profile({ status: "blocked" }) }).blockers.join(" ")).toContain(
      "geblokkeerd",
    );
  });

  it("flags a rejected review", () => {
    const summary = summariseLiveCheck({ ...healthy, profile: profile({ review: { status: "rejected" } }) });
    expect(summary.profileReview).toBe("rejected");
    expect(summary.blockers.join(" ")).toContain("afgewezen");
  });

  it("carries a pending review through without calling it a blocker", () => {
    const summary = summariseLiveCheck({ ...healthy, profile: profile({ review: { status: "pending" } }) });
    expect(summary.profileReview).toBe("pending");
    expect(summary.blockers).toEqual([]);
  });
});

describe("iDEAL", () => {
  it("is a blocker when Mollie does not offer it at all", () => {
    const summary = summariseLiveCheck({
      ...healthy,
      allMethods: [method(directDebitMethodId)],
      firstMethods: [],
    });

    expect(summary.ideal).toMatchObject({ status: "unavailable", activated: false, usable: false });
    expect(summary.blockers.join(" ")).toContain("iDEAL wordt niet aangeboden");
    expect(liveCheckReady(summary)).toBe(false);
  });

  /* Each of Mollie's waiting states says something different to do next. */
  it("explains each pending state in its own words", () => {
    const cases = [
      ["pending-boarding", "wacht op gegevens in het dashboard"],
      ["pending-review", "wacht op goedkeuring door Mollie"],
      ["pending-external", "wacht op een externe partij"],
      ["rejected", "afgewezen"],
    ] as const;

    for (const [status, expected] of cases) {
      const summary = summariseLiveCheck({
        ...healthy,
        allMethods: [method(idealMethodId, status), method(directDebitMethodId)],
        firstMethods: [],
      });
      expect(summary.ideal.activated).toBe(false);
      expect(summary.blockers.join(" ")).toContain(expected);
    }
  });

  /* Activated is not the same as usable for the payment we actually make. */
  it("is a blocker when activated but not usable for a first payment", () => {
    const summary = summariseLiveCheck({ ...healthy, firstMethods: [method("creditcard")] });

    expect(summary.ideal).toMatchObject({ activated: true, usable: false });
    expect(summary.blockers.join(" ")).toContain("niet beschikbaar voor de eerste betaling");
  });
});

describe("SEPA Direct Debit", () => {
  it("is a blocker when it is not activated", () => {
    const summary = summariseLiveCheck({
      ...healthy,
      allMethods: [method(idealMethodId), method(directDebitMethodId, "pending-review")],
      recurringMethods: [],
    });

    expect(summary.directDebit).toMatchObject({ status: "pending-review", activated: false, usable: false });
    expect(summary.blockers.join(" ")).toContain("SEPA Incasso wacht op goedkeuring");
  });

  /*
    The one that would bite silently: activated, so the dashboard looks fine,
    but not offered for recurring -- so every monthly collection would fail.
  */
  it("is a blocker when activated but not usable for a recurring collection", () => {
    const summary = summariseLiveCheck({ ...healthy, recurringMethods: [] });

    expect(summary.directDebit).toMatchObject({ activated: true, usable: false });
    expect(summary.blockers.join(" ")).toContain("niet beschikbaar voor automatische incasso");
    expect(liveCheckReady(summary)).toBe(false);
  });
});

describe("what the summary hands to the browser", () => {
  /* No key, no token, no profile id, no customer id. */
  it("carries no identifier or secret", () => {
    const summary = summariseLiveCheck(healthy);
    const serialised = JSON.stringify(summary);

    expect(serialised).not.toContain("pfl_");
    expect(serialised).not.toContain("live_");
    expect(serialised).not.toContain("test_");
    expect(serialised).not.toContain("cst_");
    expect(Object.keys(summary)).not.toContain("id");
  });
});
