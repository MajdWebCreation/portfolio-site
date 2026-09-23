import { describe, expect, it } from "vitest";
import { clarityAllowedOnPath, clarityConsentSignal, clarityLoaderScript, normalizeClarityProjectId, shouldLoadClarity } from "@/lib/clarity/client";

describe("where Clarity may run", () => {
  it.each(["/nl", "/en", "/nl/tarieven", "/en/pricing", "/nl/diensten/bedrijfswebsite", "/nl/projectplanner", "/nl/contact", "/nl/blog/wat-kost-een-website", "/nl/betalingsvoorwaarden-uitleg"])(
    "allows %s",
    (path) => {
      expect(clarityAllowedOnPath(path)).toBe(true);
    },
  );

  it.each([
    "/admin",
    "/admin/analytics",
    "/admin/login",
    "/nl/incasso/abc123token",
    "/en/incasso/abc123token",
    "/nl/betaling/afgerond",
    "/nl/betaling/afgerond?factuur=YM-F-2026-001",
    "/en/betaling/incasso-afgerond",
    "/nl/betaling",
    "/incasso/abc",
  ])("refuses %s", (path) => {
    expect(clarityAllowedOnPath(path)).toBe(false);
  });

  it("needs a project, a yes to recordings, and an allowed route, all three", () => {
    const ok = { projectId: "abc123xyz", recordingsConsent: true, pathname: "/nl" };
    expect(shouldLoadClarity(ok)).toBe(true);
    expect(shouldLoadClarity({ ...ok, projectId: undefined })).toBe(false);
    expect(shouldLoadClarity({ ...ok, recordingsConsent: false })).toBe(false);
    expect(shouldLoadClarity({ ...ok, pathname: "/nl/incasso/t" })).toBe(false);
  });
});

describe("the loader", () => {
  it("loads the tag from www.clarity.ms and queues Consent V2 with advertising denied", () => {
    const script = clarityLoaderScript("abc123xyz");
    expect(script).toContain('"https://www.clarity.ms/tag/"+i');
    expect(script).toContain('"abc123xyz"');
    expect(script).toContain('window.clarity("consentv2",{"ad_Storage":"denied","analytics_Storage":"granted"});');
    expect(clarityConsentSignal).toEqual({ ad_Storage: "denied", analytics_Storage: "granted" });
  });

  it("never identifies anyone or sets tags", () => {
    const script = clarityLoaderScript("abc123xyz");
    expect(script).not.toMatch(/identify|"set"|upgrade|consent",\s*true/);
    expect(script).not.toContain('"granted","analytics_Storage"');
  });

  it("refuses a project id that is not a plain id, so nothing can be injected", () => {
    expect(normalizeClarityProjectId(' abc123xyz ')).toBe("abc123xyz");
    for (const bad of ["", "ab", 'abc");alert(1);//', "abc 123", "abc-123-xyz"]) expect(normalizeClarityProjectId(bad)).toBeUndefined();
    expect(() => clarityLoaderScript('x");alert(1)//')).toThrow();
  });
});
