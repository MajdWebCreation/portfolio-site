import { describe, expect, it } from "vitest";
import { MAX_QUERY_LENGTH, sanitizeSearchQuery } from "@/lib/analytics-admin/query-filter";

const kept = (query: string) => sanitizeSearchQuery(query);

describe("search queries that are kept", () => {
  it.each([
    "website laten maken",
    "webshop laten maken amsterdam",
    "ym creations",
    "ymcreations.com",
    "YM-Creations",
    "wat kost een website in 2026",
    "arbeidsongeschiktheidsverzekering website",
    "webdesigner 1012 ab amsterdam",
    "wordpress 6.5 update",
    "iphone 15 pro 256gb",
    "ip65 aanbiedingen",
    "prijs website € 1.500",
    "kvk 12345678",
    "website redesign 2024/2025",
    "café restaurant website",
    "3d configurator three.js",
    "how much does a website cost",
    "next.js vs wordpress",
    "koppeling exact online api",
    "@ymcreations instagram",
    "schoenen-webshop.nl voorbeeld",
    "ÿ ü ß ç — accenten",
  ])("keeps %s", (query) => {
    expect(kept(query)).toEqual({ keep: true, query });
  });

  it("trims and collapses whitespace, and changes nothing else", () => {
    expect(kept("  Website   Laten Maken ")).toEqual({ keep: true, query: "Website Laten Maken" });
  });

  it("keeps a query of exactly the maximum length", () => {
    const query = "website ".repeat(40).slice(0, MAX_QUERY_LENGTH).trim().padEnd(MAX_QUERY_LENGTH, "x");
    expect(query).toHaveLength(MAX_QUERY_LENGTH);
    expect(kept(query).keep).toBe(true);
  });
});

describe("search queries that are dropped", () => {
  it.each([
    ["empty", ""],
    ["whitespace only", "     "],
    ["not a string", 42 as unknown as string],
  ])("drops an %s query", (_label, query) => {
    expect(kept(query)).toEqual({ keep: false });
  });

  it.each([
    ["newline", "website\nlaten maken"],
    ["tab", "website\tlaten maken"],
    ["NUL", "website\u0000"],
    ["escape", "\u001b[31mwebsite"],
    ["zero-width", "web​site"],
    ["bidi override", "website ‮etisbew"],
  ])("drops a query with a control character (%s)", (_label, query) => {
    expect(kept(query).keep).toBe(false);
  });

  it("drops a query over the maximum length", () => {
    expect(kept("w".repeat(MAX_QUERY_LENGTH + 1)).keep).toBe(false);
    expect(kept(`${"website laten maken ".repeat(12)}`).keep).toBe(false);
  });

  it.each(["jan.jansen@example.com", "contact info@ymcreations.com", "mail naar j.de.vries+werk@bedrijf.co.uk", "JAN@VOORBEELD.NL website"])("drops an e-mail address: %s", (query) => {
    expect(kept(query).keep).toBe(false);
  });

  it.each(["0612345678", "06 12 34 56 78", "06-12345678", "+31 6 12345678", "+31 (0)20 123 4567", "0031201234567", "bel 020-1234567 ym creations", "bsn 123456782"])(
    "drops a phone-like number: %s",
    (query) => {
      expect(kept(query).keep).toBe(false);
    },
  );

  it.each(["NL91ABNA0417164300", "nl91 abna 0417 1643 00", "DE89370400440532013000"])("drops an IBAN: %s", (query) => {
    expect(kept(query).keep).toBe(false);
  });

  it.each([
    "https://ymcreations.com/nl/tarieven",
    "http://example.com/reset?token=abc",
    "www.ymcreations.com/nl/contact",
    "ftp://files.example.com/a",
    "zie https://example.com",
  ])("drops a full URL: %s", (query) => {
    expect(kept(query).keep).toBe(false);
  });

  it.each([
    ["JWT", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"],
    ["Stripe-style key", "sk_live_51HxYzAbCdEfGh"],
    ["GitHub token", "ghp_abcdefghijklmnopqrstuvwxyz0123456789"],
    ["Slack token", "xoxb-1234567890-abcdefghij"],
    ["AWS key id", "AKIAIOSFODNN7EXAMPLE"],
    ["Google API key", "AIzaSyD-abcdefghijklmnopqrstuvwxyz12345"],
    ["hex secret", "d41d8cd98f00b204e9800998ecf8427e"],
    ["mixed identifier", "order 7f3k9q2m8x1v5b6n4c0z"],
    ["session id", "sessionid=a8Fk29dLq0Zx7Mn3Bv5Cq1"],
  ])("drops a token or identifier (%s)", (_label, query) => {
    expect(kept(query).keep).toBe(false);
  });
});
