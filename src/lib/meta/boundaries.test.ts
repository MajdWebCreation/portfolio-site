import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Conversions API token, checked against the source rather than trusted
 * (the same approach as lib/payments/boundaries.test.ts): one module reads
 * it, no NEXT_PUBLIC_ name carries it, no client component reaches it, and
 * only that module talks to the Graph API.
 */
const root = join(process.cwd(), "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

const files = sourceFiles(root).map((path) => ({ path: path.replace(root, "src"), source: readFileSync(path, "utf8") }));
const clientFiles = files.filter(({ source }) => /^\s*["']use client["']/.test(source));

describe("the Conversions API token", () => {
  it("is read from exactly one module", () => {
    const readers = files.filter(({ source }) => source.includes("process.env.META_CONVERSIONS_API"));
    expect(readers.map(({ path }) => path)).toEqual(["src/lib/meta/capi.ts"]);
  });

  it("is never exposed under a NEXT_PUBLIC name", () => {
    const exposed = files.filter(({ source }) => /NEXT_PUBLIC_[A-Z_]*(CONVERSIONS|CAPI|ACCESS_TOKEN|TEST_EVENT)/.test(source));
    expect(exposed.map(({ path }) => path)).toEqual([]);
  });

  it("is not imported by any client component, nor by the browser-side Meta modules", () => {
    const browserSide = [...clientFiles, ...files.filter(({ path }) => /src\/lib\/meta\/(pixel|track|event-id)\.ts$/.test(path))];
    const offenders = browserSide.filter(({ source }) => source.includes("meta/capi"));
    expect(offenders.map(({ path }) => path)).toEqual([]);
  });

  it("is used through a single request module", () => {
    const callers = files.filter(({ source }) => source.includes("graph.facebook.com"));
    expect(callers.map(({ path }) => path)).toEqual(["src/lib/meta/capi.ts"]);
  });
});
