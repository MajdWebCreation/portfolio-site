import { describe, expect, it } from "vitest";
import {
  communicationBodyHasExpired,
  fiscalCategories,
  inquiryHasExpired,
  leadHasExpired,
  redactableCategories,
  retentionCutoff,
  retentionRedactedBody,
} from "@/lib/retention/policy";
import { communicationCategoryOrder } from "@/lib/admin/communications/types";

const now = new Date("2026-09-23T05:00:00.000Z");
const cutoff = retentionCutoff(now);
const none = new Set<string>();

describe("the cutoff", () => {
  it("is twelve months before now", () => {
    expect(cutoff).toBe("2025-09-23T05:00:00.000Z");
  });
});

describe("a website request", () => {
  const quiet = { id: "inq-1", received_at: "2025-06-01T10:00:00.000Z", updated_at: "2025-06-01T10:00:00.000Z" };

  it("goes after a year without activity", () => {
    expect(inquiryHasExpired(quiet, cutoff, none)).toBe(true);
  });

  it("stays while it was touched within the year", () => {
    expect(inquiryHasExpired({ ...quiet, updated_at: "2025-12-01T10:00:00.000Z" }, cutoff, none)).toBe(false);
  });

  it("stays at exactly the cutoff", () => {
    expect(inquiryHasExpired({ ...quiet, updated_at: cutoff }, cutoff, none)).toBe(false);
  });

  /* A request that became a customer is part of that customer's dossier. */
  it("stays when it became a customer, however old", () => {
    expect(inquiryHasExpired(quiet, cutoff, new Set(["inq-1"]))).toBe(false);
  });
});

describe("a lead", () => {
  const quiet = {
    id: "lead-1",
    status: "lost",
    created_at: "2025-01-10T10:00:00.000Z",
    updated_at: "2025-03-10T10:00:00.000Z",
    last_contact_at: null,
    next_follow_up_at: null,
  };

  it("goes when lost and quiet for a year", () => {
    expect(leadHasExpired(quiet, cutoff, none)).toBe(true);
  });

  it("goes when merely inactive for a year, whatever its status", () => {
    for (const status of ["new", "to_contact", "contacted", "follow_up", "interested", "quote"]) {
      expect(leadHasExpired({ ...quiet, status }, cutoff, none)).toBe(true);
    }
  });

  it("stays when won", () => {
    expect(leadHasExpired({ ...quiet, status: "won" }, cutoff, none)).toBe(false);
  });

  it("stays when it became a customer", () => {
    expect(leadHasExpired(quiet, cutoff, new Set(["lead-1"]))).toBe(false);
  });

  it("stays while a contact within the year is recorded", () => {
    expect(leadHasExpired({ ...quiet, last_contact_at: "2026-02-01T10:00:00.000Z" }, cutoff, none)).toBe(false);
  });

  /* A follow-up on the calendar is a running process, even on an untouched row. */
  it("stays while a follow-up is planned", () => {
    expect(leadHasExpired({ ...quiet, next_follow_up_at: "2026-10-15T09:00:00.000Z" }, cutoff, none)).toBe(false);
  });

  it("goes when the planned follow-up itself is more than a year past", () => {
    expect(leadHasExpired({ ...quiet, next_follow_up_at: "2025-04-01T09:00:00.000Z" }, cutoff, none)).toBe(true);
  });
});

describe("a customer mail", () => {
  const old = {
    id: "comm-1",
    category: "quote_sent",
    created_at: "2025-05-01T10:00:00.000Z",
    sent_at: "2025-05-01T10:00:30.000Z",
    body_text: "Beste Anna, hierbij de offerte.",
  };

  it("loses its body a year after it was sent, when it is not administration", () => {
    for (const category of redactableCategories) {
      expect(communicationBodyHasExpired({ ...old, category }, cutoff)).toBe(true);
    }
  });

  it("keeps its body for the financial administration, however old", () => {
    for (const category of fiscalCategories) {
      expect(communicationBodyHasExpired({ ...old, category }, cutoff)).toBe(false);
    }
  });

  it("keeps its body within the year", () => {
    expect(communicationBodyHasExpired({ ...old, sent_at: "2026-01-01T10:00:00.000Z" }, cutoff)).toBe(false);
  });

  it("falls back to when it was written if the send moment is missing", () => {
    expect(communicationBodyHasExpired({ ...old, sent_at: null }, cutoff)).toBe(true);
    expect(communicationBodyHasExpired({ ...old, sent_at: null, created_at: "2026-05-01T10:00:00.000Z" }, cutoff)).toBe(false);
  });

  it("is not redacted twice", () => {
    expect(communicationBodyHasExpired({ ...old, body_text: retentionRedactedBody }, cutoff)).toBe(false);
  });

  /* Every category the system can write has been placed on one side or the other. */
  it("has every category classified", () => {
    const classified = new Set([...fiscalCategories, ...redactableCategories]);
    for (const category of communicationCategoryOrder) {
      expect(classified.has(category)).toBe(true);
    }
    for (const category of fiscalCategories) {
      expect(redactableCategories).not.toContain(category);
    }
  });
});
