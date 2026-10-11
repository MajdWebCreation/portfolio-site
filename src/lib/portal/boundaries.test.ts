import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The portal's boundaries, checked against the source rather than trusted.
 *
 * A customer's pages carry no tracking of any kind, the elevated Auth client
 * never reaches the browser, and there is no sign-up anywhere: an account
 * exists because an admin invited it.
 */
const root = join(process.cwd(), "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

const all = sourceFiles(root).map((path) => ({ path: path.replace(root, "src"), source: readFileSync(path, "utf8") }));
const portal = all.filter(({ path }) => /^src\/(app\/portaal|components\/portal|lib\/portal)\//.test(path));

describe("the customer portal", () => {
  it("exists in the three places it is allowed to", () => {
    expect(portal.length).toBeGreaterThan(10);
  });

  it("imports no tracking, consent or analytics module", () => {
    const forbidden = [
      /@\/lib\/(analytics|tracking|google|meta|clarity|consent)\b/,
      /@\/components\/consent\b/,
      /\bgtag\b/,
      /\bfbq\b/,
      /clarity\.ms|googletagmanager|connect\.facebook\.net/,
      /next\/script/,
    ];
    for (const file of portal) {
      for (const pattern of forbidden) {
        expect(file.source, `${file.path} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("reads no business table directly in this phase", () => {
    for (const file of portal) {
      expect(file.source, file.path).not.toMatch(/\.from\(["'](customers|quotes|invoices|recurring_services|payments|projects)["']\)/);
    }
  });

  it("offers no sign-up, anywhere in the application", () => {
    for (const file of all) {
      expect(file.source, file.path).not.toMatch(/\.signUp\s*\(/);
      expect(file.source, file.path).not.toMatch(/signInAnonymously/);
    }
  });

  it("has its own root layout that is never indexed", () => {
    const layout = all.find(({ path }) => path === "src/app/portaal/layout.tsx")!;
    expect(layout.source).toContain("index: false");
    expect(layout.source).toContain('import "../globals.css"');
    expect(layout.source).not.toContain("AnalyticsProvider");
    expect(layout.source).not.toContain("ConsentDialog");
  });

  it("is listed where crawlers and the tracking scripts look", () => {
    const robots = all.find(({ path }) => path === "src/app/robots.ts")!;
    expect(robots.source).toContain('"/portaal"');
    const clarity = all.find(({ path }) => path === "src/lib/clarity/client.ts")!;
    expect(clarity.source).toContain('"/portaal"');
    const proxy = all.find(({ path }) => path === "src/proxy.ts")!;
    expect(proxy.source).toContain('"/portaal/:path*"');
  });
});

describe("the elevated Auth client of the portal", () => {
  it("is the only place auth.admin is used, and is server-only", () => {
    const users = all.filter(({ source }) => /\.auth\.admin\b|\)\.auth\.admin/.test(source));
    expect(users.map(({ path }) => path)).toEqual(["src/lib/portal/admin-auth.ts"]);
    const adminAuth = users[0]!;
    expect(adminAuth.source).toContain('typeof window !== "undefined"');
    expect(adminAuth.source).toContain("persistSession: false");
    expect(adminAuth.source).not.toContain("@/lib/supabase/server");
    expect(adminAuth.source).not.toContain("next/headers");
  });

  it("is imported by no client component and by nothing under the portal's own pages", () => {
    const clientFiles = all.filter(({ source }) => /^\s*["']use client["']/.test(source));
    expect(clientFiles.filter(({ source }) => source.includes("portal/admin-auth")).map(({ path }) => path)).toEqual([]);
    expect(portal.filter(({ path, source }) => path.startsWith("src/app/") && source.includes("portal/admin-auth")).map(({ path }) => path)).toEqual([]);
  });

  it("never puts the token anywhere but our own set-password route", () => {
    const mail = all.find(({ path }) => path === "src/lib/portal/mail.ts")!;
    expect(mail.source).toContain("portalSetPasswordPath");
    expect(mail.source).not.toContain("action_link");
    expect(mail.source).not.toContain("redirect_to");
  });
});

describe("the portal's authorization", () => {
  it("never compares an e-mail address to decide access", () => {
    for (const file of portal) {
      expect(file.source, file.path).not.toMatch(/email\s*===?\s*[a-zA-Z.]*customer/i);
    }
  });

  it("guards every page inside the shell", () => {
    const pages = portal.filter(({ path }) => /^src\/app\/portaal\/\(shell\)\/.*page\.tsx$/.test(path));
    expect(pages.length).toBeGreaterThanOrEqual(3);
    for (const page of pages) {
      expect(page.source, page.path).toContain("requirePortalMember()");
    }
  });
});
