import { describe, expect, it } from "vitest";
import { buildReportOnlyPolicy } from "@/lib/csp/policy";

const policy = buildReportOnlyPolicy({ development: false, supabaseHost: "abcd.supabase.co" });
const directive = (name: string) =>
  policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `))
    ?.split(/\s+/)
    .slice(1) ?? [];

describe("the report-only policy", () => {
  it("allows Clarity's tag and collection only where needed", () => {
    expect(directive("script-src")).toContain("https://*.clarity.ms");
    expect(directive("connect-src")).toContain("https://*.clarity.ms");
    expect(directive("img-src")).not.toContain("https://*.clarity.ms");
    expect(directive("default-src")).toEqual(["'self'"]);
  });

  it("does not open Microsoft's cookie-sync host or anything broad", () => {
    expect(policy).not.toContain("c.bing.com");
    expect(policy).not.toMatch(/(^|\s)\*(\s|;|$)/);
    expect(policy).not.toMatch(/(^|\s)https:(\s|;|$)/);
    expect(policy).not.toMatch(/https:\/\/\*\.(ms|com|bing\.com|microsoft\.com)(\s|;|$)/);
    for (const name of ["script-src", "connect-src", "img-src"]) {
      for (const source of directive(name)) {
        if (source.includes("*")) expect(source, `${name} ${source}`).toMatch(/^https:\/\/\*\.(clarity\.ms|google-analytics\.com|analytics\.google\.com)$/);
      }
    }
  });

  it("keeps the existing sources intact", () => {
    expect(directive("script-src")).toEqual(expect.arrayContaining(["'self'", "'unsafe-inline'", "https://www.googletagmanager.com"]));
    expect(directive("connect-src")).toEqual(
      expect.arrayContaining(["'self'", "https://*.google-analytics.com", "https://*.analytics.google.com", "https://www.googletagmanager.com", "https://abcd.supabase.co"]),
    );
    expect(directive("img-src")).toEqual(expect.arrayContaining(["https://abcd.supabase.co", "https://*.google-analytics.com"]));
    expect(directive("form-action")).toEqual(["'self'", "https://www.mollie.com"]);
    expect(directive("frame-ancestors")).toEqual(["'none'"]);
    expect(policy).toContain("report-uri /api/csp-report");
    expect(directive("script-src")).not.toContain("'unsafe-eval'");
    expect(buildReportOnlyPolicy({ development: true, supabaseHost: null })).toContain("'unsafe-eval'");
  });
});
