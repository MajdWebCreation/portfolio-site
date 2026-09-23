import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
  Masking is markup, so it is checked in the source: the containers that
  hold visitor input or customer data carry data-clarity-mask="true", and
  nothing anywhere opts back out with data-clarity-unmask. The rendered
  pages are checked in a browser as well (see the handoff document).
*/
const root = join(process.cwd(), "src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(tsx?|jsx?)$/.test(name) ? [path] : [];
  });
}

describe("Clarity masking", () => {
  it.each([
    "components/contact-form.tsx",
    "components/project-planner.tsx",
    "app/[locale]/incasso/[token]/page.tsx",
    "app/[locale]/betaling/afgerond/page.tsx",
    "app/[locale]/betaling/incasso-afgerond/page.tsx",
  ])("masks %s as a whole", (file) => {
    expect(readFileSync(join(root, file), "utf8")).toContain('data-clarity-mask="true"');
  });

  it("never unmasks anything", () => {
    const offenders = files(root).filter((path) => !path.endsWith("masking.test.ts") && readFileSync(path, "utf8").includes("data-clarity-unmask"));
    expect(offenders).toEqual([]);
  });

  it("never identifies a visitor to Clarity", () => {
    const offenders = files(root).filter(
      (path) => !path.endsWith(".test.ts") && !path.endsWith(".test.tsx") && /clarity\(\s*["'](identify|set)["']/.test(readFileSync(path, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
