import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/csp-report/route";
import { summariseViolation, violationsIn } from "@/lib/csp/report";
import { createActivationToken } from "@/lib/payments/tokens";

/*
  What a CSP report leaves in the server log, and what it must not.

  A report names the page it happened on, and the page may be one whose URL
  carries a secret: the activation link's token in its path, the payment
  return's state in its query. The log keeps the directive, the blocked
  origin and a path with those removed, and nothing else the browser sent.
*/
const { token } = createActivationToken();
const activationPage = `https://ymcreations.com/nl/incasso/${token}`;
const returnPage = "https://ymcreations.com/nl/betaling/afgerond?state=AbCdEf0123456789.secret&doc=YM-F-2026-000012#done";

let warned: unknown[][];
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warned = [];
  warn = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warned.push(args);
  });
});

afterEach(() => {
  warn.mockRestore();
});

function post(body: unknown, contentType = "application/csp-report") {
  return POST(new Request("http://localhost/api/csp-report", { method: "POST", headers: { "content-type": contentType }, body: JSON.stringify(body) }));
}

const logged = () => JSON.stringify(warned);

describe("what is kept", () => {
  it("names the directive and the blocked origin", () => {
    const summary = summariseViolation({
      "effective-directive": "script-src",
      "blocked-uri": "https://evil.example.com/a/b.js?x=1",
      "document-uri": "https://ymcreations.com/nl/diensten",
    });

    expect(summary).toEqual({ directive: "script-src", blocked: "https://evil.example.com", page: "/nl/diensten" });
  });

  it("keeps a keyword source such as inline or eval as it is", () => {
    expect(summariseViolation({ "violated-directive": "script-src 'self'", "blocked-uri": "inline", "document-uri": "https://ymcreations.com/en" }).blocked).toBe("inline");
    expect(summariseViolation({ effectiveDirective: "style-src", blockedURL: "eval", documentURL: "https://ymcreations.com/en" })).toMatchObject({ directive: "style-src", blocked: "eval" });
  });

  it("reads both the legacy and the Reporting API format", async () => {
    await post({ "csp-report": { "effective-directive": "img-src", "blocked-uri": "https://cdn.example.com/x.png", "document-uri": "https://ymcreations.com/nl" } });
    await post([{ type: "csp-violation", body: { effectiveDirective: "connect-src", blockedURL: "https://api.example.com/v1", documentURL: "https://ymcreations.com/en" } }], "application/reports+json");

    expect(warned).toHaveLength(2);
    expect(warned[0][1]).toEqual({ directive: "img-src", blocked: "https://cdn.example.com", page: "/nl" });
    expect(warned[1][1]).toEqual({ directive: "connect-src", blocked: "https://api.example.com", page: "/en" });
  });
});

describe("what is never logged", () => {
  it("drops the activation token from the page path", async () => {
    await post({ "csp-report": { "effective-directive": "script-src", "blocked-uri": "inline", "document-uri": activationPage } });

    expect(logged()).not.toContain(token);
    expect(warned[0][1]).toMatchObject({ page: "/nl/incasso/[token-verwijderd]" });
  });

  it("drops the query string and fragment of the page", async () => {
    await post({ "csp-report": { "effective-directive": "script-src", "blocked-uri": "inline", "document-uri": returnPage } });

    expect(logged()).not.toContain("state=");
    expect(logged()).not.toContain("secret");
    expect(logged()).not.toContain("YM-F-2026");
    expect(logged()).not.toContain("#done");
    expect(warned[0][1]).toMatchObject({ page: "/nl/betaling/afgerond" });
  });

  it("keeps only the origin of a blocked URL, not its path or query", async () => {
    await post({ "csp-report": { "effective-directive": "connect-src", "blocked-uri": `https://api.example.com/incasso/${token}?key=abc`, "document-uri": "https://ymcreations.com/nl" } });

    expect(logged()).not.toContain(token);
    expect(logged()).not.toContain("key=abc");
    expect(warned[0][1]).toMatchObject({ blocked: "https://api.example.com" });
  });

  it("ignores everything else the browser sent", async () => {
    await post({
      "csp-report": {
        "effective-directive": "script-src",
        "blocked-uri": "inline",
        "document-uri": "https://ymcreations.com/nl",
        referrer: "https://referrer.example.com/private?user=42",
        "script-sample": "document.cookie = 'sb-secret'",
        "source-file": `https://ymcreations.com/nl/incasso/${token}`,
        "original-policy": "default-src 'self'",
        "user-agent": "Mozilla/5.0 (very specific)",
      },
    });

    const text = logged();
    for (const forbidden of ["referrer.example", "user=42", "sb-secret", "script-sample", "original-policy", "Mozilla", token]) {
      expect(text).not.toContain(forbidden);
    }
    expect(Object.keys(warned[0][1] as object).sort()).toEqual(["blocked", "directive", "page"]);
  });

  it("logs nothing for a body that is not a report", async () => {
    await post({ hello: "world" });
    await post("not json at all");
    expect(violationsIn([{ type: "deprecation", body: { id: "x" } }])).toEqual([]);
    expect(warned).toHaveLength(0);
  });

  it("logs at most five entries per request, whatever was sent", async () => {
    const entry = { type: "csp-violation", body: { effectiveDirective: "img-src", blockedURL: "https://x.example.com", documentURL: "https://ymcreations.com/nl" } };
    const response = await post(Array.from({ length: 50 }, () => entry), "application/reports+json");

    expect(response.status).toBe(204);
    expect(warned).toHaveLength(5);
  });
});
