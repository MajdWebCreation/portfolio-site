import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getServicesForLocale, serviceDefinitions } from "@/lib/content/services";

/*
  scripts/import-articles.mjs writes article bodies and checks their internal
  links against an allow-list. A former service slug must not be in either:
  the redirect keeps old links working, but a new import must not create
  them, and the allow-list must accept the current path.
*/
const script = readFileSync(new URL("../../../scripts/import-articles.mjs", import.meta.url), "utf8");

describe("the article import script", () => {
  it("never links to a former Dutch service slug", () => {
    const formerPaths = Object.values(serviceDefinitions).flatMap((service) => (service.formerSlugs?.nl ?? []).map((slug) => `/nl/diensten/${slug}`));
    expect(formerPaths).toContain("/nl/diensten/bedrijfswebsite");
    for (const path of formerPaths) expect(script).not.toContain(path);
  });

  it("allow-lists the current path of the website service and links to it", () => {
    const key = Object.values(serviceDefinitions).find((service) => service.formerSlugs?.nl?.includes("bedrijfswebsite"))?.key;
    const current = getServicesForLocale("nl").find((service) => service.key === key);
    expect(current?.path).toBe("/nl/diensten/website-laten-maken");
    expect(script).toContain(`"${current?.path}",`);
    expect(script).toContain(`](${current?.path})`);
  });
});
