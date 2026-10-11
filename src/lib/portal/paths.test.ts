import { describe, expect, it } from "vitest";
import { isPortalPath, isPortalPublicPath } from "@/lib/portal/paths";

describe("portal paths", () => {
  it("knows its own tree", () => {
    expect(isPortalPath("/portaal")).toBe(true);
    expect(isPortalPath("/portaal/account")).toBe(true);
    expect(isPortalPath("/portaalx")).toBe(false);
    expect(isPortalPath("/admin")).toBe(false);
  });

  it("opens only the pages a visitor without a session needs", () => {
    expect(isPortalPublicPath("/portaal/inloggen")).toBe(true);
    expect(isPortalPublicPath("/portaal/wachtwoord-vergeten")).toBe(true);
    expect(isPortalPublicPath("/portaal/wachtwoord-instellen")).toBe(true);
    expect(isPortalPublicPath("/portaal")).toBe(false);
    expect(isPortalPublicPath("/portaal/account")).toBe(false);
    expect(isPortalPublicPath("/portaal/geen-toegang")).toBe(false);
  });
});
